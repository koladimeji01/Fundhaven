# Stage 1: Production readiness — inspection report
Date: 2026-10-17. No live credentials, records, or production permissions were modified.

## Critical Supabase security finding
A read-only Supabase advisor and catalog inspection found all eight FundHaven
public-schema tables without row-level security (RLS): users, expenses,
budgets, goals, migrations, monthly_income, login_challenges, and
monthly_report_delivery. Each grants anonymous SELECT, INSERT, UPDATE, DELETE.

This potentially permits direct PostgREST access to private finance data
and password hashes despite FastAPI's JWT security. Treat as HIGH PRIORITY.

**Action requires explicit production owner approval.** Back up the database,
confirm the Render database role, then use a reviewed, tested migration to
REVOKE direct access from anon/authenticated and ENABLE ROW LEVEL SECURITY.
Do not casually enable RLS with no policies, as it can disrupt consumers.
FundHaven tables are owned by 'postgres' (which normally bypasses RLS).
Confirm the actual backend role and test account flows before any change.

Guide: https://supabase.com/docs/guides/database/postgres/row-level-security

## Live-hosting checks
The database project reports ACTIVE_HEALTHY. Live HTTPS URL probes could
not complete in the analysis environment, and the Vercel project integration
returned HTTP 403 on deployment inspection. Do not claim the live deployment
is verified until the owner resolves account scope and runs the smoke probe.

Read-only public smoke command:
python scripts/production_smoke.py --frontend https://YOUR-SITE.vercel.app --api https://YOUR-API.onrender.com/api/v1

It performs GET and OPTIONS only, with no login, writes or financial records.
The new /ready check confirms DB connectivity; /health remains liveness.
These are not replacements for manual staging-account journeys or pen testing.

## Other release blockers
The historical committed SQLite backup requires a coordinated incident
review and history cleanup. Do not print sensitive records in build logs.
Per-process login/AI throttling is not a distributed abuse control.
PR #17 separately proposes repository-hygiene and cache-control fixes.
Do not point the PostgreSQL integration tests at production; they delete
test data and intentionally reject non-local test databases.
