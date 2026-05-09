"""Tests for the hybrid router."""
import pytest
from unittest.mock import patch


def test_structured_route_for_number_query():
    from app.retrieval.router import route
    with patch("app.retrieval.router._llm_route", return_value=None):
        r = route("What is the maximum VOC limit of 30 g/L?", client_hint="Aurora Paints")
    assert r.use_structured is True


def test_unstructured_route_for_guidance_query():
    from app.retrieval.router import route
    with patch("app.retrieval.router._llm_route", return_value=None):
        r = route("What ventilation guidance is recommended?", client_hint="Horizon Coatings")
    assert r.use_unstructured is True


def test_both_routes_for_comparison():
    from app.retrieval.router import route
    with patch("app.retrieval.router._llm_route", return_value=None):
        r = route(
            "Comparing client Aurora Paints and client Horizon Coatings, which has stricter VOC?",
            clients_hint=["Aurora Paints", "Horizon Coatings"],
        )
    assert r.use_structured is True
    assert r.clients == ["Aurora Paints", "Horizon Coatings"]


def test_route_client_filter_passed_through():
    from app.retrieval.router import route
    with patch("app.retrieval.router._llm_route", return_value=None):
        r = route("What is the max lead content?", client_hint="Aurora Paints")
    assert r.client_filter == "Aurora Paints"
