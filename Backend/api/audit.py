"""
Audit trail endpoints — query event log + generate PDF report.
"""

from __future__ import annotations

import io
import json
import logging
from datetime import datetime, time, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from fpdf import FPDF
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from api.deps import require_admin
from db.postgres import get_pool

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/audit-trail", tags=["audit"])


def _start_of_day(date_str: str) -> datetime:
    return datetime.combine(datetime.fromisoformat(date_str).date(), time.min, tzinfo=timezone.utc)


def _end_of_day(date_str: str) -> datetime:
    return datetime.combine(datetime.fromisoformat(date_str).date(), time.max, tzinfo=timezone.utc)


@router.get("")
async def get_audit_trail(
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    entity_type: str | None = Query(None),
    page: int = 1,
    limit: int = 50,
    user: dict = Depends(require_admin),
) -> dict:
    pool = await get_pool()
    conditions = ["org_id = $1"]
    params: list = [user["org_id"]]
    idx = 2

    if from_date:
        conditions.append(f"timestamp >= ${idx}")
        params.append(_start_of_day(from_date))
        idx += 1
    if to_date:
        conditions.append(f"timestamp <= ${idx}")
        params.append(_end_of_day(to_date))
        idx += 1
    if entity_type:
        conditions.append(f"entity_type = ${idx}")
        params.append(entity_type)
        idx += 1

    where = " AND ".join(conditions)

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT audit_log.id, actor_id, u.username AS actor_name, actor_role,
                   entity_type, entity_id, action, details, timestamp
            FROM audit_log
            LEFT JOIN users u ON u.id::text = audit_log.actor_id
            WHERE {where}
            ORDER BY timestamp DESC
            LIMIT {limit} OFFSET {(page - 1) * limit}
            """,
            *params,
        )
        total = await conn.fetchval(
            f"SELECT COUNT(*) FROM audit_log WHERE {where}",
            *params,
        )

    def _parse_details(raw):
        if isinstance(raw, (dict, list)) or raw is None:
            return raw
        try:
            return json.loads(raw)
        except (ValueError, TypeError):
            return raw

    items = []
    for r in rows:
        items.append({
            "id": str(r["id"]),
            "actor_id": r["actor_id"],
            "actor_name": r["actor_name"],
            "actor_role": r["actor_role"],
            "entity_type": r["entity_type"],
            "entity_id": r["entity_id"],
            "action": r["action"],
            "details": _parse_details(r["details"]),
            "timestamp": r["timestamp"].isoformat(),
        })

    return {"items": items, "total": total, "page": page, "limit": limit}


class ReportRequest(BaseModel):
    from_date: str
    to_date: str


# fpdf's core Helvetica font only supports latin-1 — sanitize anything that might
# come from free-text fields (notes, usernames) before writing it to a cell.
_UNICODE_TO_ASCII = {
    "—": "-", "–": "-", "‘": "'", "’": "'",
    "“": '"', "”": '"', "…": "...", "•": "-",
}


def _pdf_safe(value) -> str:
    if value is None:
        return ""
    text = str(value)
    for unicode_char, ascii_char in _UNICODE_TO_ASCII.items():
        text = text.replace(unicode_char, ascii_char)
    return text.encode("latin-1", errors="replace").decode("latin-1")


_ACTION_LABEL = {
    "map.submitted": "Proof submitted",
    "map.approved": "Action item approved",
    "map.rejected": "Action item sent back for rework",
}


def _summarize_details(action: str, details: dict | None) -> str:
    """Mirrors the frontend's summarizeDetails() — a sentence, not raw JSON."""
    if not details:
        return "-"
    if action == "map.submitted":
        ref = details.get("reference_number")
        files = details.get("files")
        parts = []
        if ref:
            parts.append(f"Ref {ref}")
        if files is not None:
            parts.append(f"{files} file{'s' if files != 1 else ''}")
        return " | ".join(parts) if parts else "-"
    if action in ("map.approved", "map.rejected"):
        note = (details.get("note") or "").strip()
        return note if note else "-"
    return "-"


def _build_pdf(rows: list[dict], from_date: str, to_date: str) -> bytes:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "Auditly - Compliance Timeline Report", ln=True, align="C")
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, _pdf_safe(f"Period: {from_date} to {to_date}"), ln=True, align="C")
    pdf.ln(6)

    # Table header
    pdf.set_fill_color(230, 230, 230)
    pdf.set_font("Helvetica", "B", 9)
    col_w = [32, 38, 50, 70]
    headers = ["Date", "Actor", "Action", "Details"]
    for w, h in zip(col_w, headers):
        pdf.cell(w, 7, h, border=1, fill=True)
    pdf.ln()

    pdf.set_font("Helvetica", "", 8)
    for r in rows:
        ts = r["timestamp"][:16].replace("T", " ")
        actor = r.get("actor_name") or f"...{r['actor_id'][-8:]}"
        action = _ACTION_LABEL.get(r["action"], r["action"])
        details = _summarize_details(r["action"], r.get("details"))

        row_data = [ts, actor, action, details]
        for w, v in zip(col_w, row_data):
            pdf.cell(w, 6, _pdf_safe(v)[:48], border=1)
        pdf.ln()

    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 8)
    pdf.cell(0, 5, f"Generated by Auditly  |  Total events: {len(rows)}", ln=True, align="R")

    return bytes(pdf.output())


@router.post("/report")
async def generate_report(
    body: ReportRequest,
    user: dict = Depends(require_admin),
) -> StreamingResponse:
    """
    The "Compliance Timeline" report — only the MAP workflow events (proof
    submitted / approved / sent back for rework). Org and department setup
    events are deliberately excluded; they're not part of the compliance
    timeline an auditor would want to see.
    """
    pool = await get_pool()

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT audit_log.actor_id, u.username AS actor_name, audit_log.actor_role,
                   audit_log.entity_type, audit_log.entity_id, audit_log.action,
                   audit_log.details, audit_log.timestamp
            FROM audit_log
            LEFT JOIN users u ON u.id::text = audit_log.actor_id
            WHERE audit_log.org_id = $1
              AND audit_log.entity_type = 'map'
              AND audit_log.timestamp >= $2
              AND audit_log.timestamp <= $3
            ORDER BY audit_log.timestamp ASC
            LIMIT 1000
            """,
            user["org_id"],
            _start_of_day(body.from_date),
            _end_of_day(body.to_date),
        )

    if not rows:
        raise HTTPException(404, "No audit events found for the given date range")

    def _parse_details(raw):
        if isinstance(raw, (dict, list)) or raw is None:
            return raw
        try:
            return json.loads(raw)
        except (ValueError, TypeError):
            return raw

    row_dicts = [
        {
            "actor_id": r["actor_id"],
            "actor_name": r["actor_name"],
            "actor_role": r["actor_role"],
            "entity_type": r["entity_type"],
            "entity_id": r["entity_id"],
            "action": r["action"],
            "details": _parse_details(r["details"]),
            "timestamp": r["timestamp"].isoformat(),
        }
        for r in rows
    ]

    pdf_bytes = await run_in_threadpool(_build_pdf, row_dicts, body.from_date, body.to_date)

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=audit-report-{body.from_date}.pdf"},
    )
