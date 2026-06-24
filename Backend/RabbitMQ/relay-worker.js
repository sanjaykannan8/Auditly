/**
 * Auditly — Message Relay Worker
 *
 * Reads pending rows from the D1 `rbi_directions` outbox and publishes each
 * one to RabbitMQ (CloudAMQP) via the CloudAMQP HTTP Publish API.
 * Runs on a cron schedule (recommended: every 1–5 minutes).
 *
 * ─── Wrangler bindings required ────────────────────────────────────────────
 *
 * [[d1_databases]]
 * binding = "DB"
 * database_name = "<your-d1-database-name>"
 * database_id   = "<your-d1-database-id>"
 *
 * [vars]
 * CLOUDAMQP_HTTP_URL = "https://hawk.rmq.cloudamqp.com"   # no trailing slash
 * CLOUDAMQP_VHOST    = "<your-vhost>"                      # usually == username
 *
 * # Set these as secrets via: wrangler secret put CLOUDAMQP_USER
 * CLOUDAMQP_USER = "<secret>"
 * CLOUDAMQP_PASS = "<secret>"
 *
 * ─── Cron trigger ──────────────────────────────────────────────────────────
 *
 * [triggers]
 * crons = ["*\/1 * * * *"]   # every minute
 *
 * ───────────────────────────────────────────────────────────────────────────
 */

const BATCH_SIZE  = 50;
const EXCHANGE    = "regulations";
const ROUTING_KEY = "regulation.rbi.new";

export default {
  /** Entry point for the cron trigger. */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(relayPendingEvents(env));
  },

  /** Manual trigger — hit the worker URL in a browser or with curl to run immediately. */
  async fetch(_request, env, ctx) {
    ctx.waitUntil(relayPendingEvents(env));
    return new Response("Relay triggered — check Worker logs for results.\n", {
      status: 202,
      headers: { "Content-Type": "text/plain" },
    });
  },
};

// ---------------------------------------------------------------------------

async function relayPendingEvents(env) {
  // 1. Fetch a batch of pending directions, oldest first.
  const { results } = await env.DB
    .prepare(
      `SELECT id, direction_id, title, page_url, pdf_url,
              cloudinary_url, content_hash, published_date, created_at
       FROM   rbi_directions
       WHERE  status = 'pending'
       ORDER  BY created_at ASC
       LIMIT  ?`
    )
    .bind(BATCH_SIZE)
    .all();

  if (!results.length) {
    console.log("[relay] No pending events.");
    return;
  }

  console.log(`[relay] Processing ${results.length} pending direction(s)...`);

  const publishUrl = buildPublishUrl(env);
  const authHeader = buildAuthHeader(env);

  const published = [];
  const failed    = [];

  for (const row of results) {
    try {
      await publishOne(row, publishUrl, authHeader);
      published.push(row.id);
    } catch (err) {
      console.error(
        `[relay] FAILED direction_id=${row.direction_id} id=${row.id}: ${err.message}`
      );
      failed.push(row.id);
    }
  }

  // 2. Mark published rows.
  if (published.length) {
    const now          = new Date().toISOString();
    const placeholders = published.map(() => "?").join(",");
    await env.DB
      .prepare(
        `UPDATE rbi_directions
         SET    status = 'published', published_at = ?
         WHERE  id IN (${placeholders})`
      )
      .bind(now, ...published)
      .run();
  }

  // 3. Mark failed rows so the scraper (or an ops engineer) can retry them.
  if (failed.length) {
    const placeholders = failed.map(() => "?").join(",");
    await env.DB
      .prepare(
        `UPDATE rbi_directions
         SET    status = 'failed'
         WHERE  id IN (${placeholders})`
      )
      .bind(...failed)
      .run();
  }

  console.log(
    `[relay] Done — published: ${published.length}, failed: ${failed.length}`
  );
}

// ---------------------------------------------------------------------------

async function publishOne(row, publishUrl, authHeader) {
  const payload = JSON.stringify({
    direction_id:   row.direction_id,
    title:          row.title,
    page_url:       row.page_url,
    pdf_url:        row.pdf_url,
    cloudinary_url: row.cloudinary_url ?? null,
    content_hash:   row.content_hash,
    published_date: row.published_date ?? null,
    scraped_at:     row.created_at,
  });

  const body = JSON.stringify({
    properties: {
      delivery_mode:   2,                   // persistent — survives broker restart
      content_type:    "application/json",
      message_id:      String(row.id),
      timestamp:       Math.floor(Date.now() / 1000),
      headers: {
        source:       "rbi",
        direction_id: row.direction_id,
      },
    },
    routing_key:      ROUTING_KEY,
    payload,
    payload_encoding: "string",
  });

  const res = await fetch(publishUrl, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": authHeader,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`CloudAMQP HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();

  // CloudAMQP returns { "routed": true } when the message reached at least one queue.
  // If routed is false the exchange exists but no queue is bound — topology is missing.
  if (!json.routed) {
    throw new Error(
      `Message not routed — verify that 'compliance.agent' is bound to '${EXCHANGE}' ` +
      `with routing key '${ROUTING_KEY}'. Run topology.py to fix this.`
    );
  }
}

// ---------------------------------------------------------------------------

function buildPublishUrl(env) {
  const vhost = encodeURIComponent(env.CLOUDAMQP_VHOST);
  return `${env.CLOUDAMQP_HTTP_URL}/api/exchanges/${vhost}/${EXCHANGE}/publish`;
}

function buildAuthHeader(env) {
  return "Basic " + btoa(`${env.CLOUDAMQP_USER}:${env.CLOUDAMQP_PASS}`);
}
