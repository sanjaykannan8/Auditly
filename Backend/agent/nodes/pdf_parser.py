"""
Node 1 — PDF Parser

Downloads the PDF from pdf_url, converts it to Markdown via MarkItDown,
then calls the local Ollama model to extract structured compliance information.

For image-only (scanned) PDFs where MarkItDown returns empty text, falls back to
OCR via Tesseract + pdf2image. The OCR text is plain (no Markdown decoration) but
is good enough for short regulatory letters/circulars — which is the typical case
for scanned documents.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from urllib.parse import unquote, urlparse
from urllib.request import url2pathname

import pytesseract
from markitdown import MarkItDown
from pdf2image import convert_from_path

from agent.llm_client import invoke_llm_json, make_llm
from agent.prompts import PARSER_SYSTEM, PARSER_USER_TMPL
from agent.state import AgentState

log = logging.getLogger(__name__)

_md = MarkItDown()

# ── Tesseract / Poppler binary paths ─────────────────────────────────────────
# Resolved once at import time; can be overridden via environment variables so
# this works whether the binaries are on PATH (Linux/CI) or at fixed Windows paths.

_TESSERACT_DEFAULT = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
_POPPLER_DEFAULT   = r"C:\Users\ASUS\AppData\Local\Microsoft\WinGet\Packages\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\poppler-25.07.0\Library\bin"

_TESSERACT_CMD  = os.environ.get("TESSERACT_CMD",  _TESSERACT_DEFAULT)
_POPPLER_PATH   = os.environ.get("POPPLER_PATH",   _POPPLER_DEFAULT) or None

# Tell pytesseract where the binary lives (no-op if tesseract is already on PATH)
if Path(_TESSERACT_CMD).exists():
    pytesseract.pytesseract.tesseract_cmd = _TESSERACT_CMD


def _normalize_source(pdf_url: str) -> str:
    """MarkItDown reads http(s) URLs and local paths; convert file:// URLs to a path."""
    if pdf_url.startswith("file://"):
        return url2pathname(unquote(urlparse(pdf_url).path))
    return pdf_url


def _ocr_pdf(pdf_path: str) -> str:
    """
    Fallback for image-only PDFs.

    Renders each page to a PIL image at 300 DPI then runs Tesseract OCR on it.
    Pages are joined with a form-feed separator so the LLM can tell them apart.
    Returns plain text (no Markdown) — sufficient for short regulatory circulars.
    """
    log.info("[pdf_parser] OCR fallback — rendering pages at 300 DPI  path=%s", pdf_path)

    poppler_kwargs: dict = {}
    if _POPPLER_PATH and Path(_POPPLER_PATH).exists():
        poppler_kwargs["poppler_path"] = _POPPLER_PATH

    try:
        images = convert_from_path(pdf_path, dpi=300, **poppler_kwargs)
    except Exception as exc:
        raise RuntimeError(f"pdf2image page rendering failed: {exc}") from exc

    log.info("[pdf_parser] OCR: %d page(s) to process", len(images))

    page_texts: list[str] = []
    for i, img in enumerate(images, start=1):
        text = pytesseract.image_to_string(img, lang="eng")
        words = len(text.split())
        log.info("[pdf_parser] OCR page %d — ~%d words", i, words)
        page_texts.append(text.strip())

    combined = "\n\n---\n\n".join(page_texts)
    log.info("[pdf_parser] OCR complete — ~%d total words", len(combined.split()))
    return combined


def pdf_parser_node(state: AgentState) -> AgentState:
    pdf_url = state["pdf_url"]
    title   = state["title"]

    log.info("[pdf_parser] ── START ──────────────────────────────────────────")
    log.info("[pdf_parser] Converting PDF → text  url=%s", pdf_url)

    source = _normalize_source(pdf_url)

    # ── Step 1a: Try MarkItDown (fast, structure-preserving) ─────────────
    try:
        result        = _md.convert(source)
        markdown_text = result.text_content or ""
    except Exception as exc:
        log.error("[pdf_parser] MarkItDown failed: %s", exc)
        return {**state, "error": f"PDF conversion failed: {exc}"}

    word_count = len(markdown_text.split())
    log.info("[pdf_parser] MarkItDown — ~%d words", word_count)

    # ── Step 1b: OCR fallback for image-only PDFs ─────────────────────────
    ocr_used = False
    if not markdown_text.strip():
        log.warning("[pdf_parser] Empty text from MarkItDown — trying OCR fallback")
        # OCR only works on local file paths, not HTTP URLs
        local_path = source if not source.startswith("http") else None
        if local_path is None:
            log.error("[pdf_parser] Cannot OCR a remote URL — no local path available")
            return {**state, "error": "PDF produced empty text and is not a local file; cannot OCR"}

        try:
            markdown_text = _ocr_pdf(local_path)
            ocr_used = True
        except Exception as exc:
            log.error("[pdf_parser] OCR fallback failed: %s", exc)
            return {**state, "error": f"PDF produced empty text; OCR also failed: {exc}"}

        if not markdown_text.strip():
            log.error("[pdf_parser] OCR returned empty text — PDF may be corrupt or blank")
            return {**state, "error": "PDF produced empty text even after OCR — document may be corrupt or blank"}

        log.info("[pdf_parser] OCR succeeded — ~%d words extracted", len(markdown_text.split()))

    # ── Step 2: LLM structured extraction ─────────────────────────────────
    source_note = " [extracted via OCR]" if ocr_used else ""
    log.info("[pdf_parser] Calling LLM for structured extraction%s...", source_note)

    llm      = make_llm()
    messages = [
        ("system", PARSER_SYSTEM),
        ("human",  PARSER_USER_TMPL.format(title=title, markdown_text=markdown_text[:12_000])),
    ]

    try:
        parsed = invoke_llm_json(llm, messages)
    except Exception as exc:
        log.error("[pdf_parser] LLM call failed: %s", exc)
        return {**state, "markdown_text": markdown_text, "error": f"LLM extraction failed: {exc}"}

    n_mandates  = len(parsed.get("mandates", []))
    n_deadlines = len(parsed.get("deadlines", []))
    n_entities  = len(parsed.get("affected_entities", []))

    log.info(
        "[pdf_parser] Parsed: %d mandate(s), %d deadline(s), %d affected entity type(s)%s",
        n_mandates, n_deadlines, n_entities, source_note,
    )
    log.info("[pdf_parser] Summary: %s", parsed.get("summary", "")[:200])
    log.info("[pdf_parser] ── DONE ───────────────────────────────────────────")

    return {**state, "markdown_text": markdown_text, "parsed": parsed, "error": None}
