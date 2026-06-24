"""
Organization settings — view/edit org name and manage members.

Member display info (username/email/avatar) comes from our own users table.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import get_current_user, require_admin
from db.postgres import get_pool

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/org", tags=["org"])


@router.get("")
async def get_org(user: dict = Depends(get_current_user)) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        org = await conn.fetchrow(
            "SELECT id, name, logo_url, created_at FROM organizations WHERE id = $1",
            uuid.UUID(user["org_id"]),
        )
        members = await conn.fetch(
            """
            SELECT m.user_id, m.role, m.created_at,
                   d.name AS dept_name,
                   u.username, u.email, u.pfp_url
            FROM org_members m
            LEFT JOIN departments d
              ON d.head_user_id = m.user_id AND d.org_id = m.org_id
            LEFT JOIN users u ON u.id::text = m.user_id
            WHERE m.org_id = $1
            ORDER BY m.created_at
            """,
            uuid.UUID(user["org_id"]),
        )

    if not org:
        raise HTTPException(404, "Organization not found")

    enriched = [
        {
            "user_id": m["user_id"],
            "role": m["role"],
            "department": m["dept_name"],
            "name": m["username"],
            "email": m["email"],
            "image_url": m["pfp_url"],
            "is_you": m["user_id"] == user["user_id"],
            "joined_at": m["created_at"].isoformat(),
        }
        for m in members
    ]

    return {
        "id": str(org["id"]),
        "name": org["name"],
        "logo_url": org["logo_url"],
        "created_at": org["created_at"].isoformat(),
        "role": user["role"],
        "members": enriched,
    }


class UpdateOrgPayload(BaseModel):
    name: str


@router.patch("")
async def update_org(
    body: UpdateOrgPayload,
    user: dict = Depends(require_admin),
) -> dict:
    if not body.name.strip():
        raise HTTPException(400, "Name cannot be empty")
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE organizations SET name = $1 WHERE id = $2",
            body.name.strip(), uuid.UUID(user["org_id"]),
        )
    return {"updated": True, "name": body.name.strip()}


@router.delete("/members/{member_user_id}")
async def remove_member(
    member_user_id: str,
    user: dict = Depends(require_admin),
) -> dict:
    if member_user_id == user["user_id"]:
        raise HTTPException(400, "You cannot remove yourself")

    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT role FROM org_members WHERE user_id = $1 AND org_id = $2",
            member_user_id, uuid.UUID(user["org_id"]),
        )
        if not existing:
            raise HTTPException(404, "Member not found in this organization")

        # Vacate any department this user heads
        await conn.execute(
            "UPDATE departments SET head_user_id = NULL WHERE head_user_id = $1 AND org_id = $2",
            member_user_id, uuid.UUID(user["org_id"]),
        )
        await conn.execute(
            "DELETE FROM org_members WHERE user_id = $1 AND org_id = $2",
            member_user_id, uuid.UUID(user["org_id"]),
        )

    return {"removed": True}
