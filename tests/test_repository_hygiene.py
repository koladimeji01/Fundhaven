"""Prevent accidental reintroduction of committed databases and secrets."""
import pytest
from scripts.check_repository_hygiene import classify_path


@pytest.mark.parametrize("path", [
    "budgetwise.db",
    "budgetwise_backup_before_monthly.db",
    "app/__pycache__/module.cpython-313.pyc",
    "venv/bin/python",
    "frontend/node_modules/a/index.js",
    ".env",
    ".env.production",
    "config/.env.test",
    "frontend/dist/js/runtime-config.js",
    "deployment/private.key",
    "credentials.json",
    "id_ed25519",
    "mydb.sqlite3",
    "budgetwise.db-wal",
])
def test_private_paths_are_blocked(path):
    assert classify_path(path) is not None


@pytest.mark.parametrize("path", [
    "README.md", "app/api/users.py", "tests/test_api.py", ".env.example",
    "frontend/assets/fundhaven-logo.svg", "frontend/js/runtime-config.js",
    "docs/SECURITY_REMEDIATION.md", "frontend/vercel.json",
])
def test_legitimate_source_paths_are_allowed(path):
    assert classify_path(path) is None


def test_financial_api_responses_cannot_be_cached():
    from fastapi.testclient import TestClient
    from api import app

    with TestClient(app) as client:
        response = client.get("/api/v1/")
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["pragma"] == "no-cache"
