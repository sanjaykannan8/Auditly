"""
Manual test publisher — feed the agent a LOCAL PDF without the scraper/relay.

Publishes one message to the same RabbitMQ exchange the relay uses, so the running
consumer picks it up and runs the full pipeline against your local file.

Usage (run on the host, where the consumer also runs):
    uv run python -m agent.publish_test --pdf "file:///C:/path/to/doc.pdf"
    uv run python -m agent.publish_test --pdf "C:/path/to/doc.pdf" --title "Test direction" --direction-id TEST-001

The consumer's pdf_parser opens the path directly via MarkItDown, so the file must
be readable by the consumer process (it is — both run on the host).
"""

from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse
from urllib.request import url2pathname

import pika
from dotenv import load_dotenv

load_dotenv()

EXCHANGE = "regulations"
ROUTING_KEY = "regulation.rbi.new"


def normalize_pdf_arg(value: str) -> str:
    """Accept a plain local path or a file:// URL; return a local filesystem path."""
    if value.startswith("file://"):
        parsed = urlparse(value)
        return url2pathname(unquote(parsed.path))
    return value


def main() -> None:
    ap = argparse.ArgumentParser(description="Publish a local PDF to the agent queue.")
    ap.add_argument("--pdf", required=True, help="Local path or file:// URL to a PDF")
    ap.add_argument("--title", default=None, help="Direction title (defaults to filename)")
    ap.add_argument("--direction-id", default=None, help="Direction id (defaults to TEST-<unix>)")
    args = ap.parse_args()

    pdf_path = normalize_pdf_arg(args.pdf)
    if not Path(pdf_path).is_file():
        raise SystemExit(f"File not found: {pdf_path}")

    direction_id = args.direction_id or f"TEST-{int(time.time())}"
    title = args.title or Path(pdf_path).stem

    payload = {
        "direction_id": direction_id,
        "title": title,
        "page_url": None,
        "pdf_url": pdf_path,            # local path — consumer reads it directly
        "published_date": None,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
    }

    url = os.environ.get("CLOUDAMQP_URL")
    if not url:
        raise SystemExit("CLOUDAMQP_URL is not set in .env")

    params = pika.URLParameters(url)
    params.socket_timeout = 10
    connection = pika.BlockingConnection(params)
    try:
        channel = connection.channel()
        channel.basic_publish(
            exchange=EXCHANGE,
            routing_key=ROUTING_KEY,
            body=json.dumps(payload),
            properties=pika.BasicProperties(
                delivery_mode=2,
                content_type="application/json",
                message_id=direction_id,
            ),
        )
        print(f"Published direction_id={direction_id} title={title!r} pdf={pdf_path}")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
