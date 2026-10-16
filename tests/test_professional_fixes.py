"""Regression tests for account security and budget integrity."""
import os
from datetime import date

os.environ.setdefault("ENVIRONMENT", "testing")

import pytest
from fastapi.testclient import TestClient

from api import app
from app import database
from app.migrations import manager


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_path = str(tmp_path / "secure_finance.db")
    monkeypatch.setattr(database, "DATABASE_NAME", db_path)
    monkeypatch.setattr(manager, "DATABASE_NAME", db_path)
    manager.run_migrations()
    with TestClient(app) as c:
        yield c


def account(client, name="audituser"):
    password = "ExamplePassword123!"
    r = client.post("/api/v1/users", json={
        "name": name, "email": f"{name}@example.com",
        "income": 150000, "password": password,
    })
    assert r.status_code == 200, r.text
    r = client.post("/api/v1/login", json={"name": name, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, password


def test_wrong_current_password_does_not_claim_success(client):
    headers, password = account(client)
    r = client.put("/api/v1/users/me/password", headers=headers, json={
        "current_password": "WrongPassword123!",
        "new_password": "ReplacementPassword123!",
        "confirm_password": "ReplacementPassword123!",
    })
    assert r.status_code == 400, r.text
    assert client.get("/api/v1/users/me", headers=headers).status_code == 200


def test_changed_password_revokes_old_access_tokens(client):
    headers, password = account(client)
    new_password = "ReplacementPassword123!"
    r = client.put("/api/v1/users/me/password", headers=headers, json={
        "current_password": password,
        "new_password": new_password,
        "confirm_password": new_password,
    })
    assert r.status_code == 200, r.text
    assert client.get("/api/v1/users/me", headers=headers).status_code == 401
    assert client.post("/api/v1/login", json={
        "name": "audituser", "password": password
    }).status_code == 401
    assert client.post("/api/v1/login", json={
        "name": "audituser", "password": new_password
    }).status_code == 200


def test_duplicate_budget_categories_are_blocked(client):
    headers, _ = account(client)
    first = client.post("/api/v1/budgets", headers=headers, json={
        "category": "Food", "amount": 100000
    })
    assert first.status_code == 200, first.text
    repeated = client.post("/api/v1/budgets", headers=headers, json={
        "category": " food ", "amount": 25000
    })
    assert repeated.status_code == 409, repeated.text
    assert len(client.get("/api/v1/budgets", headers=headers).json()["budgets"]) == 1


def test_legacy_duplicate_budgets_do_not_double_count_spending(client):
    headers, _ = account(client)
    user_id = client.get("/api/v1/users/me", headers=headers).json()["id"]
    conn = database.create_connection()
    try:
        conn.execute("INSERT INTO budgets (user_id, category, amount) VALUES (?, ?, ?)", (user_id, "Food", 50000))
        conn.execute("INSERT INTO budgets (user_id, category, amount) VALUES (?, ?, ?)", (user_id, "food", 30000))
        conn.commit()
    finally:
        conn.close()
    r = client.post("/api/v1/expenses", headers=headers, json={
        "category": "FOOD", "amount": 20000,
        "description": "Groceries", "date": date.today().isoformat(),
    })
    assert r.status_code == 200, r.text
    dashboard = client.get("/api/v1/dashboard", headers=headers).json()
    assert len(dashboard["budgets"]) == 1
    assert dashboard["total_budget"] == 80000
    assert dashboard["total_budget_spent"] == 20000


def test_goal_date_can_be_cleared(client):
    headers, _ = account(client)
    goal = client.post("/api/v1/goals", headers=headers, json={
        "name": "Emergency", "target_amount": 30000,
        "target_date": "2027-01-02",
    })
    assert goal.status_code == 200, goal.text
    goal_id = goal.json()["id"]
    updated = client.put(f"/api/v1/goals/{goal_id}", headers=headers, json={
        "target_date": None
    })
    assert updated.status_code == 200, updated.text
    assert updated.json()["target_date"] is None


def test_delete_account_requires_password_and_confirmation(client):
    headers, password = account(client)
    bad = client.request("DELETE", "/api/v1/users/me", headers=headers, json={
        "password": "incorrect", "confirmation": "DELETE"
    })
    assert bad.status_code == 400, bad.text
    assert client.get("/api/v1/users/me", headers=headers).status_code == 200
    deleted = client.request("DELETE", "/api/v1/users/me", headers=headers, json={
        "password": password, "confirmation": "DELETE"
    })
    assert deleted.status_code == 200, deleted.text
    assert client.get("/api/v1/users/me", headers=headers).status_code == 401


def test_non_finite_profile_income_is_rejected(client):
    headers, _ = account(client)
    r = client.put("/api/v1/users/me", headers=headers, json={
        "name": "audituser", "income": "Infinity"
    })
    assert r.status_code == 422, r.text
