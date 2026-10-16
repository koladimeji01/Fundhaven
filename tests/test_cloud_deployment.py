"""Cloud deployment safety checks without using any paid hosting services."""
import asyncio
import os

os.environ["ENVIRONMENT"] = "testing"

import pytest

from api import app, configured_cors_origins, lifespan
from app.db_backend import using_postgres


def test_default_cors_is_local_only(monkeypatch):
    monkeypatch.delenv("BUDGETWISE_ALLOWED_ORIGINS", raising=False)
    monkeypatch.delenv("FUNDHAVEN_ALLOWED_ORIGINS", raising=False)
    allowed = configured_cors_origins()
    assert allowed == ["http://127.0.0.1:5500", "http://localhost:5500"]
    assert "*" not in allowed


def test_current_and_legacy_origin_variables_are_supported(monkeypatch):
    monkeypatch.setenv(
        "BUDGETWISE_ALLOWED_ORIGINS",
        "https://old-site.vercel.app, https://shared.example.org/"
    )
    monkeypatch.setenv(
        "FUNDHAVEN_ALLOWED_ORIGINS",
        "https://fundhaven-example.netlify.app, https://shared.example.org/"
    )
    allowed = configured_cors_origins()
    assert "https://old-site.vercel.app" in allowed
    assert "https://fundhaven-example.netlify.app" in allowed
    assert allowed.count("https://shared.example.org") == 1


@pytest.mark.parametrize("invalid", [
    "*",
    "https://*.vercel.app",
    "http://not-secure.vercel.app",
    "https://site.vercel.app/something",
    "https://user:secret@site.vercel.app",
    "https://site.vercel.app/?private=1",
])
@pytest.mark.parametrize("key", [
    "BUDGETWISE_ALLOWED_ORIGINS",
    "FUNDHAVEN_ALLOWED_ORIGINS",
])
def test_reject_unsafe_cors_origins(monkeypatch, invalid, key):
    monkeypatch.delenv("BUDGETWISE_ALLOWED_ORIGINS", raising=False)
    monkeypatch.delenv("FUNDHAVEN_ALLOWED_ORIGINS", raising=False)
    monkeypatch.setenv(key, invalid)
    with pytest.raises(ValueError, match="HTTPS origins"):
        configured_cors_origins()


def test_prod_requires_persistent_postgresql(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert using_postgres() is False

    async def start():
        async with lifespan(app):
            pass

    with pytest.raises(RuntimeError, match="requires DATABASE_URL"):
        asyncio.run(start())


def test_production_cors_uses_only_explicit_https_origin(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("BUDGETWISE_ALLOWED_ORIGINS", raising=False)
    monkeypatch.setenv(
        "FUNDHAVEN_ALLOWED_ORIGINS", "https://fundhaven-demo.netlify.app"
    )
    allowed = configured_cors_origins()
    assert allowed == [
        "https://fundhaven.vercel.app",
        "https://budgetwise-frontend-tan.vercel.app",
        "https://budgetwise-frontend-kehindeoladimeji455-2157s-projects.vercel.app",
        "https://budgetwise-frontend-c5ajigvrg.vercel.app",
        "https://fundhaven-demo.netlify.app",
    ]
    assert "http://localhost:5500" not in allowed


def test_current_vercel_login_preflight_is_accepted(monkeypatch):
    """A Vercel-to-Render login OPTIONS request must not fail CORS."""
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.testclient import TestClient

    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("BUDGETWISE_ALLOWED_ORIGINS", raising=False)
    monkeypatch.delenv("FUNDHAVEN_ALLOWED_ORIGINS", raising=False)
    frontend_origin = "https://budgetwise-frontend-c5ajigvrg.vercel.app"
    assert frontend_origin in configured_cors_origins()

    protected = CORSMiddleware(
        FastAPI(),
        allow_origins=configured_cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    response = TestClient(protected).options(
        "/api/v1/login",
        headers={
            "Origin": frontend_origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == frontend_origin
    assert response.headers["access-control-allow-credentials"] == "true"



def test_health_endpoint_supports_get_and_head_for_free_uptime_monitors():
    """UptimeRobot uses HEAD by default: 405 must not mean downtime."""
    from fastapi.testclient import TestClient

    client = TestClient(app)
    regular = client.get("/health")
    assert regular.status_code == 200
    assert regular.json() == {"status": "healthy"}

    monitor = client.head("/health")
    assert monitor.status_code == 200
    assert monitor.content == b""
