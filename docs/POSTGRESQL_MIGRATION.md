# BudgetWise PostgreSQL integration (Windows + Supabase)

This version adds native PostgreSQL support via psycopg 3 without removing
SQLite. Existing frontend pages, FastAPI routes, authentication and business
logic remain unchanged. PostgreSQL is selected by setting DATABASE_URL
in your private .env file.

## 1. Make a safety backup first

Stop the FastAPI server (Ctrl+C). In the project terminal:

    Copy-Item budgetwise.db budgetwise_before_postgres.db

Do not delete or upload this database. It may contain private financial records.
Do not move passwords, database URLs, or secret keys to GitHub.

## 2. Create your free Supabase project

Open https://supabase.com/dashboard and create a project. Record its
database password securely. Click Connect to see your PostgreSQL URI.

On many Windows networks without IPv6, choose the Session pooler connection
(port 5432), NOT the Transaction pooler (port 6543).

A typical URI has this SHAPE, but copy the real one from YOUR dashboard:

    postgresql://postgres.PROJECT_REF:PASSWORD@POOLER_HOST:5432/postgres?sslmode=require

If the copied URI already contains a question mark, append &sslmode=require
instead. URL-encode special password characters such as @, %, :, / and #.

Supabase connection guidance:
https://supabase.com/docs/guides/database/connecting-to-postgres

This requires encrypted transport. For full server certificate verification,
you can later set sslmode=verify-full and point to the relevant CA cert.

## 3. Install the Python dependencies

In your activated BudgetWise virtual environment:

    python -m pip install -r requirements.txt

The psycopg driver is listed there. No Supabase anon key or service-role
key is needed: FastAPI uses a server-side PostgreSQL connection.

## 4. Add DATABASE_URL in BudgetWise/.env

Add a SINGLE line with your actual Supabase connection URI:

    DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@POOLER_HOST:5432/postgres?sslmode=require

Keep existing SECRET_KEY and other values untouched. DATABASE_URL must NEVER
be placed in frontend JavaScript or committed to GitHub. The .env file is
already Git-ignored.

## 5. Preview a SQLite-to-PostgreSQL transfer

Stop FastAPI. Check your backup exists, then run:

    python -m app.migrations.sqlite_to_postgres --dry-run

This checks the original SQLite file and shows how many rows would be copied
in the users, expenses, budgets, goals, monthly_income, login_challenges,
and monthly_report_delivery tables.

If the source file says SQLite migration version 8 is missing, temporarily
comment out DATABASE_URL, run:

    python -c "from app.migrations.manager import run_migrations; run_migrations()"

Then restore DATABASE_URL in .env and run --dry-run again.

## 6. Copy the SQLite records exactly once

The PostgreSQL destination must have no user or finance data yet:

    python -m app.migrations.sqlite_to_postgres --yes

The script validates SQLite integrity and schema v8, initializes missing
PostgreSQL tables, refuses a nonempty destination, copies original primary
keys and hashed passwords, and verifies all table counts before committing.

It also adjusts PostgreSQL identity sequences for future inserts. If an
operation fails, PostgreSQL rolls back the data transfer.

The original SQLite file is opened read-only and is not changed or deleted.

## 7. Verify PostgreSQL and start FastAPI

    python -c "from app.migrations.manager import run_migrations; run_migrations(); print('PostgreSQL connected successfully')"
    python -m uvicorn api:app --reload

Open http://127.0.0.1:8000/docs and then your usual frontend.

Check your historical expenses, dashboard, budgets, goals and month reports.

NOTE: The existing Brevo login OTP configuration is separate from the
database migration. If your Brevo account is not configured, login still
returns HTTP 503. This is not a PostgreSQL failure.

## 8. Run tests safely

    python -m pytest -q

The regular test suite still uses SQLite by default. A safeguard prevents
ordinary SQLite tests from connecting to a PostgreSQL URL.

The dedicated PostgreSQL tests run automatically in GitHub Actions using
a local disposable database. They require BUDGETWISE_TEST_POSTGRES=1 and a
localhost database literally named budgetwise_test. DO NOT run these tests
against Supabase: they intentionally erase test records.

## Rollback

If PostgreSQL setup fails, remove/comment DATABASE_URL from .env, restart
FastAPI, and the application returns to the existing SQLite file.

New writes made in PostgreSQL are NOT automatically synchronized back.
Retain the SQLite backup until the migration is fully verified.

## Follow-up improvements

- PostgreSQL stores money in NUMERIC(18,2), but legacy calculations/API
  serializers still use floats; full Decimal money calculations are next.
- Expenses and goals keep ISO date strings for backwards compatibility.
- For larger production deployments, introduce a connection pool and migrate
  database operations to SQLAlchemy/Alembic.
- Review Supabase plan quotas, backup options and inactivity conditions.
- Configure verified TLS, least-privilege DB credentials and independent
  encrypted backups before storing important production financial records.
