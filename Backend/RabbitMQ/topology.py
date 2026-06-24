"""
topology.py — Run once per environment to declare the Auditly RabbitMQ topology.

Usage:
    CLOUDAMQP_URL="amqps://user:pass@hawk.rmq.cloudamqp.com/vhost" python topology.py

Topology overview:
    regulations (topic exchange)
        └─ binding: regulation.#
               └─ compliance.agent  (durable, 24 h TTL)
                      │  on nack / TTL expiry
                      ▼
                 regulations.dlx (direct exchange)
                      └─ compliance.agent.dlq  (durable)
"""

import logging
import os
import sys

import pika
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EXCHANGE_MAIN = "regulations"
EXCHANGE_DLX  = "regulations.dlx"

QUEUE_MAIN    = "compliance.agent"
QUEUE_DLQ     = "compliance.agent.dlq"

ROUTING_KEY_MAIN    = "regulation.#"   # wildcard — catches all regulation.*.* keys
ROUTING_KEY_DLQ     = "compliance.agent.dlq"

MESSAGE_TTL_MS = 86_400_000   # 24 hours


def declare_topology(channel: pika.adapters.blocking_connection.BlockingChannel) -> None:
    # 1. Dead-letter exchange — must be declared before the main queue references it
    channel.exchange_declare(
        exchange=EXCHANGE_DLX,
        exchange_type="direct",
        durable=True,
    )
    log.info("Exchange declared: %s (direct)", EXCHANGE_DLX)

    # 2. Main topic exchange
    channel.exchange_declare(
        exchange=EXCHANGE_MAIN,
        exchange_type="topic",
        durable=True,
    )
    log.info("Exchange declared: %s (topic)", EXCHANGE_MAIN)

    # 3. Dead-letter queue
    channel.queue_declare(queue=QUEUE_DLQ, durable=True)
    channel.queue_bind(
        queue=QUEUE_DLQ,
        exchange=EXCHANGE_DLX,
        routing_key=ROUTING_KEY_DLQ,
    )
    log.info("Queue declared and bound: %s → %s", QUEUE_DLQ, EXCHANGE_DLX)

    # 4. Main processing queue with DLX config and TTL
    channel.queue_declare(
        queue=QUEUE_MAIN,
        durable=True,
        arguments={
            "x-dead-letter-exchange":     EXCHANGE_DLX,
            "x-dead-letter-routing-key":  ROUTING_KEY_DLQ,
            "x-message-ttl":              MESSAGE_TTL_MS,
        },
    )
    channel.queue_bind(
        queue=QUEUE_MAIN,
        exchange=EXCHANGE_MAIN,
        routing_key=ROUTING_KEY_MAIN,
    )
    log.info("Queue declared and bound: %s → %s (key=%s)", QUEUE_MAIN, EXCHANGE_MAIN, ROUTING_KEY_MAIN)


def main() -> None:
    url = os.environ.get("CLOUDAMQP_URL")
    if not url:
        log.error("CLOUDAMQP_URL is not set. Export it or add it to .env")
        sys.exit(1)

    log.info("Connecting to CloudAMQP...")
    params = pika.URLParameters(url)
    params.socket_timeout = 10

    connection = pika.BlockingConnection(params)
    channel = connection.channel()

    try:
        declare_topology(channel)
    finally:
        connection.close()

    log.info("Topology set up successfully.")
    log.info("  Exchange : %s (topic)", EXCHANGE_MAIN)
    log.info("  Exchange : %s (direct, DLX)", EXCHANGE_DLX)
    log.info("  Queue    : %s  →  key '%s'", QUEUE_MAIN, ROUTING_KEY_MAIN)
    log.info("  DLQ      : %s  →  %s", QUEUE_DLQ, EXCHANGE_DLX)


if __name__ == "__main__":
    main()
