"""Unit tests for the read-only runtime role checker and scoped SQL plan."""
from pathlib import Path
from unittest.mock import patch

from scripts import inspect_backend_db_role as checker


class FakeConnection:
    def __init__(self, row):
        self.row = row
        self.closed = False
    def execute(self, statement):
        assert "SELECT current_user" in statement
        return self
    def fetchone(self):
        return self.row
    def close(self):
        self.closed = True


def test_preflight_rejects_non_privileged_backend(monkeypatch):
    monkeypatch.setattr(checker, "using_postgres", lambda: True)
    con = FakeConnection(("app_user", "app_user", False))
    monkeypatch.setattr(checker.database, "create_connection", lambda: con)
    assert checker.inspect() == 2
    assert con.closed


def test_preflight_accepts_privileged_backend(monkeypatch):
    monkeypatch.setattr(checker, "using_postgres", lambda: True)
    con = FakeConnection(("postgres", "postgres", True))
    monkeypatch.setattr(checker.database, "create_connection", lambda: con)
    assert checker.inspect() == 0
    assert con.closed


def test_preflight_rejects_non_postgres(monkeypatch):
    monkeypatch.setattr(checker, "using_postgres", lambda: False)
    assert checker.inspect() == 2


def test_security_sql_is_explicitly_scoped_and_has_no_data_deletion():
    root = Path(__file__).resolve().parent.parent
    sql = (root / "docs/sql/supabase_rls_lockdown_manual.sql").read_text()
    names = ["users","expenses","budgets","goals","monthly_income",
             "migrations","login_challenges","monthly_report_delivery"]
    for name in names:
        assert f"ALTER TABLE public.{name} ENABLE ROW LEVEL SECURITY;" in sql
        assert f"public.{name}" in sql
    assert "FROM anon, authenticated;" in sql
    assert "BEGIN;" in sql and "COMMIT;" in sql
    assert "DELETE FROM" not in sql.upper()
    assert "DROP TABLE" not in sql.upper()
    assert "DISABLE ROW LEVEL SECURITY" not in sql.upper()
