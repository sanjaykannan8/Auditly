"""
RabbitMQ consumer — entry point.

Listens on the `compliance.agent` queue. For each message, runs the
LangGraph pipeline (pdf_parser → map_generator → validator) and ACKs
on success or NACKs (no-requeue → DLQ) on unrecoverable failure.

The pipeline call can take minutes (local Ollama). Running it directly inside
pika's on_message callback blocks the IO loop so no heartbeats go out, and the
broker/OS eventually kills the TCP connection mid-processing (before the
ack + Postgres persist step ever runs). To avoid that, each message is handed
off to a worker thread; the main thread keeps pumping pika's event loop
(heartbeats included) the whole time, and the worker acks/nacks back onto the
connection via `add_callback_threadsafe`.

Usage:
    uv run python -m agent.consumer
"""

from __future__ import annotations

import functools
import json
import logging
import logging.config
import os
import threading
import time

import httpx
import pika
import pika.exceptions
from dotenv import load_dotenv

from agent.graph import compliance_graph

load_dotenv()

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.config.dictConfig({
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "format": "%(asctime)s %(levelname)-8s %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S",
        }
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "default"}
    },
    "root": {"level": "INFO", "handlers": ["console"]},
})

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

QUEUE             = "compliance.agent"
PREFETCH          = 1
RECONNECT_DELAY   = 5
HEARTBEAT_SEC     = 600  # generous — the worker thread keeps the IO loop free anyway
INTERNAL_API_URL  = os.environ.get("INTERNAL_API_URL", "http://localhost:8000")
INTERNAL_SECRET   = os.environ.get("INTERNAL_SECRET", "")

# ---------------------------------------------------------------------------
# Ack/nack helpers — run on the pika IO-loop thread via add_callback_threadsafe
# ---------------------------------------------------------------------------

def _ack(channel: pika.channel.Channel, delivery_tag: int) -> None:
    if channel.is_open:
        channel.basic_ack(delivery_tag=delivery_tag)


def _nack(channel: pika.channel.Channel, delivery_tag: int) -> None:
    if channel.is_open:
        channel.basic_nack(delivery_tag=delivery_tag, requeue=False)


# ---------------------------------------------------------------------------
# Heavy processing — runs in a worker thread, off the pika IO loop
# ---------------------------------------------------------------------------

def process_message(
    connection: pika.BlockingConnection,
    channel: pika.channel.Channel,
    delivery_tag: int,
    body: bytes,
) -> None:
    start = time.perf_counter()

    try:
        message = json.loads(body)
    except json.JSONDecodeError as exc:
        log.error("[consumer] Malformed JSON in message body: %s", exc)
        connection.add_callback_threadsafe(functools.partial(_nack, channel, delivery_tag))
        return

    direction_id = message.get("direction_id", "UNKNOWN")
    title        = message.get("title", "")

    log.info("=" * 70)
    log.info("[consumer] Message received — direction_id=%s  title='%s'", direction_id, title)

    initial_state = {
        "direction_id":   direction_id,
        "title":          title,
        "pdf_url":        message.get("pdf_url", ""),
        "published_date": message.get("published_date"),
        "scraped_at":     message.get("scraped_at", ""),
        "error":          None,
    }

    if not initial_state["pdf_url"]:
        log.error("[consumer] Message has no pdf_url — sending to DLQ")
        connection.add_callback_threadsafe(functools.partial(_nack, channel, delivery_tag))
        return

    # ── Run the LangGraph pipeline ────────────────────────────────────────
    try:
        final_state = compliance_graph.invoke(initial_state)
    except Exception as exc:
        log.exception("[consumer] Unhandled exception in graph: %s", exc)
        connection.add_callback_threadsafe(functools.partial(_nack, channel, delivery_tag))
        return

    elapsed = time.perf_counter() - start

    # ── Check for pipeline errors ─────────────────────────────────────────
    if final_state.get("error"):
        log.error(
            "[consumer] Pipeline error — NACK (→ DLQ)  direction_id=%s  error=%s",
            direction_id, final_state["error"],
        )
        connection.add_callback_threadsafe(functools.partial(_nack, channel, delivery_tag))
        return

    # ── Success ───────────────────────────────────────────────────────────
    validation      = final_state.get("validation", {})
    overall_summary = final_state.get("overall_summary", "")
    maps            = final_state.get("maps", [])

    log.info("[consumer] ── FINAL RESULT ────────────────────────────────────")
    log.info("[consumer] direction_id : %s", direction_id)
    log.info("[consumer] overall      : %s", overall_summary[:300])
    log.info("[consumer] MAPs         : %d generated", len(maps))
    log.info("[consumer] valid        : %s  (confidence=%.2f)",
             validation.get("is_valid"), validation.get("confidence_score", 0))
    if not validation.get("is_valid"):
        for issue in validation.get("issues", []):
            log.warning("[consumer]   issue: %s", issue)
    log.info("[consumer] ACK — processed in %.1f s", elapsed)
    log.info("=" * 70)

    connection.add_callback_threadsafe(functools.partial(_ack, channel, delivery_tag))

    # ── Persist to DB via internal API (fans out to all orgs server-side) ──
    if INTERNAL_SECRET:
        _persist_to_api(final_state, elapsed)
    else:
        log.warning("[consumer] INTERNAL_SECRET not set — skipping persistence")


