"""Prevent accidental new leaks and sensitive-response caching regressions."""
import pytest
from fastapi.testclient import TestClient
from api import app
from scripts.check_repository_hygiene import classify_path


@pytest.mark.parametrize("filename", [
    "budgetwise.db", "budgetwise_backup_before_monthly.db",
    "data.sqlite3", "venv/bin/python", ".venv/Scripts/python.exe",
    "frontend/node_modules/library/index.js", ".env", ".env.production",
    "config/.env.test", "frontend/dist/js/runtime-config.js",
    "deploy/private.key", "test.pem", "credentials.json", "id_ed25519",
    "budgetwise.db-wal",
])
def test_private_paths_cannot_be_tracked(filename):
    assert classify_path(filename) is not None


@pytest.mark.parametrize("filename", [
    "README.md", "api.py", "tests/test_api.py", ".env.example",
    "frontend/assets/fundhaven-logo.svg", "frontend/js/runtime-config.js",
    "frontend/vercel.json", "docs/SECURITY_REMEDIATION.md",
])
def test_source_files_are_allowed(filename):
    assert classify_path(filename) is None


@pytest.mark.parametrize("path,expected_code", [
    ("/api/v1/", 200),
    ("/api/v1/users/me", 403),
    ("/api/v1/expenses", 403),
])
def test_financial_responses_cannot_be_cached(path, expected_code):
    with TestClient(app) as client:
        response = client.get(path)
    assert response.status_code in (expected_code, 401)
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"


def test_liveness_still_available_without_sensitive_data_headers():
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}
