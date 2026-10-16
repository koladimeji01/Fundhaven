# FundHaven production release verification

This checklist complements the checked-in tests. It must be completed on a
staging account before claiming a production release is verified.

## Verified by GitHub
- A successful **main** workflow run executes SQLite, PostgreSQL, JavaScript
  syntax, Finova/currency, and static frontend build tests.
- `repository-hygiene` checks the CURRENT tracked file list for private data,
  database files, virtual environments, local build output, and credential files.

## Require tests before merging
Repository Settings → Rules → Rulesets → New branch ruleset:
- Target `main` and require a pull request with review.
- Require status checks `repository-hygiene`, `sqlite-tests`, and `postgres-tests`.
- Disable bypasses for routine pushes and consider preventing force pushes.
- Recheck the ruleset is **active**, because the application previously had
  an unprotected `main` branch.

## Confirm hosting and secrets
1. Reconnect the Vercel integration to the right team/project if inspection
   returns HTTP 403. Confirm the project `fundhaven` is linked to the
   intended GitHub repository, branch `main`, and frontend root `frontend/`.
2. Check its latest production deployment is **READY** and uses the current
   commit from `main`. Check that its public `runtime-config.js`
   points to the HTTPS Render endpoint ending with `/api/v1`.
3. In Render, check the start command `uvicorn api:app --host 0.0.0.0 --port $PORT`,
   `ENVIRONMENT=production`, a **backend-only**, high-entropy
   `SECRET_KEY`, a persistent PostgreSQL `DATABASE_URL`, and correct
   `FUNDHAVEN_ALLOWED_ORIGINS`. Never copy secret values into chat or logs.
4. Verify the HTTPS frontend, HTTPS `/health` endpoint, CORS preflight from
   the production frontend, and that API responses send `Cache-Control: no-store`.
5. Confirm `main` deploy was actually promoted to production; a GitHub merge
   alone does not prove that Vercel or Render deployed successfully.

## Use temporary test accounts, NEVER real data
- Register; sign in with email, sign out, sign in with username.
- Confirm wrong credentials get 401. New token is required after password change.
- Test negative/invalid money inputs and monthly income/edit consistency.
- Add/edit/delete expense, budgets, goals, and compare dashboard totals.
- Attempt duplicate budget categories with different casing/spacing; should get 409.
- Verify profile, notifications, currency formats, and all pages on mobile.
- Confirm an account cannot view/change/delete another account's records.
- Verify wrong-password account deletion fails and correct-password
  deletion removes only the temporary test account.
- Check browser Network/Console and deployment logs for unexplained 4xx/5xx,
  CORS, or missing resources.

## Important unresolved issues
- Old Git commits can still contain a previously committed SQLite backup.
  Removing the file in recent commits is **not sufficient** to eliminate exposure.
  Coordinate sensitive-data incident review and historical Git object cleanup.
- Login and AI rate limits are per process, not distributed. For scaled
  production use, install shared store/gateway limits and spending controls.
- Email verification, a restrictive CSP, and full browser E2E tests are
  not yet enforced by the repo's existing checks.
- The live Vercel project could not be inspected with the current integration
  because access to the project scope returned 403.
