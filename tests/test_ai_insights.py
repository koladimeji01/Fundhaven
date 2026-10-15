"""AI insights tests: monthly accuracy, user isolation, and explicit consent.

No test makes real OpenAI requests or sends private data outside the process.
"""
from datetime import date
import json
import os
from unittest.mock import patch
from uuid import uuid4

os.environ["ENVIRONMENT"] = "testing"

import pytest
from fastapi.testclient import TestClient

from api import app
from app import database
from app import ai_insights
from app.auth import create_access_token
from app.migrations.manager import run_migrations
import app.migrations.manager as migrations_module


@pytest.fixture
def setup(tmp_path, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(database, "DATABASE_NAME", str(tmp_path / "insights.db"))
    monkeypatch.setattr(
        migrations_module, "DATABASE_NAME", str(tmp_path / "insights.db")
    )
    ai_insights._recent_ai_requests.clear()
    run_migrations()

    with TestClient(app) as client:
        first = {
            "name": "ai_" + uuid4().hex[:10],
            "email": "ai_" + uuid4().hex[:10] + "@example.com",
            "income": 200000,
            "password": "password123",
        }
        with patch("app.api.auth.send_welcome_email"):
            registration = client.post("/api/v1/users", json=first)
        assert registration.status_code == 200, registration.text
        user_id = registration.json()["id"]
        auth = {
            "Authorization": "Bearer " + create_access_token(user_id)
        }
        yield client, auth, user_id


def _expense(client, auth, amount, category="Food", when=None, description="Sample"):
    return client.post("/api/v1/expenses", headers=auth, json={
        "amount": amount,
        "category": category,
        "description": description,
        "date": when or date.today().isoformat(),
    })


def test_insights_require_login(setup):
    client, auth, user_id = setup
    assert client.get("/api/v1/ai/insights").status_code in (401, 403)
    assert client.post("/api/v1/ai/insights", json={
        "share_aggregates_with_ai": True
    }).status_code in (401, 403)


def test_monthly_local_insights_and_budget_warning(setup):
    client, auth, user_id = setup
    current = date.today().strftime("%Y-%m")
    previous = "2026-02" if current != "2026-02" else "2026-01"

    assert _expense(client, auth, 1200.50, "Food",
                    current + "-03").status_code == 200
    assert _expense(client, auth, 800.00, "Food",
                    current + "-05").status_code == 200
    assert _expense(client, auth, 90000.00, "Rent",
                    previous + "-04").status_code == 200

    budget = client.post("/api/v1/budgets", headers=auth, json={
        "category": "Food", "amount": 2100
    })
    assert budget.status_code == 200

    response = client.get(
        "/api/v1/ai/insights", headers=auth, params={"month": current}
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["source"] == "local_rules"
    assert data["summary"]["income"] == 200000
    assert data["summary"]["income_recorded"] is True
    assert data["summary"]["expense_count"] == 2
    assert data["summary"]["expenses_total"] == pytest.approx(2000.50)
    assert data["summary"]["categories"][0]["category"] == "Food"
    assert data["summary"]["budgets"][0]["usage_percentage"] >= 90
    assert any("budget" in tip.lower() for tip in data["insights"])
    assert not any("90000" in tip for tip in data["insights"])


def test_missing_historical_income_is_not_invented(setup):
    client, auth, user_id = setup
    old_month = "2024-07"
    assert _expense(
        client, auth, 3500.00, "Transport", old_month + "-11"
    ).status_code == 200

    response = client.get(
        "/api/v1/ai/insights", headers=auth,
        params={"month": old_month},
    )
    assert response.status_code == 200
    summary = response.json()["summary"]
    assert summary["income_recorded"] is False
    assert summary["income"] is None
    assert summary["balance"] is None
    assert summary["income_spent_percentage"] is None
    assert any("not been recorded" in tip for tip in response.json()["insights"])


def test_month_validation_on_both_routes(setup):
    client, auth, user_id = setup
    assert client.get(
        "/api/v1/ai/insights?month=2026-99", headers=auth
    ).status_code == 422
    assert client.post("/api/v1/ai/insights", headers=auth, json={
        "month": "wrong", "share_aggregates_with_ai": True
    }).status_code == 422


def test_external_ai_requires_consent_and_configuration(setup, monkeypatch):
    client, auth, user_id = setup
    with patch("app.ai_insights.urlopen") as mocked:
        denied = client.post("/api/v1/ai/insights", headers=auth, json={
            "share_aggregates_with_ai": False
        })
        assert denied.status_code == 422
        assert mocked.call_count == 0

        no_key = client.post("/api/v1/ai/insights", headers=auth, json={
            "share_aggregates_with_ai": True
        })
        assert no_key.status_code == 503
        assert "API_KEY" in no_key.json()["detail"]
        assert mocked.call_count == 0


def test_model_sees_only_aggregate_amounts_not_private_details(setup, monkeypatch):
    client, auth, user_id = setup
    month = date.today().strftime("%Y-%m")
    hidden_description = "SECRET_PRIVATE_TRANSACTION_ABC123"
    assert _expense(
        client, auth, 7200, "Food", month + "-09", hidden_description
    ).status_code == 200

    monkeypatch.setenv("OPENAI_API_KEY", "fake-unit-test-key")

    response_data = {
        "status": "completed",
        "output": [{
            "type": "message",
            "content": [{
                "type": "output_text",
                "text": "- Review food expenses.\n- Set a monthly limit.\n- Recheck your totals."
            }]
        }],
    }

    class FakeHTTPResponse:
        def __enter__(self):
            return self
        def __exit__(self, *_args):
            return False
        def read(self):
            return json.dumps(response_data).encode("utf-8")

    with patch("app.ai_insights.urlopen", return_value=FakeHTTPResponse()) as mocked:
        result = client.post("/api/v1/ai/insights", headers=auth, json={
            "month": month,
            "share_aggregates_with_ai": True
        })

    assert result.status_code == 200, result.text
    assert result.json()["source"] == "ai_model"
    assert "Review food expenses" in result.json()["advice"]
    request = mocked.call_args.args[0]
    sent = json.loads(request.data.decode("utf-8"))
    assert sent["store"] is False
    assert sent["model"]
    assert sent["max_output_tokens"] <= 500
    summary = json.loads(sent["input"])
    assert summary["total_expenses"] == 7200
    assert summary["categories"][0]["category"] == "Food"
    assert "name" not in summary
    assert "email" not in summary
    assert "user_id" not in summary
    assert "password" not in summary
    assert hidden_description not in json.dumps(summary)
    assert request.get_header("Authorization") == "Bearer fake-unit-test-key"


def test_external_ai_rate_limit(setup, monkeypatch):
    client, auth, user_id = setup
    monkeypatch.setenv("OPENAI_API_KEY", "fake-unit-test-key")
    with patch("app.ai_insights.urlopen") as mocked:
        mocked.return_value.__enter__.return_value.read.return_value = json.dumps({
            "status": "completed",
            "output": [{"type":"message","content":[{"type":"output_text","text":"Test guidance"}]}],
        }).encode("utf-8")
        for _ in range(ai_insights.HOURLY_AI_LIMIT):
            result = client.post("/api/v1/ai/insights", headers=auth, json={
                "share_aggregates_with_ai": True
            })
            assert result.status_code == 200, result.text

        blocked = client.post("/api/v1/ai/insights", headers=auth, json={
            "share_aggregates_with_ai": True
        })
        assert blocked.status_code == 429
        assert mocked.call_count == ai_insights.HOURLY_AI_LIMIT


def test_user_cannot_read_another_users_monthly_insights(setup):
    client, auth, user_id = setup
    month = date.today().strftime("%Y-%m")
    _expense(client, auth, 5555, "Food", month + "-07")
    second_id = database.create_user(
        "second_" + uuid4().hex[:8],
        100000,
        "irrelevant-hash",
        "second_" + uuid4().hex[:8] + "@example.com"
    )
    second_auth = {
        "Authorization": "Bearer " + create_access_token(second_id)
    }
    _expense(client, second_auth, 6789, "Travel", month + "-07")

    first = client.get(
        "/api/v1/ai/insights", headers=auth,
        params={"month": month}
    ).json()["summary"]
    second = client.get(
        "/api/v1/ai/insights", headers=second_auth,
        params={"month": month}
    ).json()["summary"]
    assert first["expenses_total"] == 5555
    assert second["expenses_total"] == 6789
    assert first["categories"][0]["category"] == "Food"
    assert second["categories"][0]["category"] == "Travel"


# ============================================================
# FINOVA — GENERATIVE AI READINESS & FAILURE HANDLING
# ============================================================

def test_finova_configuration_status_requires_login(setup, monkeypatch):
    client, auth, _ = setup

    anonymous = client.get("/api/v1/ai/status")
    assert anonymous.status_code in (401, 403)

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    not_ready = client.get("/api/v1/ai/status", headers=auth)
    assert not_ready.status_code == 200
    assert not_ready.json()["assistant"] == "Finova"
    assert not_ready.json()["generative_configured"] is False

    private_key = "server-secret-NEVER-PUBLISH"
    monkeypatch.setenv("OPENAI_API_KEY", private_key)
    configured = client.get("/api/v1/ai/status", headers=auth)
    assert configured.status_code == 200
    assert configured.json()["generative_configured"] is True
    assert private_key not in configured.text
    assert "API credits" in configured.json()["message"]


def test_finova_branding_is_consistent_without_changing_local_source(setup):
    client, auth, _ = setup
    response = client.get("/api/v1/ai/insights", headers=auth)
    assert response.status_code == 200
    assert response.json()["assistant"] == "Finova"
    assert response.json()["source"] == "local_rules"


@pytest.mark.parametrize("provider_code, expected_phrase", [
    (400, "OPENAI_MODEL"),
    (401, "OPENAI_API_KEY"),
    (403, "OPENAI_API_KEY"),
    (404, "OPENAI_MODEL"),
    (429, "billing"),
    (503, "temporarily"),
])
def test_finova_explains_openai_provider_failures_safely(
    setup, monkeypatch, provider_code, expected_phrase
):
    from urllib.error import HTTPError

    client, auth, _ = setup
    key = "private-test-key-not-for-clients"
    monkeypatch.setenv("OPENAI_API_KEY", key)
    monkeypatch.setenv("OPENAI_MODEL", "gpt-4.1-mini")

    # No real network call; provider error body is not disclosed.
    with patch("app.ai_insights.urlopen", side_effect=HTTPError(
        "https://api.openai.com/v1/responses",
        provider_code,
        "simulated provider diagnostic",
        {},
        None,
    )):
        response = client.post("/api/v1/ai/insights", headers=auth, json={
            "share_aggregates_with_ai": True
        })

    assert response.status_code == 503
    assert expected_phrase.lower() in response.json()["detail"].lower()
    assert key not in response.text
    assert "simulated provider diagnostic" not in response.text


@pytest.mark.parametrize("provider_result, expected_phrase", [
    ({"status": "incomplete", "output": []}, "incomplete"),
    ({"status": "completed", "output": []}, "empty"),
    ({"status": "completed", "output": None}, "empty"),
    ({"status": "completed", "output": [
        {"type": "message", "content": [{"type": "output_text", "text": ""}]}
    ]}, "empty"),
    (["not a valid response"], "unexpected"),
])
def test_finova_handles_empty_incomplete_or_invalid_ai_responses(
    setup, monkeypatch, provider_result, expected_phrase
):
    client, auth, _ = setup
    monkeypatch.setenv("OPENAI_API_KEY", "fake-unit-test-key")

    class FakeResponse:
        def __enter__(self):
            return self
        def __exit__(self, *_args):
            return False
        def read(self):
            return json.dumps(provider_result).encode("utf-8")

    with patch("app.ai_insights.urlopen", return_value=FakeResponse()):
        response = client.post("/api/v1/ai/insights", headers=auth, json={
            "share_aggregates_with_ai": True
        })

    assert response.status_code == 503
    assert expected_phrase in response.json()["detail"].lower()


def test_finova_can_parse_a_completed_text_response_and_handles_reasoning_items(
    setup, monkeypatch
):
    client, auth, _ = setup
    monkeypatch.setenv("OPENAI_API_KEY", "fake-unit-test-key")
    data = {
        "status": "completed",
        "output": [
            {"type": "reasoning", "content": []},
            {"type": "message", "content": [
                {"type": "output_text", "text": "- Review food costs."},
                {"type": "output_text", "text": "- Set a monthly limit."},
            ]},
        ],
    }

    class FakeResponse:
        def __enter__(self):
            return self
        def __exit__(self, *_args):
            return False
        def read(self):
            return json.dumps(data).encode("utf-8")

    with patch("app.ai_insights.urlopen", return_value=FakeResponse()) as mock:
        response = client.post("/api/v1/ai/insights", headers=auth, json={
            "share_aggregates_with_ai": True
        })

    assert response.status_code == 200, response.text
    assert response.json()["assistant"] == "Finova"
    assert response.json()["source"] == "ai_model"
    assert response.json()["advice"] == "- Review food costs.\n- Set a monthly limit."
    request_data = json.loads(mock.call_args.args[0].data.decode("utf-8"))
    assert "Finova" in request_data["instructions"]
    assert request_data["store"] is False
    assert request_data["model"] == "gpt-4.1-mini"
