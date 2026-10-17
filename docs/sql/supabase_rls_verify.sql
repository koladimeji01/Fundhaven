-- FUNDHAVEN: READ-ONLY post-change Supabase access verification.
-- Expected: eight tables, every rls_enabled=true and anon_* / signed_in_* false.
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
       has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
       has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS signed_in_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') AS signed_in_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE') AS signed_in_update,
       has_table_privilege('authenticated', c.oid, 'DELETE') AS signed_in_delete
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('users','expenses','budgets','goals','monthly_income',
                    'migrations','login_challenges','monthly_report_delivery')
  AND c.relkind IN ('r','p')
ORDER BY c.relname;

-- Expected: five sequences without anon/authenticated USAGE or SELECT.
SELECT c.relname AS sequence_name,
       has_sequence_privilege('anon', c.oid, 'USAGE') AS anon_usage,
       has_sequence_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_sequence_privilege('authenticated', c.oid, 'USAGE') AS signed_in_usage,
       has_sequence_privilege('authenticated', c.oid, 'SELECT') AS signed_in_select
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='S'
  AND c.relname IN ('users_id_seq','expenses_id_seq','budgets_id_seq',
                    'goals_id_seq','migrations_id_seq')
ORDER BY c.relname;
