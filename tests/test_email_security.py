"""Brevo OTP + monthly report integration tests (all provider calls mocked)."""
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
    name = "otp_" + uuid4().hex[:10]
    email = name + "@example.com"

    monkeypatch.setenv("ENVIRONMENT", "testing")
    monkeypatch.setenv("BUDGETWISE_TEST_OTP", "1")
    monkeypatch.setenv("BREVO_API_KEY", "test-key-no-network")
    monkeypatch.setenv("BREVO_SENDER_EMAIL", "test-sender@example.com")

    db_path = str(tmp_path / "brevo_test.db")
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


def start_login(client, user, mocked_email):
    result = client.post("/api/v1/login", json={
        "email": user["email"],
        "password": user["password"]
    })
    assert result.status_code == 200, result.text
    data = result.json()
    assert "access_token" not in data
    assert data["verification_required"] is True
    assert len(data["challenge_id"]) > 24
    assert mocked_email.call_count == 1
    code = mocked_email.call_args.args[2]
    assert len(code) == 6 and code.isdigit()
    return data["challenge_id"], code


def test_otp_is_required_single_use_and_invalid_code_fails(session):
    client, user = session
    with patch("app.api.auth.send_login_code_email") as mail:
        challenge_id, code = start_login(client, user, mail)

    wrong = "000000" if code != "000000" else "111111"
    bad = client.post("/api/v1/login/verify", json={
        "challenge_id": challenge_id, "code": wrong
    })
    assert bad.status_code == 401

    valid = client.post("/api/v1/login/verify", json={
        "challenge_id": challenge_id, "code": code
    })
    assert valid.status_code == 200
    token = valid.json()["access_token"]
    assert isinstance(token, str) and len(token) > 20
    protected = client.get(
        "/api/v1/users/me",
        headers={"Authorization": "Bearer " + token}
    )
    assert protected.status_code == 200

    replay = client.post("/api/v1/login/verify", json={
        "challenge_id": challenge_id, "code": code
    })
    assert replay.status_code == 401


def test_otp_expiry_and_resend_cooldown(session):
    client, user = session
    with patch("app.api.auth.send_login_code_email") as mail:
        challenge_id, code = start_login(client, user, mail)

        immediate = client.post("/api/v1/login/resend", json={
            "challenge_id": challenge_id
        })
        assert immediate.status_code == 429

        conn = database.create_connection()
        try:
            conn.execute(
                "UPDATE login_challenges SET last_sent_at = last_sent_at - 61 WHERE id = ?",
                (challenge_id,)
            )
            conn.commit()
        finally:
            conn.close()

        resent = client.post("/api/v1/login/resend", json={
            "challenge_id": challenge_id
        })
        assert resent.status_code == 200, resent.text
        assert mail.call_count == 2
        new_code = mail.call_args.args[2]
        assert len(new_code) == 6

        conn = database.create_connection()
        try:
            conn.execute(
                "UPDATE login_challenges SET expires_at = 0 WHERE id = ?",
                (challenge_id,)
            )
            conn.commit()
        finally:
            conn.close()

        expired = client.post("/api/v1/login/verify", json={
            "challenge_id": challenge_id, "code": new_code
        })
        assert expired.status_code == 401


def test_otp_failed_attempt_limit(session):
    client, user = session
    with patch("app.api.auth.send_login_code_email") as mail:
        challenge_id, code = start_login(client, user, mail)

    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        r = client.post("/api/v1/login/verify", json={
            "challenge_id": challenge_id, "code": wrong
        })
        assert r.status_code == 401

    result = client.post("/api/v1/login/verify", json={
        "challenge_id": challenge_id, "code": code
    })
    assert result.status_code == 401


def test_otp_fails_closed_without_brevo(session, monkeypatch):
    client, user = session
    monkeypatch.delenv("BREVO_API_KEY")
    response = client.post("/api/v1/login", json={
        "email": user["email"], "password": user["password"]
    })
    assert response.status_code == 503
    assert "access_token" not in response.json()


def test_monthly_email_preference_and_no_duplicate_delivery(session, monkeypatch):
    client, user = session

    # Existing automated tests can still use direct-JWT login;
    # this testing-only bypass never exists in normal runtime.
    monkeypatch.setenv("BUDGETWISE_TEST_OTP", "0")
    signed_in = client.post("/api/v1/login", json={
        "email": user["email"], "password": user["password"]
    })
    assert signed_in.status_code == 200
    auth = {"Authorization": "Bearer " + signed_in.json()["access_token"]}
    monkeypatch.setenv("BUDGETWISE_TEST_OTP", "1")

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
