-- FUNDHAVEN: MANUAL PRODUCTION SECURITY MIGRATION (REVIEW FIRST)
-- NEVER run automatically on application startup or deploy.
-- Only run AFTER verifying Render's actual PostgreSQL login role, confirming
-- a recoverable database backup, and arranging a maintenance window.
-- Intent: deny direct Supabase anon/authenticated access to FundHaven's tables.
-- FastAPI remains the sole route for signed-in finance activity.
-- No records or password hashes are read, updated, or deleted by this SQL.
--
-- IMPORTANT: No RLS policies are added. The app does not authenticate via
-- Supabase Auth/JWT. Non-owner database roles will lose access unless an
-- appropriate separate backend access strategy is explicitly configured.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

REVOKE ALL PRIVILEGES ON TABLE
    public.users,
    public.expenses,
    public.budgets,
    public.goals,
    public.monthly_income,
    public.migrations,
    public.login_challenges,
    public.monthly_report_delivery
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON SEQUENCE
    public.users_id_seq,
    public.expenses_id_seq,
    public.budgets_id_seq,
    public.goals_id_seq,
    public.migrations_id_seq
FROM anon, authenticated;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_report_delivery ENABLE ROW LEVEL SECURITY;

COMMIT;
