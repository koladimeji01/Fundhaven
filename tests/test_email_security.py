"""Password-only login + opt-in monthly report tests (email delivery mocked).

Email is still an account identifier and optional reporting channel.
It is NOT a required second-factor for signing in.
"""
import os
from datetime import date
from unittest.mock import patch
from uuid import uuid4

os.environ["ENVIRONMENT"] = "testing"

import pytest
from fastapi.testclient import TestClient
from api import app
from app import database
from app.migrations import manager
from app.monthly_reports import send_monthly_reports


@pytest.fixture
def session(tmp_path, monkeypatch):
    name = "login_" + uuid4().hex[:10]
    email = name + "@example.com"

    monkeypatch.setenv("ENVIRONMENT", "testing")
    # Only optional monthly report tests use this mocked email provider.
    monkeypatch.setenv("BREVO_API_KEY", "test-key-no-network")
    monkeypatch.setenv("BREVO_SENDER_EMAIL", "test-sender@example.com")

    db_path = str(tmp_path / "budgetwise_auth_email_test.db")
    monkeypatch.setattr(database, "DATABASE_NAME", db_path)
    monkeypatch.setattr(manager, "DATABASE_NAME", db_path)

    with TestClient(app) as client:
        with patch("app.api.auth.send_welcome_email"):
            registration = client.post("/api/v1/users", json={
                "name": name,
                "email": email,
                "income": 300000,
                "password": "password123"
            })
        assert registration.status_code in (200, 201), registration.text
        yield client, {"email": email, "name": name, "password": "password123"}


def test_sign_in_does_not_require_brevo(session, monkeypatch):
    client, user = session
    monkeypatch.delenv("BREVO_API_KEY", raising=False)
    monkeypatch.delenv("BREVO_SENDER_EMAIL", raising=False)

    response = client.post("/api/v1/login", json={
        "email": user["email"], "password": user["password"]
    })

    assert response.status_code == 200, response.text
    assert response.json()["token_type"] == "bearer"
    assert isinstance(response.json()["access_token"], str)
    assert "verification_required" not in response.json()
    assert "challenge_id" not in response.json()

    protected = client.get("/api/v1/users/me", headers={
        "Authorization": "Bearer " + response.json()["access_token"]
    })
    assert protected.status_code == 200, protected.text


def test_invalid_password_and_otp_endpoints_are_rejected(session):
    client, user = session

    wrong_password = client.post("/api/v1/login", json={
        "email": user["email"], "password": "wrong-password!"
    })
    assert wrong_password.status_code == 401
    assert "access_token" not in wrong_password.json()

    assert client.post("/api/v1/login/verify", json={}).status_code == 404
    assert client.post("/api/v1/login/resend", json={}).status_code == 404

    unauthenticated = client.get("/api/v1/users/me")
    assert unauthenticated.status_code in (401, 403)


def test_monthly_email_preference_and_no_duplicate_delivery(session, monkeypatch):
    client, user = session

    signed_in = client.post("/api/v1/login", json={
        "email": user["email"], "password": user["password"]
    })
    assert signed_in.status_code == 200
    auth = {"Authorization": "Bearer " + signed_in.json()["access_token"]}

    preference = client.get("/api/v1/users/me/monthly-email", headers=auth)
    assert preference.status_code == 200
    assert preference.json()["monthly_reports_enabled"] is False

    opted_in = client.put("/api/v1/users/me/monthly-email", headers=auth, json={
        "monthly_reports_enabled": True
    })
    assert opted_in.status_code == 200

    expense = client.post("/api/v1/expenses", headers=auth, json={
        "amount": 25000,
        "category": "Food",
        "description": "October expenses",
        "date": "2026-10-12"
    })
    assert expense.status_code in (200, 201)

    with patch("app.monthly_reports.send_email", return_value="brevo-test-message") as mocked:
        first = send_monthly_reports(today=date(2026, 11, 2))
        second = send_monthly_reports(today=date(2026, 11, 3))

    assert first["sent"] == 1
    assert second["sent"] == 0
    assert second["skipped"] == 1
    assert mocked.call_count == 1
    args = mocked.call_args.args
    assert args[0] == user["email"]
    assert "October 2026" in args[1]
    assert "25,000" in args[2]

    disabled = client.put("/api/v1/users/me/monthly-email", headers=auth, json={
        "monthly_reports_enabled": False
    })
    assert disabled.status_code == 200
    assert disabled.json()["monthly_reports_enabled"] is False


def test_scheduler_does_not_send_after_first_week(session):
    result = send_monthly_reports(today=date(2026, 11, 12), dry_run=True)
    assert result["period"] is None
    assert result["sent"] == 0
