"""Pooled Postgres connections must not leak open read transactions."""
from app.db_backend import PostgresConnection


class StubConnection:
    def __init__(self, fail=False):
        self.events = []
        self.fail = fail

    def rollback(self):
        self.events.append("rollback")
        if self.fail:
            raise RuntimeError("Lost connection")

    def close(self):
        self.events.append("close")


class StubPool:
    def __init__(self):
        self.events = []

    def putconn(self, connection):
        self.events.append(("putconn", connection))


def test_closes_transaction_before_returning_pooled_connection():
    raw = StubConnection()
    pool = StubPool()
    proxy = PostgresConnection(raw, pool)
    proxy.close()
    proxy.close()
    assert raw.events == ["rollback"]
    assert pool.events == [("putconn", raw)]


def test_standalone_connection_rolls_back_and_closes():
    raw = StubConnection()
    proxy = PostgresConnection(raw)
    proxy.close()
    assert raw.events == ["rollback", "close"]


def test_failed_rollback_still_returns_connection_to_pool():
    raw = StubConnection(fail=True)
    pool = StubPool()
    proxy = PostgresConnection(raw, pool)
    try:
        proxy.close()
    except RuntimeError:
        pass
    assert pool.events == [("putconn", raw)]
