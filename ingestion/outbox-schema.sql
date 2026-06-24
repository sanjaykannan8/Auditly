-- MySQL outbox for RBI Master Directions (replaces Cloudflare D1).
-- Auto-applied on first container boot via /docker-entrypoint-initdb.d.

CREATE TABLE IF NOT EXISTS rbi_directions (
    id             BIGINT AUTO_INCREMENT PRIMARY KEY,
    direction_id   VARCHAR(64)  NOT NULL,
    title          TEXT         NOT NULL,
    page_url       TEXT,
    pdf_url        TEXT,
    content_hash   CHAR(64),
    published_date VARCHAR(64),
    status         VARCHAR(16)  NOT NULL DEFAULT 'pending',   -- pending | published | failed
    created_at     DATETIME     NOT NULL,
    published_at   DATETIME,
    UNIQUE KEY uq_direction_pdf (direction_id, pdf_url(255)),
    KEY idx_status (status, created_at),
    KEY idx_hash (content_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
