# FundHaven FREE web deployment: Vercel + Render + Supabase

These instructions publish FundHaven as a DEMO/DEVELOPMENT site.
Vercel Hobby is for non-commercial use. Render Free may sleep after 15
minutes and can take about a minute to wake. Neither free deployment is
appropriate for a financial app with real customers or production SLAs.

Services:
- Website: Vercel (static HTML/CSS/JS under frontend/).
- FastAPI backend: Render Free (api.py, Python, port from $PORT).
- Persistent database: your existing Supabase PostgreSQL project.

This repo has frontend/vercel.json, frontend/build.js, render.yaml and
a runtime-config.js. You do NOT need to edit all the JS files manually.

## Step 0 - Merge and pull the deployment branch

Merge the deployment pull request into main, then run:

    git switch main
    git pull origin main

Do not upload .env or your SQLite database to GitHub.
Your previous Ubuntu pip error is unrelated to Vercel: both Render and
Vercel install/build their dependencies in their own cloud environments.

## Step 1 - Deploy the FastAPI backend on Render

1. Visit https://dashboard.render.com/ and sign in.
2. Choose New -> Blueprint.
3. Connect the GitHub repository koladimeji01/budgetwise.
4. Select main, and confirm Render can read render.yaml at repository root.
5. Choose the Free service plan specified in render.yaml.
6. For DATABASE_URL, enter the **PostgreSQL connection URI**, obtained from
   your Supabase dashboard -> Connect -> Session pooler. It typically
   ends with /postgres?sslmode=require and has port 5432.
   The full URI includes the database password and must remain PRIVATE.
7. Render generates SECRET_KEY automatically. ENVIRONMENT is production.
8. Deploy. Wait until the service shows Live.
9. Open https://YOUR-RENDER-NAME.onrender.com/health .
   The API should return {"status":"healthy"}.

The backend will initialize empty PostgreSQL tables on first startup.
It does NOT copy existing SQLite records automatically.

IMPORTANT: Render Free uses an ephemeral filesystem; app startup
refuses to run in production without DATABASE_URL. This is deliberate.
Never remove this safeguard to make SQLite work on a free cloud host.

If Render fails to connect to Supabase, check:
- You copied the full PostgreSQL URI (not a supabase.co API URL).
- Your database password is correct and URL-encoded if necessary.
- You chose Session pooler if IPv4 is required.
- Your project is active, accessible and permits connections.
- You included sslmode=require as appropriate.

## Step 2 - Deploy the static frontend on Vercel

1. Go to https://vercel.com/new and connect your GitHub account.
2. Import koladimeji01/budgetwise.
3. Set **Root Directory** to frontend (not the repo root).
4. Set Framework Preset to Other.
5. Confirm the frontend/vercel.json file configures:
     Build Command: node build.js
     Output Directory: dist
6. Under Environment Variables, add:
     NAME: BUDGETWISE_API_URL
     VALUE: https://YOUR-RENDER-NAME.onrender.com/api/v1

   This is a PUBLIC API address, not a secret key.
   It must start with https and end with /api/v1.
   NEVER set DATABASE_URL, SECRET_KEY, or OPENAI_API_KEY on the
   public static Vercel project.
7. Click Deploy. Vercel builds and publishes the site.
8. Visit the .vercel.app domain it gives you.
   index.html is the FundHaven landing page; login.html is the login page.

If the Vercel build reports "Missing BUDGETWISE_API_URL", set that
environment variable in Vercel Project Settings, then redeploy.
The build fails closed instead of publishing JavaScript that tries to
connect to your local computer's 127.0.0.1 address.

## Step 3 - Permit the Vercel origin on Render

Once Vercel gives you the actual public hostname:

1. Render Dashboard -> budgetwise-api -> Environment.
2. Add:
     BUDGETWISE_ALLOWED_ORIGINS=https://YOUR-PROJECT.vercel.app
3. Save and redeploy/restart the backend.
4. If your production domain is different from the preview domain,
   use the exact one served to users. For multiple domains, separate
   exact HTTPS origins with commas; no wildcards or paths.

Verify that requests from the deployed login and dashboard pages can
reach the Render API. CORS is NOT authentication: protected endpoints
still require the FundHaven JWT and checks in FastAPI.

## Step 4 - Login and financial data (important!)

FundHaven now signs users in using their registered email address or
username **and password**. A successful password check returns the normal
24-hour JWT; an emailed code or Brevo account is **not** required.

Email addresses still identify accounts and are used for optional
notifications where separately configured. Never remove the
SECRET_KEY or password hashing. Consider account lockouts, rate
limiting and MFA before a real-money production launch.

Because the Supabase database is currently new/empty, historical users,
expenses and budgets from your local SQLite file will not appear until
you run a safe one-time data migration. Once your local Python virtual
environment is repaired:

    python -m app.migrations.sqlite_to_postgres --dry-run

Review the result, back up budgetwise.db, and only then run:

    python -m app.migrations.sqlite_to_postgres --yes