# ---------------------------------------------------------------------------
# Persist result to FastAPI internal endpoint (sync httpx call)
# ---------------------------------------------------------------------------

def _persist_to_api(state: dict, processing_time_s: float) -> None:
    payload = {
        "direction_id":    state.get("direction_id", ""),
        "title":           state.get("title", ""),
        "pdf_url":         state.get("pdf_url"),
        "source":          "rbi",
        "published_date":  state.get("published_date"),
        "overall_summary": state.get("overall_summary", ""),
        "parsed":          state.get("parsed", {}),
        "maps":            state.get("maps", []),
        "markdown_text":   state.get("markdown_text", ""),
        "validation":      state.get("validation", {}),
        "processing_time_s": processing_time_s,
    }
    try:
        resp = httpx.post(
            f"{INTERNAL_API_URL}/internal/regulation-done",
            json=payload,
            headers={"X-Internal-Token": INTERNAL_SECRET},
            timeout=30,
        )
        resp.raise_for_status()
        log.info("[consumer] Persisted  regulation_id=%s", resp.json().get("regulation_id"))
    except Exception as exc:
        log.error("[consumer] Failed to persist result via internal API: %s", exc)


# ---------------------------------------------------------------------------
# Connection + consume loop (auto-reconnect)
# ---------------------------------------------------------------------------

def start_consuming() -> None:
    url = os.environ.get("CLOUDAMQP_URL")
    if not url:
        raise RuntimeError("CLOUDAMQP_URL is not set in .env")

    while True:
        threads: list[threading.Thread] = []
        connection = None
        try:
            log.info("[consumer] Connecting to RabbitMQ...")
            params           = pika.URLParameters(url)
            params.heartbeat = HEARTBEAT_SEC
            params.blocked_connection_timeout = 300

            connection = pika.BlockingConnection(params)
            channel    = connection.channel()
            channel.basic_qos(prefetch_count=PREFETCH)

            def on_message(channel, method, _properties, body):
                t = threading.Thread(
                    target=process_message,
                    args=(connection, channel, method.delivery_tag, body),
                    daemon=True,
                )
                t.start()
                threads.append(t)

            channel.basic_consume(queue=QUEUE, on_message_callback=on_message)

            log.info("[consumer] Waiting for messages on queue '%s'. Press Ctrl+C to stop.", QUEUE)
            channel.start_consuming()

        except pika.exceptions.AMQPConnectionError as exc:
            log.warning("[consumer] Connection lost: %s — reconnecting in %ds", exc, RECONNECT_DELAY)
            time.sleep(RECONNECT_DELAY)
        except KeyboardInterrupt:
            log.info("[consumer] Shutting down — waiting for in-flight message(s)...")
            for t in threads:
                t.join(timeout=120)
            try:
                connection.close()
            except Exception:
                pass
            break


if __name__ == "__main__":
    start_consuming()
