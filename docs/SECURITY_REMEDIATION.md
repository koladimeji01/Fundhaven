# FundHaven incident and production security checklist

## Previously committed database

An old SQLite backup and local runtime artifacts existed in the public Git repository.
This branch removes them from the current checkout, but **does not erase them from
existing commits, forks, clones or provider caches**. Assume the backed-up records
may have been seen by third parties. Do not print or post their contents.

1. Treat the prior database backup as potentially exposed until privately inspected.
   Identify whether it holds personal information or password hashes.
2. Notify any affected users as required and reset compromised credentials/tokens.
   Rotate deployed `SECRET_KEY` and affected API/database credentials if exposure is suspected.
3. Make a separate, coordinated history rewrite using `git filter-repo` to remove
   the backup and `venv/` across **all** refs. Back up the original repository
   securely, inform collaborators, and force-push only in a planned maintenance window.
   Ask GitHub Support for repository object/cached view cleanup if needed.
4. Verify no secrets or finance records remain in commits or deploy artifacts.
   Existing clones/forks may still retain copies even after the rewrite.
5. Keep `.env`, local `*.db`, backups, and virtual environments untracked.

## Before production merge

- Confirm `DATABASE_URL` connects to the intended persistent PostgreSQL database.
- Set a high-entropy backend-only `SECRET_KEY` of at least 32 characters.
- Verify the Render/Vercel production environment and the active CORS origins.
- Confirm current users can log in again after JWT invalidation.
- Review HTTPS, Content Security Policy rollout and stored-XSS testing. The frontend
  currently uses some inline scripts, so a restrictive CSP requires gradual rollout.
- Deploy a gateway/Redis login and AI-request rate limiter for multi-worker use.
- Run SQLite and PostgreSQL tests and browser end-to-end tests against a staging site.
- Use a database backup/restore drill; never upload real backup files to GitHub.
