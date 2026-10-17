"""Stage 2: two-user security regression tests.

Isolated SQLite database only. Never run these tests against Supabase or any
production PostgreSQL database.
"""
import os
import uuid
from datetime import date

os.environ.setdefault("ENVIRONMENT", "testing")

import pytest
from fastapi.testclient import TestClient
from api import app
from app import database
from app.migrations import manager


@pytest.fixture
def isolated_client(tmp_path, monkeypatch):
    db_file = str(tmp_path / "fundhaven_stage2_private.db")
    monkeypatch.setattr(database, "DATABASE_NAME", db_file)
    monkeypatch.setattr(manager, "DATABASE_NAME", db_file)
    manager.run_migrations()
    with TestClient(app) as client:
        yield client


def create_identity(client, label, income):
    suffix = uuid.uuid4().hex[:10]
    name = f"stage2_{label}_{suffix}"
    password = "TestOnlySecurePass123!"
    response = client.post("/api/v1/users", json={
        "name": name,
        "email": f"{name}@example.com",
        "password": password,
        "income": income,
    })
    assert response.status_code == 200, response.text
    login = client.post("/api/v1/login", json={
        "name": name, "password": password,
    })
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_budget_ownership_is_enforced_for_listing_update_and_delete(isolated_client):
    client = isolated_client
    alice = create_identity(client, "alice", 180000)
    bob = create_identity(client, "bob", 90000)

    first = client.post("/api/v1/budgets", headers=alice, json={
        "category": "Food", "amount": 50000,
    })
    assert first.status_code == 200, first.text
    alice_id = first.json()["id"]
    second = client.post("/api/v1/budgets", headers=bob, json={
        "category": "Food", "amount": 20000,
    })
    assert second.status_code == 200, second.text
    bob_id = second.json()["id"]

    alice_list = client.get("/api/v1/budgets", headers=alice)
    bob_list = client.get("/api/v1/budgets", headers=bob)
    assert alice_list.status_code == bob_list.status_code == 200
    assert {r["id"] for r in alice_list.json()["budgets"]} == {alice_id}
    assert {r["id"] for r in bob_list.json()["budgets"]} == {bob_id}

    attempted_update = client.put(
        f"/api/v1/budgets/{alice_id}", headers=bob,
        json={"category": "Travel", "amount": 1},
    )
    attempted_delete = client.delete(f"/api/v1/budgets/{alice_id}", headers=bob)
    assert attempted_update.status_code == 404
    assert attempted_delete.status_code == 404

    original = client.get("/api/v1/budgets", headers=alice).json()["budgets"]
    assert len(original) == 1
    assert original[0]["category"] == "Food"
    assert original[0]["amount"] == 50000


def test_monthly_dashboard_does_not_include_other_users_expenses(isolated_client):
    client = isolated_client
    alice = create_identity(client, "dashalice", 180000)
    bob = create_identity(client, "dashbob", 90000)
    today = date.today().isoformat()
    month = today[:7]

    expense = client.post("/api/v1/expenses", headers=alice, json={
        "amount": 12345, "category": "Food",
        "description": "Private user A purchase", "date": today,
    })
    assert expense.status_code == 200, expense.text
    alice_dashboard = client.get("/api/v1/dashboard", headers=alice,
                                 params={"month": month})
    bob_dashboard = client.get("/api/v1/dashboard", headers=bob,
                               params={"month": month})
    assert alice_dashboard.status_code == bob_dashboard.status_code == 200
    assert alice_dashboard.json()["total_expenses"] == 12345
    assert bob_dashboard.json()["total_expenses"] == 0
    assert bob_dashboard.json()["income"] == 90000

    bob_expenses = client.get("/api/v1/expenses", headers=bob,
                              params={"month": month})
    assert bob_expenses.status_code == 200
    assert bob_expenses.json()["expenses"] == []
