"""
Message relay (Python).

Every RELAY_INTERVAL_MINUTES it drains 'pending' rows from the MySQL outbox and
publishes each to RabbitMQ (exchange `regulations`, key `regulation.rbi.new`),
flipping rows to 'published' / 'failed'. The FastAPI consumer reads the resulting
`compliance.agent` queue.

Ported from the Cloudflare Worker relay (cloudflare/relay/src/index.js); since
RabbitMQ is now local we publish over native AMQP with pika instead of the HTTP API.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

import pika
from apscheduler.schedulers.blocking import BlockingScheduler
from dotenv import load_dotenv

from db import get_connection

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s [relay] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("relay")

AMQP_URL = os.environ.get("CLOUDAMQP_URL", "amqp://guest:guest@localhost:5672/")
EXCHANGE = os.environ.get("EXCHANGE", "regulations")
ROUTING_KEY = os.environ.get("ROUTING_KEY", "regulation.rbi.new")
INTERVAL_MIN = int(os.environ.get("RELAY_INTERVAL_MINUTES", "6"))
BATCH = 50


def _publish_batch(channel, rows: list[dict]) -> tuple[int, int]:
    published = 0
    failed = 0
    conn = get_connection()
    try:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        for row in rows:
            payload = {
                "direction_id": row["direction_id"],
                "title": row["title"],
                "page_url": row["page_url"],
                "pdf_url": row["pdf_url"],
                "published_date": row["published_date"],
                "scraped_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
            }
            try:
                channel.basic_publish(
                    exchange=EXCHANGE,
                    routing_key=ROUTING_KEY,
                    body=json.dumps(payload),
                    properties=pika.BasicProperties(
                        delivery_mode=2,  # persistent
                        content_type="application/json",
                        message_id=str(row["direction_id"]),
                    ),
                )
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE rbi_directions SET status = 'published', published_at = %s WHERE id = %s",
                        (now, row["id"]),
                    )
                conn.commit()
                published += 1
            except Exception as exc:
                conn.rollback()
                log.error("Publish failed for row %s (%s): %s", row["id"], row["direction_id"], exc)
                with conn.cursor() as cur:
                    cur.execute("UPDATE rbi_directions SET status = 'failed' WHERE id = %s", (row["id"],))
                conn.commit()
                failed += 1
    finally:
        conn.close()
    return published, failed


def relay_once() -> None:
    log.info("── relay tick ──")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, direction_id, title, page_url, pdf_url,
                       published_date, created_at
                FROM rbi_directions
                WHERE status = 'pending'
                ORDER BY created_at ASC
                LIMIT %s
                """,
                (BATCH,),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        log.info("Nothing pending.")
        return

    params = pika.URLParameters(AMQP_URL)
    params.socket_timeout = 10
    connection = pika.BlockingConnection(params)
    try:
        channel = connection.channel()
        published, failed = _publish_batch(channel, rows)
        log.info("Relay: %d published, %d failed", published, failed)
    finally:
        connection.close()


def main() -> None:
    log.info("Relay starting — every %d min → exchange '%s' key '%s'", INTERVAL_MIN, EXCHANGE, ROUTING_KEY)
    scheduler = BlockingScheduler(timezone="UTC")
    scheduler.add_job(relay_once, "interval", minutes=INTERVAL_MIN, next_run_time=datetime.now(timezone.utc))
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        log.info("Relay stopped.")


if __name__ == "__main__":
    main()
