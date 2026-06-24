"""
Declare the Auditly RabbitMQ topology (idempotent). Run as a one-shot at stack startup.

    regulations (topic)
        └─ binding regulation.#
               └─ compliance.agent (durable, 24h TTL, DLX → dlq)
                      ▼ on nack / TTL expiry
                 regulations.dlx (direct)
                      └─ compliance.agent.dlq (durable)

Ported from Backend/RabbitMQ/topology.py. Uses CLOUDAMQP_URL (amqp:// for local).
"""

from __future__ import annotations

import logging
import os
import sys
import time

import pika
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-8s [topology] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("topology")

EXCHANGE_MAIN = "regulations"
EXCHANGE_DLX = "regulations.dlx"
QUEUE_MAIN = "compliance.agent"
QUEUE_DLQ = "compliance.agent.dlq"
ROUTING_KEY_MAIN = "regulation.#"
ROUTING_KEY_DLQ = "compliance.agent.dlq"
MESSAGE_TTL_MS = 86_400_000  # 24h


def declare(channel) -> None:
    channel.exchange_declare(exchange=EXCHANGE_DLX, exchange_type="direct", durable=True)
    channel.exchange_declare(exchange=EXCHANGE_MAIN, exchange_type="topic", durable=True)

    channel.queue_declare(queue=QUEUE_DLQ, durable=True)
    channel.queue_bind(queue=QUEUE_DLQ, exchange=EXCHANGE_DLX, routing_key=ROUTING_KEY_DLQ)

    channel.queue_declare(
        queue=QUEUE_MAIN,
        durable=True,
        arguments={
            "x-dead-letter-exchange": EXCHANGE_DLX,
            "x-dead-letter-routing-key": ROUTING_KEY_DLQ,
            "x-message-ttl": MESSAGE_TTL_MS,
        },
    )
    channel.queue_bind(queue=QUEUE_MAIN, exchange=EXCHANGE_MAIN, routing_key=ROUTING_KEY_MAIN)
    log.info("Topology declared: %s (topic), %s (dlx), %s, %s", EXCHANGE_MAIN, EXCHANGE_DLX, QUEUE_MAIN, QUEUE_DLQ)


def main() -> None:
    url = os.environ.get("CLOUDAMQP_URL")
    if not url:
        log.error("CLOUDAMQP_URL is not set")
        sys.exit(1)

    # RabbitMQ may still be warming up — retry the connection a few times.
    last_exc: Exception | None = None
    for attempt in range(1, 31):
        try:
            params = pika.URLParameters(url)
            params.socket_timeout = 10
            connection = pika.BlockingConnection(params)
            channel = connection.channel()
            try:
                declare(channel)
            finally:
                connection.close()
            log.info("Topology set up successfully.")
            return
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            log.warning("RabbitMQ not ready (attempt %d/30): %s", attempt, exc)
            time.sleep(2)

    log.error("Could not declare topology: %s", last_exc)
    sys.exit(1)


if __name__ == "__main__":
    main()
