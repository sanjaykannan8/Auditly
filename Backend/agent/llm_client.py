"""
LLM client — local Ollama only (no cloud fallback).

Config (env):
  OLLAMA_MODEL      default "gemma4:e4b"
  OLLAMA_BASE_URL   default "http://localhost:11434"
"""

from __future__ import annotations

import json
import logging
import os
import re

from dotenv import load_dotenv
from langchain_core.runnables import Runnable
from langchain_ollama import ChatOllama

load_dotenv()

log = logging.getLogger(__name__)

OLLAMA_MODEL    = os.environ.get("OLLAMA_MODEL", "gemma4:e4b")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")

_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def make_llm(temperature: float = 0.0) -> Runnable:
    """Return the local Ollama chat model with thinking/reasoning disabled."""
    return ChatOllama(
        model=OLLAMA_MODEL,
        base_url=OLLAMA_BASE_URL,
        temperature=temperature,
        reasoning=False,
    )


def invoke_llm(llm: Runnable, messages: list) -> str:
    """Call llm.invoke and return the text content."""
    response = llm.invoke(messages)
    return response.content


def _try_parse_json(raw: str) -> dict | None:
    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError:
        pass
    match = _JSON_OBJECT_RE.search(raw)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


def invoke_llm_json(llm: Runnable, messages: list, max_attempts: int = 3) -> dict:
    """
    Call the LLM expecting a JSON object back. Local models occasionally emit
    malformed JSON (unterminated strings, missing commas, especially on long
    outputs) — instead of failing the whole pipeline on the first bad
    generation, nudge the model to fix its own output and retry.
    """
    history = list(messages)
    raw = ""
    for attempt in range(1, max_attempts + 1):
        raw = invoke_llm(llm, history)
        parsed = _try_parse_json(raw)
        if parsed is not None:
            return parsed

        log.warning(
            "[llm] Attempt %d/%d returned invalid JSON, asking the model to fix it",
            attempt, max_attempts,
        )
        history = history + [
            ("ai", raw),
            ("human",
             "That was not valid JSON. Respond again with ONLY a single valid JSON "
             "object — no markdown fences, no commentary, no trailing commas, and "
             "make sure every string is properly closed and escaped."),
        ]

    raise ValueError(f"LLM did not return valid JSON after {max_attempts} attempts. Last response: {raw[:500]!r}")
