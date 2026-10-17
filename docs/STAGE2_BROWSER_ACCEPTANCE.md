# FundHaven browser acceptance test

The separate browser-e2e CI job installs Chromium and Playwright, launches a
throwaway SQLite backend on 127.0.0.1:8000 and the existing frontend on port
5500, then drives a real browser through registration, login, an expense,
budget, goal, dashboard, reports, settings and mobile session expiry.

The test explicitly refuses to run when PostgreSQL DATABASE_URL is set and
requires ENVIRONMENT=testing and DATABASE_NAME=ci_browser_fundhaven.sqlite3.
It never accesses production Supabase, Vercel or Render and uses fake data.

This test is a local browser integration test, NOT a validation of the
deployed Vercel site, which currently returns scope/permissions errors to
the integration. The eight Supabase tables with RLS disabled and missing
independently restorable backup are still release blockers.
