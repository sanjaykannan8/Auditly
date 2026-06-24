"""
Authentication + profile endpoints (custom, PostgreSQL-backed).

POST /api/auth/signup   → create account, return access token
POST /api/auth/login    → email-or-username + password, return access token
GET  /api/auth/me       → current user profile
PATCH /api/auth/me      → update username/email and/or profile picture (local storage)
"""

from __future__ import annotations

import logging
import re
import uuid

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, field_validator

from api.deps import get_auth_user
from db.postgres import get_pool
from services import create_access_token, hash_password, verify_password
from storage import save_data_url

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{3,32}$")


def _user_public(row) -> dict:
    return {
        "id": str(row["id"]),
        "username": row["username"],
        "email": row["email"],
        "pfp_url": row["pfp_url"],
    }


# ── Signup ──────────────────────────────────────────────────────────────────

class SignupPayload(BaseModel):
    username: str
    email: EmailStr
    password: str

    @field_validator("username")
    @classmethod
    def _valid_username(cls, v: str) -> str:
        v = v.strip()
        if not _USERNAME_RE.match(v):
            raise ValueError("Username must be 3-32 chars: letters, numbers, . _ -")
        return v

    @field_validator("password")
    @classmethod
    def _valid_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


@router.post("/signup", status_code=201)
async def signup(body: SignupPayload) -> dict:
    pool = await get_pool()
    pw_hash = hash_password(body.password)
    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO users (username, email, password_hash)
                VALUES ($1, $2, $3)
                RETURNING id, username, email, pfp_url
                """,
                body.username, body.email.lower(), pw_hash,
            )
        except asyncpg.UniqueViolationError as exc:
            field = "email" if "email" in str(exc) else "username"
            raise HTTPException(status.HTTP_409_CONFLICT, f"That {field} is already taken")

    user = _user_public(row)
    token = create_access_token(user["id"], user["username"], user["email"])
    return {"token": token, "user": user}


# ── Login ───────────────────────────────────────────────────────────────────

class LoginPayload(BaseModel):
    identifier: str   # email or username
    password: str


@router.post("/login")
async def login(body: LoginPayload) -> dict:
    pool = await get_pool()
    ident = body.identifier.strip().lower()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, username, email, pfp_url, password_hash
            FROM users
            WHERE lower(email) = $1 OR lower(username) = $1
            """,
            ident,
        )

    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    user = _user_public(row)
    token = create_access_token(user["id"], user["username"], user["email"])
    return {"token": token, "user": user}


# ── Current user ──────────────────────────────────────────────────────────────

@router.get("/me")
async def me(auth: dict = Depends(get_auth_user)) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, username, email, pfp_url FROM users WHERE id = $1",
            uuid.UUID(auth["user_id"]),
        )
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return _user_public(row)


# ── Update profile ────────────────────────────────────────────────────────────

class UpdateProfilePayload(BaseModel):
    username: str | None = None
    email: EmailStr | None = None
    pfp_base64: str | None = None   # raw base64 (no data: prefix)

    @field_validator("username")
    @classmethod
    def _valid_username(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not _USERNAME_RE.match(v):
            raise ValueError("Username must be 3-32 chars: letters, numbers, . _ -")
        return v


@router.patch("/me")
async def update_me(
    body: UpdateProfilePayload,
    auth: dict = Depends(get_auth_user),
) -> dict:
    pool = await get_pool()
    user_id = uuid.UUID(auth["user_id"])

    pfp_url: str | None = None
    if body.pfp_base64:
        try:
            pfp_url = save_data_url(f"data:image/png;base64,{body.pfp_base64}")
        except Exception as exc:
            log.error("[auth] avatar upload failed: %s", exc)
            raise HTTPException(500, "Profile picture upload failed")

    sets: list[str] = []
    params: list = []
    idx = 1
    if body.username is not None:
        sets.append(f"username = ${idx}"); params.append(body.username); idx += 1
    if body.email is not None:
        sets.append(f"email = ${idx}"); params.append(body.email.lower()); idx += 1
    if pfp_url is not None:
        sets.append(f"pfp_url = ${idx}"); params.append(pfp_url); idx += 1

    if not sets:
        raise HTTPException(400, "Nothing to update")

    params.append(user_id)
    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                f"UPDATE users SET {', '.join(sets)} WHERE id = ${idx} "
                f"RETURNING id, username, email, pfp_url",
                *params,
            )
        except asyncpg.UniqueViolationError as exc:
            field = "email" if "email" in str(exc) else "username"
            raise HTTPException(status.HTTP_409_CONFLICT, f"That {field} is already taken")

    return _user_public(row)


# ── Reset password ────────────────────────────────────────────────────────────

class ResetPasswordPayload(BaseModel):
    new_password: str = "welcome@123"

    @field_validator("new_password")
    @classmethod
    def _valid_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordPayload,
    auth: dict = Depends(get_auth_user),
) -> dict:
    """Reset the authenticated user's password (defaults to welcome@123)."""
    pool = await get_pool()
    pw_hash = hash_password(body.new_password)
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE users SET password_hash = $1 WHERE id = $2",
            pw_hash, uuid.UUID(auth["user_id"]),
        )
    if result.endswith("0"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return {"reset": True}
