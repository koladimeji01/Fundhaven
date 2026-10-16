"""SQLite/PostgreSQL connection adapter for FundHaven.

Existing FundHaven services use sqlite3-style '?' parameters and positional
tuples. This deliberately small bridge preserves their interface while allowing
a gradual switch to psycopg 3.

For PostgreSQL, use DATABASE_URL in your private .env file. With DATABASE_URL
absent, the existing SQLite file continues to work unchanged.

The bridge converts NUMERIC results to floats ONLY for compatibility with
legacy service arithmetic. The database still stores amounts as NUMERIC(18,2).
Future financial calculations should migrate fully to Decimal.
"""
from datetime import date, datetime
from decimal import Decimal
import os
import re
import sqlite3
from threading import Lock

try:
    from psycopg_pool import ConnectionPool
except ImportError:
    ConnectionPool = None

try:
    import psycopg
except ImportError:
    psycopg = None


DB_ERRORS = (sqlite3.Error,) + ((psycopg.Error,) if psycopg else ())
INTEGRITY_ERRORS = (sqlite3.IntegrityError,) + (
    (psycopg.IntegrityError,) if psycopg else ()
)

# These four existing INSERT callers expect cursor.lastrowid (a SQLite API).
_INSERT_ID = re.compile(
    r"^\s*INSERT\s+INTO\s+(users|expenses|budgets|goals)\b",
    flags=re.IGNORECASE,
)


def get_database_url():
    url = os.getenv("DATABASE_URL", "").strip()
    if url and not url.startswith(("postgresql://", "postgres://")):
        raise ValueError(
            "DATABASE_URL must begin with postgresql:// or postgres://"
        )
    # Prevent the existing SQLite test fixtures from wiping a real
    # PostgreSQL database when a DATABASE_URL leaks into the test shell.
    if (
        url
        and os.getenv("ENVIRONMENT", "development") == "testing"
        and os.getenv("BUDGETWISE_TEST_POSTGRES") != "1"
    ):
        raise RuntimeError(
            "PostgreSQL disabled for regular tests. Remove DATABASE_URL "
            "to run SQLite tests. Only use PostgreSQL with the dedicated "
            "isolated test suite and BUDGETWISE_TEST_POSTGRES=1."
        )
    return url


def using_postgres():
    return bool(get_database_url())


def _legacy_value(value):
    if isinstance(value, Decimal):
        return float(value)
    return value


class PostgresCursor:
    """Minimal compatibility layer around a psycopg cursor."""

    def __init__(self, cursor):
        self._cursor = cursor
        self.lastrowid = None

    def execute(self, query, params=None):
        sql = query.strip()
        self.lastrowid = None

        if sql.upper() == "BEGIN IMMEDIATE":
            # SQLite's BEGIN IMMEDIATE serializes writers. In PostgreSQL
            # serialize these short OTP/report claim transactions with a
            # transaction-scoped advisory lock, automatically released
            # on commit/rollback.
            self._cursor.execute(
                "SELECT pg_advisory_xact_lock(82564201)"
            )
            return self

        sql = query.replace("?", "%s")
        needs_id = _INSERT_ID.match(sql) and not re.search(
            r"\bRETURNING\b", sql, re.IGNORECASE
        )
        if needs_id:
            sql = sql.rstrip().rstrip(";") + " RETURNING id"

        # SQLite automatically serializes Python date objects to ISO text.
        # PostgreSQL TEXT columns need the same explicit representation.
        if params is not None:
            params = tuple(
                value.isoformat()
                if isinstance(value, date) and not isinstance(value, datetime)
                else value
                for value in params
            )

        self._cursor.execute(sql, params)

        if needs_id:
            row = self._cursor.fetchone()
            self.lastrowid = int(row[0])

        return self

    def fetchone(self):
        row = self._cursor.fetchone()
        if row is None:
            return None
        return tuple(_legacy_value(value) for value in row)

    def fetchall(self):
        return [
            tuple(_legacy_value(value) for value in row)
            for row in self._cursor.fetchall()
        ]

    @property
    def rowcount(self):
        return self._cursor.rowcount

    def close(self):
        self._cursor.close()


_pool_lock = Lock()
_pools = {}


def get_postgres_pool(url):
    """Reuse remote PostgreSQL connections for synchronous FastAPI queries."""
    if ConnectionPool is None:
        raise RuntimeError("Missing PostgreSQL pool; install requirements.txt")
    with _pool_lock:
        pool = _pools.get(url)
        if pool is None or pool.closed:
            try:
                size = max(1, min(8, int(os.getenv("FUNDHAVEN_DB_POOL_SIZE", "4"))))
            except ValueError as exc:
                raise ValueError("FUNDHAVEN_DB_POOL_SIZE must be an integer") from exc
            pool = ConnectionPool(
                conninfo=url,
                min_size=0,
                max_size=size,
                max_idle=60.0,
                max_lifetime=600.0,
                timeout=10.0,
                kwargs={"connect_timeout": 10},
                open=True,
            )
            _pools[url] = pool
        return pool


class PostgresConnection:
    def __init__(self, connection, pool=None):
        self._connection = connection
        self._pool = pool
        self._returned = False

    def cursor(self):
        return PostgresCursor(self._connection.cursor())

    def execute(self, query, params=None):
        return self.cursor().execute(query, params)

    def commit(self):
        self._connection.commit()

    def rollback(self):
        self._connection.rollback()

    def close(self):
        if self._returned:
            return
        self._returned = True
        if self._pool is not None:
            self._pool.putconn(self._connection)
        else:
            self._connection.close()


def connect_database(sqlite_path):
    url = get_database_url()
    if not url:
        connection = sqlite3.connect(sqlite_path)
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    if psycopg is None:
        raise RuntimeError(
            "PostgreSQL driver missing. Run: pip install 'psycopg[binary]'"
        )

    # SSL is expected for remote managed databases. Add sslmode=require to
    # your DATABASE_URL if it is not already configured by your provider.
    pool = get_postgres_pool(url)
    connection = pool.getconn()
    return PostgresConnection(connection, pool=pool)
