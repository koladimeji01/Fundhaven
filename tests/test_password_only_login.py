"""Password-only sign-in regression tests.

These use the real hashing/JWT logic, mock database lookups, and never send emails.
No running database, Brevo account or network connection is required.
"""
import os

os.environ.setdefault("ENVIRONMENT", "testing")

import pytest
from fastapi.testclient import TestClient

from api import app
from app import auth as password_auth
from app.api import auth as auth_api


@pytest.fixture
def user(monkeypatch):
    registered_user = (
        42,
        "budgetwise_test",
        300000.00,
        password_auth.hash_password("CorrectPassword123!"),
        "budgetwise_test@example.com",
    )

    monkeypatch.setattr(
        auth_api.database,
        "get_user_by_email",
        lambda email: registered_user
        if email == registered_user[4] else None,
    )
    monkeypatch.setattr(
        auth_api.database,
        "get_user_by_name",
        lambda name: registered_user
        if name == registered_user[1] else None,
    )
    # No email delivery is required for sign-in.
    monkeypatch.delenv("BREVO_API_KEY", raising=False)
    monkeypatch.delenv("BREVO_SENDER_EMAIL", raising=False)
    return registered_user


def test_correct_email_password_issues_jwt_without_brevo(user):
    response = TestClient(app).post(
        "/api/v1/login",
        json={"email": user[4], "password": "CorrectPassword123!"},
    )

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["token_type"] == "bearer"
    assert isinstance(result["access_token"], str)
    assert result.get("verification_required") is None
    assert result.get("challenge_id") is None
    assert password_auth.decode_access_token(result["access_token"])["user_id"] == 42


def test_correct_username_password_still_works(user):
    response = TestClient(app).post(
        "/api/v1/login",
        json={"name": user[1], "password": "CorrectPassword123!"},
    )
    assert response.status_code == 200, response.text
    assert password_auth.decode_access_token(
        response.json()["access_token"]
    )["user_id"] == user[0]


@pytest.mark.parametrize(
    "credentials",
    [
        {"email": "budgetwise_test@example.com", "password": "WrongPassword123!"},
        {"email": "unknown@example.com", "password": "CorrectPassword123!"},
        {"name": "unknown_user", "password": "CorrectPassword123!"},
    ],
)
def test_invalid_credentials_never_receive_jwt(user, credentials):
    response = TestClient(app).post("/api/v1/login", json=credentials)
    assert response.status_code == 401
    assert "access_token" not in response.json()


def test_missing_password_or_account_identifier_rejected(user):
    client = TestClient(app)
    assert client.post(
        "/api/v1/login", json={"email": user[4]}
    ).status_code == 422
    assert client.post(
        "/api/v1/login", json={"password": "CorrectPassword123!"}
    ).status_code == 422


def test_removed_email_verification_endpoints_are_not_available(user):
    client = TestClient(app)
    assert client.post("/api/v1/login/verify", json={}).status_code == 404
    assert client.post("/api/v1/login/resend", json={}).status_code == 404
