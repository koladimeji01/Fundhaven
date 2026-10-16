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

This is a **branding change**, not a breaking API/data migration. The preferred environment variables are `FUNDHAVEN_API_URL` for the Vercel/Netlify frontend build and `FUNDHAVEN_ALLOWED_ORIGINS` for Render CORS. Older `BUDGETWISE_API_URL` and `BUDGETWISE_ALLOWED_ORIGINS` keys remain supported to avoid disrupting hosting. Existing `/api/v1` routes, token storage, `window.BUDGETWISE_API_BASE_URL`, and `budgetwise.db` are unchanged. See `docs/FREE_HOSTING.md` for deployment settings.

**Security:** configure secrets only on the backend; do not commit tokens, environment files, database exports, or virtual environments.