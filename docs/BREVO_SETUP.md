# BudgetWise email verification and monthly reports (Brevo)

This feature builds on the month-based finance changes in PR #1.

## 1. Set up Brevo

1. Create a Brevo account: https://www.brevo.com/
2. Verify a sending email address or authenticate your domain.
   Documentation: https://developers.brevo.com/docs/getting-started-with-senders-and-domains
3. Generate an API key in Brevo's SMTP & API settings.
4. Keep the key SECRET and out of GitHub.

Edit your existing, **Git-ignored** .env file in the project root.
Keep any existing variables and add:

    BREVO_API_KEY=your_real_brevo_api_key
    BREVO_SENDER_EMAIL=verified-sender@your-domain.com
    BREVO_SENDER_NAME=BudgetWise

Do not paste the secret key in chat or put it in frontend JavaScript.

No additional email SDK is required; the Python standard library calls
the Brevo transactional endpoint https://api.brevo.com/v3/smtp/email.

Make sure your .env also contains a strong SECRET_KEY and a real DATABASE_NAME.

## 2. Migration and testing

Back up your production SQLite database BEFORE starting this version:

    Copy-Item budgetwise.db budgetwise_before_email_upgrade.db

Activate your virtual environment, then run:

    python -m pytest tests/test_monthly_finance.py -q
    python -m pytest tests/test_email_security.py -q
    python -m pytest -q

Tests mock Brevo; they must not send actual emails.

The migration adds:
- login_challenges (hashed, expiring, single-use codes)
- users.monthly_reports_enabled (defaults to false)
- monthly_report_delivery (unique user/month delivery ledger)

## 3. Login behavior

POST /api/v1/login
    {"email": "person@example.com", "password": "secret"}

After a valid password, normal development and production return:
    {"verification_required": true,
     "challenge_id": "...", "expires_in": 300, "message": "..."}

The user receives an email containing a 6-digit one-time code.

POST /api/v1/login/verify
    {"challenge_id": "...", "code": "123456"}

Only successful code verification returns the JWT access_token.

POST /api/v1/login/resend
    {"challenge_id": "..."}

Codes expire after five minutes, are valid once, and have five attempt
limits, a 60-second resend cooldown, and a maximum of three resends.
The sign-in page displays the verification code form automatically.

When Brevo is not configured or sending fails, normal logins are
blocked with HTTP 503 rather than issuing an unverified token.

Legacy token-only behavior is limited to actual pytest test execution,
so existing historical test cases do not have to simulate OTP.
New OTP tests explicitly enable the full flow.

## 4. Monthly email preference

Users can opt in or out in Settings → Notifications → Monthly Financial
Report by Email. The preference is stored in SQLite, not localStorage.

GET /api/v1/users/me/monthly-email
PUT /api/v1/users/me/monthly-email
    {"monthly_reports_enabled": true}

A bearer token is required for both.

## 5. Run monthly reports

Reports use the completed previous calendar month, from the user's
existing dated expenses and income-history table, and are sent in NGN.
When historic income is unavailable, the report says "Not recorded" rather
than inventing a historical income or savings rate.

Preview reports (no emails sent and no ledger changes):

    python -m app.monthly_reports --dry-run

Actually send reports to opted-in users:

    python -m app.monthly_reports

This command sends only during days 1–7 of the new month, normally on
day 1. Re-running it after a successful send skips that user/month.
Failed sends can be retried. This is **not** an in-process background
timer; you must configure a scheduler.

### Windows development: Task Scheduler

Use Windows Task Scheduler → Create Task:
- Trigger: Daily at 09:00 local Nigeria time.
- Program: absolute path to your project's venv\Scripts\python.exe
- Arguments: -m app.monthly_reports
- Start in: absolute path to the BudgetWise repository root.
- Prefer to run only while the computer can reach the Internet.
- Enable retry on failure; the database ledger prevents routine duplicates.

For production, use an always-on server with a daily cron/scheduled job
at 09:00 Africa/Lagos instead. Do not start the sender inside FastAPI's
lifespan or per-web-request (multiple workers could send duplicates).

Brevo returning a message ID means "accepted for delivery"; it does not
guarantee arrival in the user's inbox. The delivery ledger prevents
routine duplicates, but a process crash after Brevo accepts a message
and before the database acknowledges success can lead to a rare retry.

## 6. Deployment reminders

- Require HTTPS.
- Never commit .env, a token, a password, or a Brevo key.
- Rotate credentials immediately if exposed.
- Existing JWTs issued before enabling OTP remain valid until expiration.
  Rotate SECRET_KEY if you need to invalidate all older sessions, knowing
  it will also sign out current users.
- For public production, add distributed password-login/IP throttling,
  account recovery and email-change verification before wide release.
