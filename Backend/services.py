"""
Authentication utilities — custom JWT + password hashing (no third-party auth provider).

- Passwords hashed with bcrypt.
- Access tokens are HS256 JWTs signed with AUTH_SECRET, carrying the user id (sub),
  username and email.
"""

import logging
import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt as pyjwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError

load_dotenv()

logger = logging.getLogger(__name__)

AUTH_SECRET = os.getenv("AUTH_SECRET", "")
if not AUTH_SECRET:
    raise RuntimeError("AUTH_SECRET is not set. Add it to your .env file before starting the server.")

ALGORITHM = "HS256"
ACCESS_TOKEN_TTL = timedelta(days=7)

_http_bearer = HTTPBearer(auto_error=True)


# ── Password hashing ────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ── JWT ─────────────────────────────────────────────────────────────────────

def create_access_token(user_id: str, username: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "username": username,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int((now + ACCESS_TOKEN_TTL).timestamp()),
    }
    return pyjwt.encode(payload, AUTH_SECRET, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode + verify our own access token. Raises HTTP 401 on any failure."""
    try:
        return pyjwt.decode(token, AUTH_SECRET, algorithms=[ALGORITHM])
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except InvalidTokenError as exc:
        logger.warning("Rejected invalid JWT: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(_http_bearer),
) -> dict:
    """FastAPI dependency — validates the access token in `Authorization: Bearer <token>`."""
    return decode_access_token(credentials.credentials)
