"""
Node 3 — Compliance Validator

Cross-checks the generated MAPs against the source markdown and parsed data
to detect hallucinations (invented deadlines, non-existent requirements, etc.).
"""

from __future__ import annotations

import json
import logging

from agent.llm_client import invoke_llm_json, make_llm
from agent.prompts import VALIDATOR_SYSTEM, VALIDATOR_USER_TMPL
from agent.state import AgentState

log = logging.getLogger(__name__)


def validator_node(state: AgentState) -> AgentState:
    if state.get("error"):
        log.warning("[validator] Skipping — upstream error: %s", state["error"])
        return state

    title         = state["title"]
    markdown_text = state.get("markdown_text", "")
    parsed        = state.get("parsed", {})
    maps          = state.get("maps", [])

    log.info("[validator] ── START ────────────────────────────────────────────")
    log.info("[validator] Validating %d MAP(s) against source document...", len(maps))

    llm      = make_llm()
    messages = [
        ("system", VALIDATOR_SYSTEM),
        ("human",  VALIDATOR_USER_TMPL.format(
            title=title,
            markdown_snippet=markdown_text[:6_000],
            parsed_json=json.dumps(parsed, indent=2),
            maps_json=json.dumps(maps, indent=2),
        )),
    ]

    try:
        validation = invoke_llm_json(llm, messages)
    except Exception as exc:
        log.error("[validator] LLM call failed: %s", exc)
        return {**state, "error": f"LLM validation failed: {exc}"}

    is_valid   = validation.get("is_valid", False)
    confidence = validation.get("confidence_score", 0.0)
    issues     = validation.get("issues", [])

    if is_valid:
        log.info("[validator] Validation PASSED — confidence %.2f", confidence)
    else:
        log.warning("[validator] Validation FAILED — confidence %.2f — %d issue(s):", confidence, len(issues))
        for issue in issues:
            log.warning("[validator]   ✗ %s", issue)

    log.info("[validator] ── DONE ───────────────────────────────────────────")

    return {**state, "validation": validation, "error": None}
