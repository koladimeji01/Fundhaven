# FundHaven

**Track smarter. Spend better.**

FundHaven is a personal **expense tracker** built with FastAPI and a lightweight HTML/CSS/JavaScript frontend. It helps users record transactions, understand spending patterns, plan budgets and review monthly reports. Optional AI spending insights complement the tracker.

## Features

- Expense tracking, category breakdowns and transaction search
- Spending dashboard, reports and budgets
- Goals, account settings and protected authenticated pages
- Optional privacy-aware Finova insights

## Project structure

- `frontend/` — responsive browser application and FundHaven branding
- `app/`, `api.py` — FastAPI backend and business logic
- `tests/` — automated backend tests
- `docs/` — deployment and feature configuration

## Brand assets

- `frontend/assets/fundhaven-mark.svg` — square app icon used on the site
- `frontend/assets/fundhaven-logo.svg` — horizontal logo and tagline
- `frontend/css/brand.css` — shared logo sizing
- Slogan: **Track smarter. Spend better.**

## Deployment compatibility

This is a **branding change**, not a breaking API/data migration. Existing `/api/v1` routes, token storage keys, `window.BUDGETWISE_API_BASE_URL`, `BUDGETWISE_API_URL` and `BUDGETWISE_ALLOWED_ORIGINS` are intentionally preserved to avoid breaking already configured hosting. Existing `budgetwise.db` databases and the GitHub repository slug also remain unchanged. See `docs/FREE_HOSTING.md` for the current deployment settings.

**Security:** configure secrets only on the backend; do not commit tokens, environment files, database exports, or virtual environments.