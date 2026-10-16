"""Regression checks: user details must not fetch all historical expenses."""
import os
from datetime import date
from unittest.mock import patch

os.environ.setdefault("ENVIRONMENT", "testing")

import pytest
from fastapi.testclient import TestClient

from api import app
from app import database
from app.migrations import manager


@pytest.fixture
def session(tmp_path, monkeypatch):
    path = str(tmp_path / "lean_profile.db")
    monkeypatch.setattr(database, "DATABASE_NAME", path)
    monkeypatch.setattr(manager, "DATABASE_NAME", path)
    manager.run_migrations()
    with TestClient(app) as client:
        user = {"name": "lean_profile_user", "email": "lean@example.com",
                "income": 200000, "password": "LongSecurePassword123!"}
        registration = client.post("/api/v1/users", json=user)
        assert registration.status_code == 200, registration.text
        login = client.post("/api/v1/login", json={
            "email": user["email"], "password": user["password"]
        })
        assert login.status_code == 200, login.text
        headers = {"Authorization": "Bearer " + login.json()["access_token"]}
        yield client, headers


def test_lean_profile_skips_history_but_retains_real_monthly_totals(session):
    client, headers = session
    for amount, when in [(1250.25, date.today().isoformat()),
                         (5000.50, "2025-01-15")]:
        r = client.post("/api/v1/expenses", headers=headers, json={
            "amount": amount, "category": "Food",
            "description": "Example receipt", "date": when
        })
        assert r.status_code == 200, r.text

    with patch.object(database, "get_expenses",
                      side_effect=AssertionError("Full history should not load")):
        lean = client.get("/api/v1/users/me?include_expenses=false", headers=headers)

    assert lean.status_code == 200, lean.text
    assert lean.json()["expenses"] == []
    assert lean.json()["total_expenses"] == pytest.approx(1250.25)
    assert lean.json()["balance"] == pytest.approx(198749.75)
    assert lean.json()["name"] == "lean_profile_user"

    legacy = client.get("/api/v1/users/me", headers=headers)
    assert legacy.status_code == 200, legacy.text
    assert len(legacy.json()["expenses"]) == 2
    assert legacy.json()["total_expenses"] == pytest.approx(1250.25)


def test_lean_profile_opens_only_two_database_connections(session, monkeypatch):
    client, headers = session
    real_connect = database.create_connection
    calls = []

    def counted_connection():
        calls.append(1)
        return real_connect()

    monkeypatch.setattr(database, "create_connection", counted_connection)
    response = client.get("/api/v1/users/me?include_expenses=false", headers=headers)
    assert response.status_code == 200
    # One authentication lookup + one SQL query for monthly totals.
    assert len(calls) == 2


def test_profile_is_private_even_when_history_excluded(session):
    client, _ = session
    response = client.get("/api/v1/users/me?include_expenses=false")
    assert response.status_code in (401, 403)
