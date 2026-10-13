"""Safely copy a BudgetWise SQLite v8 database to an EMPTY PostgreSQL database.

Usage (after backing up budgetwise.db and setting DATABASE_URL):
    python -m app.migrations.sqlite_to_postgres --dry-run
    python -m app.migrations.sqlite_to_postgres --yes

All records are inserted in a single transaction, with their original IDs.
Passwords remain hashed; no plaintext credentials are read or logged.
Migration runs only on explicit request, never during FastAPI startup.
"""
import argparse
from pathlib import Path
import sqlite3

from app.config import DATABASE_NAME
from app.db_backend import get_database_url
from app.migrations.postgres import run_postgres_migrations


# Fixed table and column names only. Never interpolate user-controlled names.
TABLES = (
    ("users", ("id", "name", "income", "password", "email", "monthly_reports_enabled")),
    ("expenses", ("id", "user_id", "amount", "category", "description", "date")),
    ("budgets", ("id", "user_id", "category", "amount", "created_at", "updated_at")),
    ("goals", (
        "id", "user_id", "name", "target_amount", "current_amount",
        "target_date", "created_at", "updated_at"
    )),
    ("monthly_income", ("user_id", "month", "amount")),
    ("login_challenges", (
        "id", "user_id", "code_digest", "created_at",
        "expires_at", "last_sent_at", "attempts", "resend_count",
        "consumed_at"
    )),
    ("monthly_report_delivery", (
        "user_id", "report_month", "status", "claimed_at",
        "sent_at", "provider_message_id"
    )),
)

TABLES_WITH_IDS = ("users", "expenses", "budgets", "goals")


def _read_source(sqlite_path):
    path = Path(sqlite_path).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(
            f"SQLite database not found: {path}. Do not run against an "
            "empty file. Check --sqlite and the backup first."
        )

    # Read-only, never create or alter the source SQLite database.
    source = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
    try:
        if source.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("SQLite integrity check failed; aborting")

        version_row = source.execute(
            "SELECT MAX(version) FROM migrations"
        ).fetchone()
        if not version_row or version_row[0] is None or version_row[0] < 8:
            raise RuntimeError(
                "SQLite schema must be at migration version 8. "
                "First run the original SQLite backend's migrations."
            )

        result = {}
        for table, columns in TABLES:
            present = {
                row[1] for row in source.execute(f"PRAGMA table_info({table})")
            }
            missing = set(columns) - present
            if missing:
                raise RuntimeError(
                    f"Source table {table} missing required columns: "
                    + ", ".join(sorted(missing))
                )
            result[table] = source.execute(
                f"SELECT {', '.join(columns)} FROM {table}"
            ).fetchall()
        return result
    finally:
        source.close()


def migrate_sqlite_to_postgres(
    sqlite_path=DATABASE_NAME, *, dry_run=True
):
    url = get_database_url()
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not configured. Set your PostgreSQL URL in "
            "the private .env file first."
        )

    records = _read_source(sqlite_path)
    counts = {table: len(rows) for table, rows in records.items()}

    if dry_run:
        return {"dry_run": True, "counts": counts}

    try:
        import psycopg
    except ImportError as exc:
        raise RuntimeError(
            "Install psycopg: pip install 'psycopg[binary]'"
        ) from exc

    # Creating tables is safe; importing requires an entirely empty destination.
    run_postgres_migrations()

    with psycopg.connect(url, connect_timeout=10) as destination:
        with destination.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(82564203)")

            for table, _ in TABLES:
                cursor.execute(f"SELECT EXISTS(SELECT 1 FROM {table} LIMIT 1)")
                if cursor.fetchone()[0]:
                    raise RuntimeError(
                        f"Destination table {table} is not empty. "
                        "Aborting without overwriting or appending data. "
                        "Use a fresh PostgreSQL database."
                    )

            for table, columns in TABLES:
                rows = records[table]
                if not rows:
                    continue
                placeholders = ", ".join("%s" for _ in columns)
                cursor.executemany(
                    f"INSERT INTO {table} ({', '.join(columns)}) "
                    f"VALUES ({placeholders})",
                    rows,
                )

            # Imported IDs are explicit. Advance each identity sequence
            # so the next registered user/transaction receives a new ID.
            for table in TABLES_WITH_IDS:
                cursor.execute(f"""
                    SELECT setval(
                        pg_get_serial_sequence('{table}', 'id'),
                        COALESCE(MAX(id), 1),
                        MAX(id) IS NOT NULL
                    )
                    FROM {table}
                """)

            # Verify all seven financial and security tables before COMMIT.
            for table, _ in TABLES:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                count = cursor.fetchone()[0]
                if count != counts[table]:
                    raise RuntimeError(
                        f"Row-count mismatch for {table}: "
                        f"expected {counts[table]}, got {count}"
                    )

        destination.commit()

    return {"dry_run": False, "counts": counts}


def main():
    parser = argparse.ArgumentParser(
        description="Copy BudgetWise SQLite records to empty PostgreSQL"
    )
    parser.add_argument(
        "--sqlite", default=DATABASE_NAME,
        help="Path to original SQLite .db (default: configured DATABASE_NAME)"
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true",
                      help="Inspect data without changing PostgreSQL")
    mode.add_argument("--yes", action="store_true",
                      help="Confirm one-time migration into EMPTY PostgreSQL")
    args = parser.parse_args()

    result = migrate_sqlite_to_postgres(
        args.sqlite, dry_run=not args.yes
    )
    heading = "DRY RUN ONLY" if result["dry_run"] else "DATA COPIED"
    print(heading)
    for table, count in result["counts"].items():
        print(f"  {table}: {count}")
    if result["dry_run"]:
        print("No PostgreSQL records have been changed.")


if __name__ == "__main__":
    main()
