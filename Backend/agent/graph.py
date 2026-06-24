"""
LangGraph workflow: pdf_parser → map_generator → validator
"""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from agent.nodes.map_generator import map_generator_node
from agent.nodes.pdf_parser import pdf_parser_node
from agent.nodes.validator import validator_node
from agent.state import AgentState


def build_graph() -> StateGraph:
    g = StateGraph(AgentState)

    g.add_node("pdf_parser",    pdf_parser_node)
    g.add_node("map_generator", map_generator_node)
    g.add_node("validator",     validator_node)

    g.add_edge(START,          "pdf_parser")
    g.add_edge("pdf_parser",   "map_generator")
    g.add_edge("map_generator","validator")
    g.add_edge("validator",    END)

    return g.compile()


# Module-level compiled graph — imported by consumer.py
compliance_graph = build_graph()
