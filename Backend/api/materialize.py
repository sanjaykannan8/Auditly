"""
Materialize a processed regulation into a specific organization's view.

RBI directions are common to every bank, so the agent processes each direction ONCE
and stores the raw result in the `regulation_master` MongoDB collection (keyed by
direction_id) — with department assignments by NAME and steps as plain strings.

For each organization we then create a private working copy:
  - a PostgreSQL `regulations` row (org-scoped UUID)
  - a MongoDB `agent_outputs` doc where each MAP's `department_id` is resolved against
    THAT org's departments, steps are normalized to objects with completion tracking,
    and each MAP starts at status 'pending'.

The per-org MAP progress (step ticks, status, submissions) lives only in the org copy,
so re-materializing never wipes a department head's work (maps use $setOnInsert).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _normalize_steps(raw_steps: list[Any] | None) -> list[dict]:
    steps: list[dict] = []
    for i, s in enumerate(raw_steps or []):
        if isinstance(s, dict):
            steps.append({
                "step_number": s.get("step_number", i + 1),
                "description": s.get("description", ""),
                "completed": bool(s.get("completed", False)),
            })
        else:
            steps.append({"step_number": i + 1, "description": str(s), "completed": False})
    return steps


async def materialize_for_org(conn, db, org_id: str, master: dict) -> str:
    """Create/refresh the org's private copy of a processed regulation. Returns its PG id."""
    dept_rows = await conn.fetch(
        "SELECT id, name FROM departments WHERE org_id = $1", org_id
    )
    dept_map = {r["name"]: str(r["id"]) for r in dept_rows}

    pub_date = None
    if master.get("published_date"):
        try:
            pub_date = datetime.fromisoformat(str(master["published_date"])).date()
        except (ValueError, TypeError):
            pub_date = None

    row = await conn.fetchrow(
        """
        INSERT INTO regulations (org_id, direction_id, title, pdf_url, source, status, published_date)
        VALUES ($1, $2, $3, $4, $5, 'done', $6)
        ON CONFLICT (org_id, direction_id)
        DO UPDATE SET status = 'done', title = EXCLUDED.title
        RETURNING id
        """,
        org_id,
        master["direction_id"],
        master["title"],
        master.get("pdf_url"),
        master.get("source", "rbi"),
        pub_date,
    )
    regulation_id = str(row["id"])

    maps: list[dict] = []
    for m in master.get("maps", []):
        dept_name = m.get("department", "")
        maps.append({
            "id": m.get("id"),
            "title": m.get("title", ""),
            "department": dept_name,
            "department_id": dept_map.get(dept_name),
            "map_summary": m.get("map_summary", ""),
            "priority": m.get("priority"),
            "deadline": m.get("deadline"),
            "steps": _normalize_steps(m.get("steps")),
            "status": "pending",
        })

    meta = {
        "regulation_id": regulation_id,
        "org_id": org_id,
        "direction_id": master["direction_id"],
        "title": master["title"],
        "pdf_url": master.get("pdf_url"),
        "markdown_text": master.get("markdown_text", ""),
        "parsed": master.get("parsed", {}),
        "overall_summary": master.get("overall_summary", ""),
        "validation": master.get("validation", {}),
        "processing_time_s": master.get("processing_time_s", 0.0),
    }
    await db["agent_outputs"].update_one(
        {"regulation_id": regulation_id},
        {
            "$set": meta,
            "$setOnInsert": {"maps": maps, "created_at": datetime.now(timezone.utc)},
        },
        upsert=True,
    )
    return regulation_id
