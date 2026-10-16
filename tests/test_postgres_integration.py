"""Real PostgreSQL smoke and data migration tests.

Run only against an EPHEMERAL local test DB, e.g. GitHub Actions service:
    BUDGETWISE_TEST_POSTGRES=1 DATABASE_URL=postgresql://.../budgetwise_test
    pytest tests/test_postgres_integration.py -q

Never point these tests at a Supabase/production database: the fixture
intentionally TRUNCATEs users and all related test data.
"""
from datetime import date
import os
from pathlib import Path
from urllib.parse import urlparse

os.environ["ENVIRONMENT"] = "testing"

import psycopg
import pytest
from fastapi.testclient import TestClient

from api import app
from app import database
from app.auth import hash_password
from app.db_backend import using_postgres
from app.migrations.sqlite_to_postgres import migrate_sqlite_to_postgres


@pytest.fixture(autouse=True)
def safe_postgres_test_database():
    """Refuse destructive fixture if target isn't a local test DB."""
    url = os.environ.get("DATABASE_URL", "")
    parsed = urlparse(url)

    if not (
        os.environ.get("BUDGETWISE_TEST_POSTGRES") == "1"
        and parsed.hostname in {"localhost", "127.0.0.1"}
        and parsed.path == "/budgetwise_test"
        and using_postgres()
    ):
        pytest.skip("PostgreSQL test service is not configured")

    with TestClient(app) as client:
        with psycopg.connect(url) as conn:
            conn.execute("TRUNCATE users RESTART IDENTITY CASCADE")
            conn.commit()
        yield client


def register_and_sign_in(client):
    user = {
        "name": "pg_budgetwise_user",
        "email": "postgres@example.com",
        "income": 450000,
        "password": "password123",
    }
    registration = client.post("/api/v1/users", json=user)
    assert registration.status_code in (200, 201), registration.text
    login = client.post("/api/v1/login", json={
        "email": user["email"], "password": user["password"]
    })
    assert login.status_code == 200, login.text
    assert "access_token" in login.json()
    return {"Authorization": "Bearer " + login.json()["access_token"]}, user


def test_postgres_full_budgetwise_flow(safe_postgres_test_database):
    client = safe_postgres_test_database
    auth, user = register_and_sign_in(client)

    profile = client.get("/api/v1/users/me", headers=auth)
    assert profile.status_code == 200
    assert profile.json()["name"] == user["name"]

    lean = client.get("/api/v1/users/me?include_expenses=false", headers=auth)
    assert lean.status_code == 200, lean.text
    assert lean.json()["expenses"] == []
    assert lean.json()["income"] == 450000

    transaction = client.post("/api/v1/expenses", headers=auth, json={
        "amount": 25340.25,
        "category": "Food",
        "description": "Lunch and groceries",
        "date": date.today().isoformat(),
    })
    assert transaction.status_code == 200, transaction.text

    budget = client.post("/api/v1/budgets", headers=auth, json={
        "category": "Food", "amount": 85000
    })
    assert budget.status_code == 200, budget.text
    assert budget.json()["id"] > 0

    goal = client.post("/api/v1/goals", headers=auth, json={
        "name": "New laptop", "target_amount": 400000,
        "current_amount": 50000, "target_date": "2027-12-01"
    })
    assert goal.status_code == 200, goal.text
    assert goal.json()["id"] > 0

    current = date.today().strftime("%Y-%m")
    report = client.get(
        "/api/v1/dashboard", params={"month": current}, headers=auth
    )
    assert report.status_code == 200, report.text
    assert report.json()["income"] == 450000
    assert report.json()["total_expenses"] == pytest.approx(25340.25)
    assert report.json()["budgets"][0]["spent"] == pytest.approx(25340.25)

    records = client.get(
        "/api/v1/expenses", params={"month": current}, headers=auth
    )
    assert records.status_code == 200
    assert len(records.json()["expenses"]) == 1

    updated = client.put("/api/v1/users/me", headers=auth, json={
        "name": user["name"], "income": 500000
    })
    assert updated.status_code == 200, updated.text

    new_dashboard = client.get(
        "/api/v1/dashboard", params={"month": current}, headers=auth
    )
    assert new_dashboard.status_code == 200
    assert new_dashboard.json()["income"] == 500000

    toggle = client.put("/api/v1/users/me/monthly-email", headers=auth, json={
        "monthly_reports_enabled": True
    })
    assert toggle.status_code == 200, toggle.text
    assert toggle.json()["monthly_reports_enabled"] is True

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        amount_type = conn.execute(
            "SELECT pg_typeof(amount)::text FROM expenses LIMIT 1"
        ).fetchone()[0]
        assert amount_type == "numeric"
        version = conn.execute(
            "SELECT MAX(version) FROM migrations"
        ).fetchone()[0]
        assert version == 8


