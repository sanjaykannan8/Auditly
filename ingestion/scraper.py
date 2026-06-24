"""
RBI Master Directions scraper (Python).

Every SCRAPER_INTERVAL_MINUTES it scrapes the RBI listing, keeps directions
published AFTER CUTOFF_DATE, downloads each PDF, dedups by content hash, and
writes a 'pending' row to the MySQL outbox (pdf_url points at the original RBI
PDF — the agent fetches it directly, no separate copy is kept). The relay later
publishes those pending rows to RabbitMQ.

Ported from the Cloudflare Worker scraper (cloudflare/scraper/src/index.js).
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
from datetime import datetime, timezone

import httpx
from apscheduler.schedulers.blocking import BlockingScheduler
from dotenv import load_dotenv

from db import get_connection

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s [scraper] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("scraper")

LISTING_URL = "https://www.rbi.org.in/Scripts/BS_ViewMasterDirections.aspx"
UA = {"User-Agent": "Mozilla/5.0 (compatible; auditly-research-bot/1.0)"}

CUTOFF_DATE = os.environ.get("CUTOFF_DATE", "March 31, 2026")
INTERVAL_MIN = int(os.environ.get("SCRAPER_INTERVAL_MINUTES", "5"))

_DATE_LINE_RE = re.compile(r"^(\w+\s+\d{1,2},\s+\d{4})$")
_BOLD_RE = re.compile(r"<b>([^<]+)</b>", re.IGNORECASE)
_LINK_RE = re.compile(
    r"href=BS_ViewMasDirections\.aspx\?id=(\d+)[^>]*>\s*([^<]+)</a>", re.IGNORECASE
)
_PDF_RE = re.compile(
    r"href='(https://rbidocs\.rbi\.org\.in/rdocs/notification/PDFs/[^']+\.PDF)'",
    re.IGNORECASE,
)


def _parse_date(text: str) -> datetime | None:
    """Parse 'March 31, 2026' or 'Apr 30, 2026' (full or abbreviated month)."""
    for fmt in ("%B %d, %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def parse_directions(html: str) -> list[dict]:
    cutoff = _parse_date(CUTOFF_DATE) or datetime(2026, 3, 31)

    bolds = [(m.group(1).strip(), m.start()) for m in _BOLD_RE.finditer(html)]
    links = [(m.group(1), m.group(2).strip(), m.start()) for m in _LINK_RE.finditer(html)]
    pdfs = [(m.group(1), m.start()) for m in _PDF_RE.finditer(html)]

    directions: list[dict] = []
    for i, (direction_id, title, link_idx) in enumerate(links):
        next_idx = links[i + 1][2] if i + 1 < len(links) else None

        # Most recent date header before this link
        closest_date = None
        closest_dt = None
        for text, b_idx in bolds:
            if b_idx >= link_idx:
                break
            m = _DATE_LINE_RE.match(text)
            if m:
                parsed = _parse_date(m.group(1))
                if parsed:
                    closest_date = m.group(1)
                    closest_dt = parsed

        if not closest_dt or closest_dt <= cutoff:
            continue

        pdf_url = next(
            (u for (u, p_idx) in pdfs if p_idx > link_idx and (next_idx is None or p_idx < next_idx)),
            None,
        )

        directions.append({
            "id": direction_id,
            "title": title,
            "page_url": f"https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id={direction_id}",
            "pdf_url": pdf_url,
            "published_date": closest_date,
        })

    return directions


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def process_direction(direction: dict) -> None:
    if not direction["pdf_url"]:
        log.warning("No PDF URL for direction %s, skipping", direction["id"])
        return

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM rbi_directions WHERE direction_id = %s AND pdf_url = %s",
                (direction["id"], direction["pdf_url"]),
            )
            if cur.fetchone():
                return  # already have this version

        # Download the PDF
        resp = httpx.get(direction["pdf_url"], headers=UA, timeout=60, follow_redirects=True)
        resp.raise_for_status()
        pdf_bytes = resp.content
        content_hash = _sha256(pdf_bytes)

        with conn.cursor() as cur:
            cur.execute("SELECT id FROM rbi_directions WHERE content_hash = %s", (content_hash,))
            if cur.fetchone():
                log.info("Duplicate content for direction %s, skipping", direction["id"])
                return

        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO rbi_directions
                    (direction_id, title, page_url, pdf_url, content_hash,
                     published_date, status, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, 'pending', %s)
                """,
                (
                    direction["id"], direction["title"], direction["page_url"],
                    direction["pdf_url"], content_hash,
                    direction["published_date"], now,
                ),
            )
        conn.commit()
        log.info("Stored: [%s] %s", direction["published_date"], direction["title"])
    except Exception as exc:
        conn.rollback()
        log.error("Failed for direction %s: %s", direction["id"], exc)
    finally:
        conn.close()


def scrape_once() -> None:
    log.info("── scrape tick ──")
    try:
        resp = httpx.get(LISTING_URL, headers=UA, timeout=60, follow_redirects=True)
        resp.raise_for_status()
        directions = parse_directions(resp.text)
        log.info("Directions after cutoff: %d", len(directions))
        for direction in directions:
            process_direction(direction)
    except Exception as exc:
        log.error("Scrape failed: %s", exc)


def main() -> None:
    log.info("Scraper starting — every %d min, cutoff '%s'", INTERVAL_MIN, CUTOFF_DATE)
    scheduler = BlockingScheduler(timezone="UTC")
    scheduler.add_job(scrape_once, "interval", minutes=INTERVAL_MIN, next_run_time=datetime.now(timezone.utc))
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        log.info("Scraper stopped.")


if __name__ == "__main__":
    main()
