"""
Auditly FastAPI application — entry point.
"""

from __future__ import annotations

import logging
import logging.config
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api import audit, auth, dashboard, departments, head, internal, maps, onboarding, org, regulations, ws
from api.deps import get_current_user
from db.mongo import close_mongo, init_mongo
from db.postgres import close_pool, init_pool
from storage import UPLOAD_DIR

logging.config.dictConfig({
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "format": "%(asctime)s %(levelname)-8s %(name)s  %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S",
        }
    },
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "default"}},
    "root": {"level": "INFO", "handlers": ["console"]},
})

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    init_mongo()
    log.info("[startup] PostgreSQL pool and MongoDB client ready")
    yield
    await close_pool()
    await close_mongo()
    log.info("[shutdown] DB connections closed")


app = FastAPI(
    title="Auditly API",
    description="Event-driven compliance intelligence for Indian banks",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# ── Routers ────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(onboarding.router)
app.include_router(dashboard.router)
app.include_router(regulations.router)
app.include_router(maps.router)
app.include_router(departments.router)
app.include_router(org.router)
app.include_router(head.router)
app.include_router(audit.router)
app.include_router(ws.router)
app.include_router(internal.router)


# ── Legacy / meta ─────────────────────────────────────────────────────────
@app.get("/health", tags=["meta"])
def health_check():
    return {"status": "ok"}


@app.get("/api/me", tags=["auth"])
async def get_me(user: dict = Depends(get_current_user)):
    return {
        "user_id": user["user_id"],
        "org_id": user["org_id"],
        "role": user["role"],
        "org_name": user["org_name"],
    }
