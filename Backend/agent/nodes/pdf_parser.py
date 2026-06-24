"""
Node 1 — PDF Parser

Downloads the PDF from pdf_url, converts it to Markdown via MarkItDown,
then calls the local Ollama model to extract structured compliance information.
"""

from __future__ import annotations

import json
import logging
from urllib.parse import unquote, urlparse
from urllib.request import url2pathname

from markitdown import MarkItDown

from agent.llm_client import invoke_llm, make_llm
from agent.prompts import PARSER_SYSTEM, PARSER_USER_TMPL
from agent.state import AgentState

log = logging.getLogger(__name__)

_md = MarkItDown()


def _normalize_source(pdf_url: str) -> str:
    """MarkItDown reads http(s) URLs and local paths; convert file:// URLs to a path."""
    if pdf_url.startswith("file://"):
        return url2pathname(unquote(urlparse(pdf_url).path))
    return pdf_url


def pdf_parser_node(state: AgentState) -> AgentState:
    pdf_url = state["pdf_url"]
    title   = state["title"]

    log.info("[pdf_parser] ── START ──────────────────────────────────────────")
    log.info("[pdf_parser] Converting PDF → Markdown  url=%s", pdf_url)

    # ── Step 1: PDF → Markdown ────────────────────────────────────────────
    try:
        result        = _md.convert(_normalize_source(pdf_url))
        markdown_text = result.text_content or ""
    except Exception as exc:
        log.error("[pdf_parser] MarkItDown failed: %s", exc)
        return {**state, "error": f"PDF conversion failed: {exc}"}

    token_estimate = len(markdown_text.split())
    log.info("[pdf_parser] Converted — ~%d words of Markdown", token_estimate)

    if not markdown_text.strip():
        log.warning("[pdf_parser] Empty markdown — PDF may be image-only or corrupt")
        return {**state, "error": "PDF produced empty text after conversion"}

    # ── Step 2: LLM structured extraction ─────────────────────────────────
    log.info("[pdf_parser] Calling LLM (Ollama) for structured extraction...")

    llm      = make_llm()
    messages = [
        ("system", PARSER_SYSTEM),
        ("human",  PARSER_USER_TMPL.format(title=title, markdown_text=markdown_text[:12_000])),
    ]

    try:
        raw = invoke_llm(llm, messages)
    except Exception as exc:
        log.error("[pdf_parser] LLM call failed: %s", exc)
        return {**state, "markdown_text": markdown_text, "error": f"LLM extraction failed: {exc}"}

    # ── Step 3: Parse JSON response ───────────────────────────────────────
    try:
        parsed = json.loads(raw.strip())
    except json.JSONDecodeError:
        # Try to extract JSON block if the model wrapped it in fences
        import re
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            parsed = json.loads(match.group())
        else:
            log.error("[pdf_parser] Could not parse JSON from Groq response:\n%s", raw[:500])
            return {**state, "markdown_text": markdown_text, "error": "JSON parse failed in pdf_parser"}

    n_mandates  = len(parsed.get("mandates", []))
    n_deadlines = len(parsed.get("deadlines", []))
    n_entities  = len(parsed.get("affected_entities", []))

    log.info(
        "[pdf_parser] Parsed: %d mandate(s), %d deadline(s), %d affected entity type(s)",
        n_mandates, n_deadlines, n_entities,
    )
    log.info("[pdf_parser] Summary: %s", parsed.get("summary", "")[:200])
    log.info("[pdf_parser] ── DONE ───────────────────────────────────────────")

    return {**state, "markdown_text": markdown_text, "parsed": parsed, "error": None}
