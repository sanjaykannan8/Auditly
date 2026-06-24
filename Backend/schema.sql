-- Active: 1782117383451@@127.0.0.1@5400@auditly
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Application users (custom auth — username/email/password)
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    pfp_url       TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per bank
CREATE TABLE IF NOT EXISTS organizations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    logo_url   TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users belonging to an org (one user → one org)
CREATE TABLE IF NOT EXISTS org_members (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES organizations(id),
    user_id       TEXT NOT NULL,   -- users.id (as text)
    role          TEXT NOT NULL,   -- 'compliance_officer' | 'department_head'
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id)               -- one user can only belong to one org
);

-- Department definitions per org
CREATE TABLE IF NOT EXISTS departments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES organizations(id),
    name          TEXT NOT NULL,
    objective     TEXT,
    head_user_id  TEXT,            -- users.id of assigned dept head
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (org_id, name)
);

-- Regulation ingestion tracking
CREATE TABLE IF NOT EXISTS regulations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         UUID NOT NULL REFERENCES organizations(id),
    direction_id   TEXT NOT NULL,
    title          TEXT NOT NULL,
    pdf_url        TEXT,
    source         TEXT NOT NULL DEFAULT 'rbi',
    status         TEXT NOT NULL DEFAULT 'processing',
    published_date DATE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (org_id, direction_id)
);

-- Immutable event log for PDF audit reports
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organizations(id),
    actor_id    TEXT NOT NULL,   -- users.id
    actor_role  TEXT NOT NULL,
    entity_type TEXT NOT NULL,   -- 'map' | 'regulation' | 'department'
    entity_id   TEXT NOT NULL,
    action      TEXT NOT NULL,
    details     JSONB,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invitation tokens for dept heads to join an org
CREATE TABLE IF NOT EXISTS org_invitations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     UUID NOT NULL REFERENCES organizations(id),
    dept_id    UUID NOT NULL REFERENCES departments(id),
    jti        TEXT NOT NULL UNIQUE,
    used       BOOL NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_members_user    ON org_members  (user_id);
CREATE INDEX IF NOT EXISTS idx_departments_org ON departments  (org_id);
CREATE INDEX IF NOT EXISTS idx_regulations_org ON regulations  (org_id);
CREATE INDEX IF NOT EXISTS idx_audit_org_ts    ON audit_log    (org_id, timestamp DESC);
