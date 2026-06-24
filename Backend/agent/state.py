from __future__ import annotations

from typing import Any
from typing_extensions import TypedDict


class AgentState(TypedDict, total=False):
    # ── input from RabbitMQ message ────────────────────────────────────────
    direction_id:   str
    title:          str
    pdf_url:        str
    published_date: str | None
    scraped_at:     str

    # ── Node 1: pdf_parser output ──────────────────────────────────────────
    markdown_text:  str
    # {summary, mandates: [...], deadlines: [{description, date}], affected_entities: [...]}
    parsed:         dict[str, Any]

    # ── Node 2: map_generator output ──────────────────────────────────────
    # [{id, title, department, steps[], map_summary, priority, deadline}]
    maps:           list[dict[str, Any]]
    overall_summary: str

    # ── Node 3: validator output ───────────────────────────────────────────
    # {is_valid, issues: [...], confidence_score}
    validation:     dict[str, Any]

    # ── error tracking ─────────────────────────────────────────────────────
    error:          str | None
