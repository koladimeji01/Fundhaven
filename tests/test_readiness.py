"""Read-only readiness tests never contact production Supabase."""
import os
os.environ.setdefault("ENVIRONMENT", "testing")
from fastapi.testclient import TestClient
import api

class Connection:
    def __init__(self):
        self.closed = False
    def execute(self, query):
        assert query == "SELECT 1"
        return self
    def fetchone(self):
        return (1,)
    def close(self):
        self.closed = True

def test_ready_requires_real_database_query(monkeypatch):
    db = Connection()
    monkeypatch.setattr(api.database, "create_connection", lambda: db)
    response = TestClient(api.app).get("/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
    assert response.headers["cache-control"] == "no-store"
    assert db.closed

def test_database_failure_returns_503_without_leaking_secrets(monkeypatch):
    def fail():
        raise ConnectionError("DATABASE_PASSWORD_PRIVATE")
    monkeypatch.setattr(api.database, "create_connection", fail)
    response = TestClient(api.app).get("/ready")
    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}
    assert response.headers["cache-control"] == "no-store"
    assert "DATABASE_PASSWORD_PRIVATE" not in response.text

def test_health_liveness_is_separate_from_database(monkeypatch):
    def fail():
        raise ConnectionError("Unavailable")
    monkeypatch.setattr(api.database, "create_connection", fail)
    response = TestClient(api.app).get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
