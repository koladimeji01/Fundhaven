# FundHaven production security — cache and repository hygiene

The public PostgreSQL/Supabase RLS permissions are a **separate urgent blocker**
and are not changed by this pull request. This PR adds independent protections
while the owner prepares a verifiable and securely stored database backup.

## Added protections

- Financial API responses including unauthorized requests use
  `Cache-Control: no-store` and `Pragma: no-cache`; also
  `X-Content-Type-Options: nosniff`.
- CI inspects **tracked paths**, rejecting SQLite databases, private backups,
  credentials, certificate/private-key files and generated build directories.
- The GitHub Actions token is restricted to read-only repository access
  by default. All UI markup, JavaScript and Lucide icons are unchanged.

The repository check cannot scan or erase old Git history. The previously
committed SQLite backup needs a separate incident response.

## Emergency production access issue

Supabase's `public` schema contains eight app tables without RLS and
anonymous database privileges. The manual SQL migration is already staged
in `docs/sql/supabase_rls_lockdown_manual.sql`, with a verification query.
It has NOT run, so direct Supabase access remains a serious risk.

Before any schema/security DDL:
1. Confirm a **restorable, private off-site backup** of the live database.
   The Supabase Free plan does not provide daily scheduled backups.
2. Verify the actual Render DB connection identity and permission behavior.
   Existing logs show the Supabase pooler login `postgres.<project-ref>`.
3. Arrange a short maintenance window, apply the scoped change, and verify
   both anonymous denial and authenticated FastAPI functionality.

### Windows backup alternative when Node.js/npx is unavailable

PostgreSQL 17's `pg_dump` and `pg_restore` command-line tools can create
a logical backup without Node.js or Docker. Install PostgreSQL 17 client
binaries from the official PostgreSQL Windows installers. Use the **session
pooler** hostname and the DB username shown by Supabase's **Connect** panel.
Never paste a database password or an exported dump into GitHub/chat.

In PowerShell, after adding the PostgreSQL 17 `bin` folder to PATH,
run this command using the correct host/user values confirmed in the Supabase
Dashboard (the tool will prompt for the password):

```powershell
pg_dump.exe --host <SUPABASE_SESSION_POOLER_HOST> --port 5432 --username <SUPABASE_POSTGRES_USER> --dbname postgres --schema public --format custom --no-owner --no-acl --file "$HOME\Documents\FundHaven-Private-Backup\fundhaven_public.backup" --password --verbose
```

Check the archive structure without printing any data:

```powershell
pg_restore.exe --list "$HOME\Documents\FundHaven-Private-Backup\fundhaven_public.backup"
```

A listable file is not by itself proof of recoverability: a restore test into
a separate disposable local/staging PostgreSQL database remains necessary.
The backup contains sensitive customer data and password hashes; keep it
encrypted and access-limited.