def test_postgres_constraints_and_user_isolation(safe_postgres_test_database):
    client = safe_postgres_test_database
    auth, user = register_and_sign_in(client)

    duplicate = client.post("/api/v1/users", json=user)
    assert duplicate.status_code == 400, duplicate.text

    foreign = database.create_connection()
    try:
        with pytest.raises(psycopg.errors.ForeignKeyViolation):
            foreign.execute("""
                INSERT INTO expenses(
                    user_id, amount, category, description, date
                ) VALUES (?, ?, ?, ?, ?)
            """, (999999, 42.50, "Food", "Invalid owner", "2026-01-01"))
    finally:
        foreign.rollback()
        foreign.close()

    unauthorized = client.get("/api/v1/budgets")
    assert unauthorized.status_code in (401, 403)

    budget = client.post("/api/v1/budgets", headers=auth, json={
        "category": "Food", "amount": 100000
    })
    assert budget.status_code == 200
    removed = client.delete(
        "/api/v1/budgets/" + str(budget.json()["id"]), headers=auth
    )
    assert removed.status_code == 200, removed.text


def test_data_import_preserves_records_and_blocks_second_run(
    safe_postgres_test_database, tmp_path, monkeypatch
):
    import app.migrations.manager as manager

    path = str(tmp_path / "original_budgetwise.db")
    pg_url = os.environ["DATABASE_URL"]

    # Build a real v8 SQLite source with a separate connection.
    monkeypatch.delenv("DATABASE_URL")
    monkeypatch.setattr(database, "DATABASE_NAME", path)
    monkeypatch.setattr(manager, "DATABASE_NAME", path)
    manager.run_migrations()

    old_id = database.create_user(
        "historical", 360000, hash_password("password123"),
        "historical@example.com"
    )
    old_expense_id = database.add_expense(
        old_id, 15000.75, "Transport", "Bus fare", "2026-09-05"
    )
    old_budget_id = database.add_budget(
        old_id, "Transport", 50000
    )
    old_goal_id = database.create_goal(
        old_id, "Emergency fund", 1000000, 20000, "2027-06-01"
    )
    assert Path(path).is_file()

    monkeypatch.setenv("DATABASE_URL", pg_url)
    preview = migrate_sqlite_to_postgres(path, dry_run=True)
    assert preview["counts"]["users"] == 1
    assert preview["counts"]["expenses"] == 1
    assert preview["counts"]["budgets"] == 1
    assert preview["counts"]["goals"] == 1
    assert preview["counts"]["monthly_income"] == 1

    migrated = migrate_sqlite_to_postgres(path, dry_run=False)
    assert migrated["dry_run"] is False

    with psycopg.connect(pg_url) as conn:
        assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
        assert conn.execute(
            "SELECT COUNT(*) FROM expenses WHERE id = %s AND user_id = %s",
            (old_expense_id, old_id)
        ).fetchone()[0] == 1
        assert conn.execute(
            "SELECT COUNT(*) FROM budgets WHERE id = %s",
            (old_budget_id,)
        ).fetchone()[0] == 1
        assert conn.execute(
            "SELECT COUNT(*) FROM goals WHERE id = %s",
            (old_goal_id,)
        ).fetchone()[0] == 1
        assert conn.execute(
            "SELECT amount FROM monthly_income WHERE user_id = %s",
            (old_id,)
        ).fetchone()[0] == 360000
        sequence_next = conn.execute("""
            SELECT last_value FROM users_id_seq
        """).fetchone()[0]
        assert sequence_next >= old_id

    with pytest.raises(RuntimeError, match="not empty"):
        migrate_sqlite_to_postgres(path, dry_run=False)
