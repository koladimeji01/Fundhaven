"""Regression tests for month-aware finance calculations.

Run with: pytest tests/test_monthly_finance.py -q
"""
import os
os.environ["ENVIRONMENT"] = "testing"

from datetime import date
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient

from api import app
from app.config import DATABASE_NAME
from app.migrations.manager import run_migrations
from app import database
from app.monthly import month_bounds, resolve_month


@pytest.fixture(autouse=True)
def fresh_database(tmp_path, monkeypatch):
    # The existing test suite uses its own isolated .env.test database.
    # Use the same configuration but preserve the file before each test.
    import app.database as database_module
    import app.migrations.manager as migrations_module
    path = str(tmp_path / "monthly_test.db")
    monkeypatch.setattr(database_module, "DATABASE_NAME", path)
    monkeypatch.setattr(migrations_module, "DATABASE_NAME", path)
    run_migrations()
    yield


@pytest.fixture
def session():
    with TestClient(app) as client:
        user = {
            "name": "monthly_" + uuid4().hex[:12],
            "email": "monthly_" + uuid4().hex[:12] + "@example.com",
            "income": 500000,
            "password": "password123"
        }
        registered = client.post("/api/v1/users", json=user)
        assert registered.status_code in (200, 201), registered.text
        login = client.post("/api/v1/login", json={
            "email": user["email"], "password": user["password"]
        })
        assert login.status_code == 200, login.text
        token = login.json()["access_token"]
        yield client, {"Authorization": f"Bearer {token}"}, user


def test_month_validation():
    assert month_bounds("2026-12") == ("2026-12-01", "2027-01-01")
    assert month_bounds("2026-02") == ("2026-02-01", "2026-03-01")
    with pytest.raises(ValueError):
        resolve_month("2026-13")
    with pytest.raises(ValueError):
        resolve_month("2026-1")


def test_expenses_are_isolated_by_month(session):
    client, headers, user = session
    current = date.today().strftime("%Y-%m")
    if current == "2026-02":
        earlier, later = "2026-01-30", "2026-03-01"
    else:
        earlier, later = "2026-02-28", "2026-03-01"

    for amount, day in [(25000, earlier), (35000, later)]:
        resp = client.post("/api/v1/expenses", headers=headers, json={
            "amount": amount,
            "category": "Food",
            "description": "Monthly transaction",
            "date": day,
        })
        assert resp.status_code in (200, 201), resp.text

    first = client.get("/api/v1/expenses?month=2026-02", headers=headers)
    second = client.get("/api/v1/expenses?month=2026-03", headers=headers)
    assert first.status_code == second.status_code == 200
    assert sum(e["amount"] for e in first.json()["expenses"]) == 25000
    assert sum(e["amount"] for e in second.json()["expenses"]) == 35000

    all_items = client.get("/api/v1/expenses", headers=headers)
    assert len(all_items.json()["expenses"]) == 2


def test_monthly_dashboard_and_budget(session):
    client, headers, user = session
    current = date.today().strftime("%Y-%m")
    old = "2025-11" if current != "2025-11" else "2025-10"
    budget = client.post("/api/v1/budgets", headers=headers, json={
        "category": "Food", "amount": 100000
    })
    assert budget.status_code == 200
    for amount, date_value in [
        (15000, old + "-15"), (24000, current + "-12")
    ]:
        assert client.post("/api/v1/expenses", headers=headers, json={
            "amount": amount,
            "category": "Food",
            "description": "Monthly groceries",
            "date": date_value,
        }).status_code == 200

    response = client.get(
        "/api/v1/dashboard", params={"month": current}, headers=headers
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["month"] == current
    assert data["income"] == 500000
    assert data["total_expenses"] == 24000
    assert data["balance"] == 476000
    assert data["budgets"][0]["spent"] == 24000
    assert data["budgets"][0]["usage_percentage"] == 24

    old_report = client.get(
        "/api/v1/users/me/dashboard",
        params={"month": old}, headers=headers
    )
    assert old_report.status_code == 200, old_report.text
    assert old_report.json()["total_expenses"] == 15000
    assert old_report.json()["income_recorded"] is False

    invalid = client.get("/api/v1/dashboard?month=2026-99", headers=headers)
    assert invalid.status_code == 422


def test_income_change_affects_current_month_only(session):
    client, headers, user = session
    month = date.today().strftime("%Y-%m")
    change = client.put("/api/v1/users/me", headers=headers, json={
        "name": user["name"], "income": 650000
    })
    assert change.status_code == 200, change.text
    dashboard = client.get(
        "/api/v1/dashboard", params={"month": month}, headers=headers
    )
    assert dashboard.status_code == 200
    assert dashboard.json()["income"] == 650000
