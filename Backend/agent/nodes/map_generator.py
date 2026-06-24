"""
Node 2 — MAP Generator

Takes the structured parse from Node 1 and generates Measurable Action Points (MAPs)
with department assignments, steps, summaries, priorities, and deadlines.
"""

from __future__ import annotations

import json
import logging
import os
import re

import httpx

from agent.llm_client import invoke_llm, make_llm
from agent.prompts import DEPARTMENTS, MAP_USER_TMPL, build_map_system
from agent.state import AgentState

log = logging.getLogger(__name__)

_INTERNAL_API_URL = os.environ.get("INTERNAL_API_URL", "http://localhost:9000")
_INTERNAL_SECRET = os.environ.get("INTERNAL_SECRET", "")


def _fetch_departments() -> list[dict]:
    """Fetch the org-wide department registry so the taxonomy is dynamic.

    Falls back to the built-in defaults if the API is unreachable or empty.
    """
    try:
        resp = httpx.get(
            f"{_INTERNAL_API_URL}/internal/departments",
            headers={"X-Internal-Token": _INTERNAL_SECRET},
            timeout=10,
        )
        resp.raise_for_status()
        depts = resp.json().get("departments", [])
        if depts:
            log.info("[map_generator] Using %d department(s) from registry", len(depts))
            return depts
    except Exception as exc:
        log.warning("[map_generator] Department registry fetch failed (%s) — using defaults", exc)
    return DEPARTMENTS


def map_generator_node(state: AgentState) -> AgentState:
    if state.get("error"):
        log.warning("[map_generator] Skipping — upstream error: %s", state["error"])
        return state

    title  = state["title"]
    parsed = state["parsed"]

    log.info("[map_generator] ── START ─────────────────────────────────────────")
    log.info(
        "[map_generator] Generating MAPs for '%s' (%d mandate(s))",
        title, len(parsed.get("mandates", [])),
    )

    departments = _fetch_departments()
    map_system  = build_map_system(departments)

    llm      = make_llm()
    messages = [
        ("system", map_system),
        ("human",  MAP_USER_TMPL.format(
            title=title,
            parsed_json=json.dumps(parsed, indent=2),
        )),
    ]

    try:
        raw = invoke_llm(llm, messages)
    except Exception as exc:
        log.error("[map_generator] LLM call failed: %s", exc)
        return {**state, "error": f"LLM MAP generation failed: {exc}"}

    # ── Parse JSON ────────────────────────────────────────────────────────
    try:
        result = json.loads(raw.strip())
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            result = json.loads(match.group())
        else:
            log.error("[map_generator] Could not parse JSON:\n%s", raw[:500])
            return {**state, "error": "JSON parse failed in map_generator"}

    maps            = result.get("maps", [])
    overall_summary = result.get("overall_summary", "")

    # ── Assign sequential IDs if the model forgot ─────────────────────────
    for i, m in enumerate(maps):
        if not m.get("id"):
            m["id"] = f"MAP-{i+1:03d}"

    # ── Log output ────────────────────────────────────────────────────────
    dept_set = {m.get("department", "Unknown") for m in maps}
    log.info("[map_generator] Generated %d MAP(s) across %d department(s): %s",
             len(maps), len(dept_set), ", ".join(sorted(dept_set)))
    log.info("[map_generator] Overall summary: %s", overall_summary[:300])

    for m in maps:
        log.info(
            "[map_generator]   %s | %s | dept=%s | priority=%s | deadline=%s | %d step(s)",
            m.get("id"), m.get("title", "")[:60],
            m.get("department"), m.get("priority"), m.get("deadline"),
            len(m.get("steps", [])),
        )

    log.info("[map_generator] ── DONE ──────────────────────────────────────────")

    return {**state, "maps": maps, "overall_summary": overall_summary, "error": None}