The destination must be empty of application data. The import preserves
existing IDs and password hashes. Do NOT copy private SQLite DB files
to GitHub/Vercel/Render just to run the migration.

See docs/POSTGRESQL_MIGRATION.md for the full safety procedure.

## Step 5 - Finova: private insights + generative AI advice

**Finova** is the AI financial assistant inside the FundHaven Dashboard.

- **View Finova insights (private)** reads the user's FundHaven finances
  through GET /api/v1/ai/insights. Suggestions use local rules only,
  require no OpenAI API key, and send no data to the AI provider.
- **Ask Finova for AI advice** uses OpenAI's Responses API only after
  explicit consent for EACH request. Only monthly aggregate finances are
  sent: income/expense totals, category names and totals, and budgets.
  User names, emails, passwords, and transaction descriptions are not sent.
  These amounts are recorded in NGN even when UI display is converted.

### Configure generative advice on Render

1. Open the Render **budgetwise** service.
2. Select **Environment → Add Environment Variable**.
3. Set `OPENAI_API_KEY` to your **private OpenAI API key**.
4. Optionally set `OPENAI_MODEL=gpt-4.1-mini`.
5. Save and redeploy. Keep the secret off GitHub, Vercel, browser code,
   screenshots, and support chats.
6. Sign in to FundHaven → Dashboard → **Finova**. The dashboard checks
   authenticated `GET /api/v1/ai/status` to report whether the backend
   key is configured (it does NOT validate credentials or billing).
7. Tick the consent checkbox, click **Ask Finova for AI advice**, and
   wait for the model response.

An OpenAI API key AND available API billing/credits are required. A
ChatGPT Plus/Pro subscription does not include API credits by default.
The user and developer should never paste API keys into the frontend.

### Troubleshooting Finova

- **Generative advice not configured:** `OPENAI_API_KEY` is missing
  on the Render backend. Private Finova insights continue to work.
- **Authentication failure:** check the API key stored privately
  on Render. Do not paste the key into a public issue.
- **API quota or rate limit:** check API billing/credits and usage.
- **Model unavailable:** check `OPENAI_MODEL`; leave it unset to
  use the application default.
- **Backend cannot be reached:** fix Render's failed deployment,
  PostgreSQL connection, and CORS first. Finova cannot bypass this.
- **Model gives an empty/incomplete response:** retry once; check the
  Render logs with secrets hidden if it persists.

Finova does not promise professional financial advice; the model can
make mistakes. Server-side data protections, per-user rate limiting,
and expense controls must remain enabled.

## Tests and troubleshooting

Both environments run over HTTPS. Tests in this repository ensure:
- Existing frontend JS reads public API config and retains local fallback.
- Vercel build injects the public API URL into dist/js/runtime-config.js.
- Production FastAPI never falls back to ephemeral SQLite.
- CORS permits only explicit trusted HTTPS website origins.
- SQLite and PostgreSQL integration regressions still pass.

Open the browser Developer Tools Network tab:
- Requests must target https://YOUR-RENDER-NAME.onrender.com/api/v1
- Login no longer requires Brevo, but a database connection is still mandatory.
- CORS errors mean Render's BUDGETWISE_ALLOWED_ORIGINS doesn't match.
- A slow first request means Render Free was asleep; wait for wake-up.
- A server error on Render startup may mean DATABASE_URL is wrong.

Monthly report emails are NOT scheduled automatically with this
free stack. They require a trusted always-on scheduler or a separate
scheduled function and must be configured later.

## Important production warning

Do not use Vercel Hobby for a commercial FundHaven launch. Its free
Hobby plan is for non-commercial/personal use. Render Free is explicitly
not recommended for production, has an ephemeral filesystem and cold
starts. Before collecting real customers' financial data, plan paid
hosting, independent backups, abuse throttling, HTTPS certificate
verification, reliable authentication/email delivery, privacy terms,
and security review.

Documentation:
https://vercel.com/docs/builds/configure-a-build
https://render.com/docs/free
https://render.com/docs/blueprint-spec
https://supabase.com/docs/guides/database/connecting-to-postgres


## CORS for FundHaven's Vercel frontend

The backend explicitly trusts the Vercel project's current deployment URL
(`https://budgetwise-frontend-c5ajigvrg.vercel.app`) and the stable production
alias (`https://budgetwise-frontend-tan.vercel.app`), as well as its project alias.
This prevents browser login POST preflight requests from failing after the
FundHaven rebrand.

**Use the stable production alias for normal sign-ins.** Each uniquely named
Vercel deployment has its own origin. To allow additional preview deployments or
a new custom domain, add its exact HTTPS origin to Render's
`BUDGETWISE_ALLOWED_ORIGINS` environment variable (comma-separated), then
redeploy/restart the Render service. Do not use wildcards, localhost, or paths in
production origins. CORS is not an authentication mechanism; JWT protection
remains required for private API endpoints.
