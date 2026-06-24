"""
Onboarding endpoints — no org membership required.

POST /create-org  → compliance officer creates org + departments
POST /join-org    → dept head pastes invitation token to join
GET  /status      → check if the calling user has completed onboarding
"""

from __future__ import annotations

import json
import logging
import os
import uuid

import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from api.deps import get_auth_user
from api.materialize import materialize_for_org
from db.mongo import get_db
from db.postgres import get_pool
from storage import save_data_url

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])

INVITATION_SECRET = os.environ.get("INVITATION_SECRET", "change-me")


# ---------------------------------------------------------------------------
# GET /status — does this user already belong to an org?
# ---------------------------------------------------------------------------

@router.get("/status")
async def onboarding_status(auth: dict = Depends(get_auth_user)) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT org_id, role FROM org_members WHERE user_id = $1",
            auth["user_id"],
        )
    return {
        "needs_setup": row is None,
        "role": row["role"] if row else None,
        "org_id": str(row["org_id"]) if row else None,
    }


# ---------------------------------------------------------------------------
# POST /create-org — compliance officer path
# ---------------------------------------------------------------------------

class DepartmentIn(BaseModel):
    name: str
    objective: str = ""

class CreateOrgPayload(BaseModel):
    name: str
    logo_base64: str | None = None
    departments: list[DepartmentIn]


@router.post("/create-org", status_code=201)
async def create_org(
    payload: CreateOrgPayload,
    auth: dict = Depends(get_auth_user),
) -> dict:
    user_id = auth["user_id"]
    pool = await get_pool()

    # Prevent double-onboarding
    async with pool.acquire() as conn:
        existing = await conn.fetchval(
            "SELECT org_id FROM org_members WHERE user_id = $1",
            user_id,
        )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "User already belongs to an organization")

    # Upload logo
    logo_url: str | None = None
    if payload.logo_base64:
        try:
            logo_url = save_data_url(f"data:image/png;base64,{payload.logo_base64}")
        except Exception as exc:
            log.error("[onboarding] Logo upload failed: %s", exc)
            raise HTTPException(500, "Logo upload failed")

    async with pool.acquire() as conn:
        # Create org
        org_id = await conn.fetchval(
            "INSERT INTO organizations (name, logo_url) VALUES ($1, $2) RETURNING id",
            payload.name, logo_url,
        )

        # Add caller as compliance officer
        await conn.execute(
            "INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'compliance_officer')",
            org_id, user_id,
        )

        # Create departments
        for dept in payload.departments:
            if dept.name.strip():
                await conn.execute(
                    "INSERT INTO departments (org_id, name, objective) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
                    org_id, dept.name.strip(), dept.objective,
                )

        # Audit: organization created
        await conn.execute(
            """
            INSERT INTO audit_log (org_id, actor_id, actor_role, entity_type, entity_id, action, details)
            VALUES ($1, $2, 'compliance_officer', 'organization', $3, 'org.created', $4::jsonb)
            """,
            org_id, user_id, str(org_id), json.dumps({"name": payload.name}),
        )

        # Backfill every regulation already processed so this org isn't starting empty
        db = get_db()
        _mcur = db["regulation_master"].find({})
        masters = await _mcur.to_list(None)
        for master in masters:
            await materialize_for_org(conn, db, str(org_id), master)

    return {"org_id": str(org_id), "logo_url": logo_url, "backfilled": len(masters)}


# ---------------------------------------------------------------------------
# POST /join-org — dept head pastes the invitation token
# ---------------------------------------------------------------------------

class JoinOrgPayload(BaseModel):
    invitation_token: str


@router.post("/join-org", status_code=201)
async def join_org(
    payload: JoinOrgPayload,
    auth: dict = Depends(get_auth_user),
) -> dict:
    user_id = auth["user_id"]

    # Decode the invitation JWT
    try:
        claims = pyjwt.decode(
            payload.invitation_token,
            INVITATION_SECRET,
            algorithms=["HS256"],
        )
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invitation token has expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid invitation token")

    org_id = claims.get("org_id")
    dept_id = claims.get("dept_id")
    jti = claims.get("jti")

    if not org_id or not dept_id or not jti:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Malformed invitation token")

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Check one-time use
        inv = await conn.fetchrow(
            "SELECT used FROM org_invitations WHERE jti = $1",
            jti,
        )
        if not inv:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invitation not found")
        if inv["used"]:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invitation has already been used")

        # Prevent double-onboarding
        existing = await conn.fetchval(
            "SELECT org_id FROM org_members WHERE user_id = $1",
            user_id,
        )
        if existing:
            raise HTTPException(status.HTTP_409_CONFLICT, "Already belongs to an organization")

        # Create membership
        await conn.execute(
            "INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'department_head')",
            uuid.UUID(org_id), user_id,
        )

        # Assign as dept head
        await conn.execute(
            "UPDATE departments SET head_user_id = $1 WHERE id = $2",
            user_id, uuid.UUID(dept_id),
        )

        # Mark invitation used
        await conn.execute(
            "UPDATE org_invitations SET used = true WHERE jti = $1",
            jti,
        )

    return {"org_id": org_id, "dept_id": dept_id, "role": "department_head"}
