"""
LLM client — local Ollama only (no cloud fallback).

Config (env):
  OLLAMA_MODEL      default "gemma4:e4b"
  OLLAMA_BASE_URL   default "http://localhost:11434"
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from langchain_core.runnables import Runnable
from langchain_ollama import ChatOllama

load_dotenv()

OLLAMA_MODEL    = os.environ.get("OLLAMA_MODEL", "gemma4:e4b")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")


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
