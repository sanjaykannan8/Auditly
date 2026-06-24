"""
Department head endpoints — their MAP view and proof submission.

The caller's department_id is resolved from PostgreSQL
(departments.head_user_id = caller's user_id).
"""

from __future__ import annotations

import json
import logging
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.deps import require_head
from db.mongo import get_db
from db.postgres import get_pool
from storage import save_data_url

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/head", tags=["head"])


async def _get_dept_id(user_id: str, org_id: str) -> str:
    """Look up the department this user heads."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        dept_id = await conn.fetchval(
            "SELECT id FROM departments WHERE head_user_id = $1 AND org_id = $2",
            user_id, org_id,
        )
    if not dept_id:
        raise HTTPException(403, "You are not assigned as head of any department")
    return str(dept_id)


@router.get("/maps")
async def list_head_maps(
    status: str | None = Query(None),
    page: int = 1,
    limit: int = 20,
    user: dict = Depends(require_head),
) -> dict:
    dept_id = await _get_dept_id(user["user_id"], user["org_id"])
    db = get_db()

    match_filter: dict = {"org_id": user["org_id"]}
    map_filter: dict = {"maps.department_id": dept_id}
    if status:
        map_filter["maps.status"] = status

    pipeline = [
        {"$match": match_filter},
        {"$unwind": "$maps"},
        {"$match": map_filter},
        {"$sort": {"maps.deadline": 1}},
        {"$skip": (page - 1) * limit},
        {"$limit": limit},
        {"$project": {
            "regulation_id": 1,
            "direction_id": 1,
            "title": 1,
            "map": "$maps",
        }},
    ]

    items = []
    _cur = await db["agent_outputs"].aggregate(pipeline)
    async for doc in _cur:
        m = doc["map"]
        items.append({
            "regulation_id": doc["regulation_id"],
            "regulation_title": doc["title"],
            "direction_id": doc["direction_id"],
            "map_code": m["id"],
            "title": m["title"],
            "priority": m.get("priority"),
            "deadline": m.get("deadline"),
            "status": m.get("status"),
            "map_summary": m.get("map_summary", ""),
            "steps_total": len(m.get("steps", [])),
            "steps_done": sum(1 for s in m.get("steps", []) if s.get("completed")),
        })

    count_pipeline = [
        {"$match": match_filter},
        {"$unwind": "$maps"},
        {"$match": map_filter},
        {"$count": "total"},
    ]
    _ccur = await db["agent_outputs"].aggregate(count_pipeline)
    count_result = await _ccur.to_list(1)
    total = count_result[0]["total"] if count_result else 0

    return {"items": items, "total": total, "dept_id": dept_id, "page": page, "limit": limit}


@router.get("/maps/{regulation_id}/{map_code}")
async def get_head_map(
    regulation_id: str,
    map_code: str,
    user: dict = Depends(require_head),
) -> dict:
    dept_id = await _get_dept_id(user["user_id"], user["org_id"])
    db = get_db()

    doc = await db["agent_outputs"].find_one(
        {"regulation_id": regulation_id, "org_id": user["org_id"]},
        {"maps": 1, "title": 1, "direction_id": 1, "overall_summary": 1, "pdf_url": 1},
    )
    if not doc:
        raise HTTPException(404, "Regulation not found")

    the_map = next(
        (m for m in doc.get("maps", []) if m["id"] == map_code and m.get("department_id") == dept_id),
        None,
    )
    if not the_map:
        raise HTTPException(404, "MAP not found or not assigned to your department")

    _fcur = db["map_submissions"].find(
        {"regulation_id": regulation_id, "map_code": map_code, "org_id": user["org_id"]},
        sort=[("submitted_at", -1)],
    )
    submissions = await _fcur.to_list(5)
    for s in submissions:
        s["_id"] = str(s["_id"])

    return {
        "regulation_id": regulation_id,
        "regulation_title": doc["title"],
        "direction_id": doc["direction_id"],
        "pdf_url": doc.get("pdf_url"),
        "map": the_map,
        "submissions": submissions,
    }


class StepUpdate(BaseModel):
    completed: bool


@router.patch("/maps/{regulation_id}/{map_code}/steps/{step_num}")
async def update_step(
    regulation_id: str,
    map_code: str,
    step_num: int,
    body: StepUpdate,
    user: dict = Depends(require_head),
) -> dict:
    dept_id = await _get_dept_id(user["user_id"], user["org_id"])
    db = get_db()

    result = await db["agent_outputs"].update_one(
        {
            "regulation_id": regulation_id,
            "org_id": user["org_id"],
            "maps": {"$elemMatch": {"id": map_code, "department_id": dept_id}},
        },
        {"$set": {f"maps.$[m].steps.$[s].completed": body.completed}},
        array_filters=[{"m.id": map_code}, {"s.step_number": step_num}],
    )
    if result.matched_count == 0:
        raise HTTPException(404, "MAP or step not found")

    # Starting work on a step moves a fresh MAP from pending -> in_progress
    new_status: str | None = None
    if body.completed:
        bump = await db["agent_outputs"].update_one(
            {
                "regulation_id": regulation_id,
                "org_id": user["org_id"],
                "maps": {"$elemMatch": {"id": map_code, "status": "pending"}},
            },
            {"$set": {"maps.$.status": "in_progress"}},
        )
        if bump.modified_count:
            new_status = "in_progress"

    return {"updated": True, "step_num": step_num, "completed": body.completed, "status": new_status}


# ---------------------------------------------------------------------------
# Upload a proof file to local storage
# ---------------------------------------------------------------------------

class ProofUploadPayload(BaseModel):
    data_url: str            # "data:<mime>;base64,...."
    filename: str | None = None


@router.post("/upload-proof")
async def upload_proof(
    body: ProofUploadPayload,
    user: dict = Depends(require_head),
) -> dict:
    if not body.data_url:
        raise HTTPException(400, "No file data provided")
    try:
        url = save_data_url(body.data_url, filename_hint=body.filename)
    except Exception as exc:
        log.error("[head] proof upload failed: %s", exc)
        raise HTTPException(500, "Proof upload failed")
    return {"url": url}


class SubmissionBody(BaseModel):
    file_urls: list[str]
    notes: str = ""


@router.post("/maps/{regulation_id}/{map_code}/submissions", status_code=201)
async def submit_proof(
    regulation_id: str,
    map_code: str,
    body: SubmissionBody,
    user: dict = Depends(require_head),
) -> dict:
    if not body.file_urls:
        raise HTTPException(400, "At least one file URL is required")

    dept_id = await _get_dept_id(user["user_id"], user["org_id"])
    db = get_db()

    # Verify MAP belongs to this dept
    doc = await db["agent_outputs"].find_one(
        {
            "regulation_id": regulation_id,
            "org_id": user["org_id"],
            "maps": {"$elemMatch": {"id": map_code, "department_id": dept_id}},
        },
        {"_id": 1},
    )
    if not doc:
        raise HTTPException(404, "MAP not found or not assigned to your department")

    now = datetime.now(timezone.utc)
    ref = f"SUB-{now.strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}"

    submission = {
        "regulation_id": regulation_id,
        "map_code": map_code,
        "org_id": user["org_id"],
        "submitted_by": user["user_id"],
        "submitted_at": now,
        "file_urls": body.file_urls,
        "notes": body.notes,
        "reference_number": ref,
        "review_status": "pending",
        "reviewed_by": None,
        "reviewed_at": None,
        "review_note": None,
    }
    await db["map_submissions"].insert_one(submission)

    # Update MAP status to 'submitted'
    await db["agent_outputs"].update_one(
        {
            "regulation_id": regulation_id,
            "org_id": user["org_id"],
            "maps.id": map_code,
        },
        {"$set": {"maps.$.status": "submitted"}},
    )

    # Audit log
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO audit_log (org_id, actor_id, actor_role, entity_type, entity_id, action, details)
            VALUES ($1, $2, $3, 'map', $4, 'map.submitted', $5::jsonb)
            """,
            user["org_id"], user["user_id"], user["role"],
            map_code, json.dumps({"reference_number": ref, "files": len(body.file_urls)}),
        )

    return {"reference_number": ref}
