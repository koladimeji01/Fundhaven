"""Safely inspect the ACTUAL database login role from the Render runtime.

Run privately on Render using the same environment as the deployed API:
    python -m scripts.inspect_backend_db_role

No secrets, DB URLs, user details or financial rows are printed. Performs
a single SELECT of PostgreSQL identity/role metadata and exits without writes.
"""
from app import database
from app.db_backend import using_postgres


def inspect():
    if not using_postgres():
        print("ERROR: DATABASE_URL is not PostgreSQL in this runtime.")
        return 2
    conn = None
    try:
        conn = database.create_connection()
        row = conn.execute("""
            SELECT current_user, session_user,
                   COALESCE((SELECT rolbypassrls FROM pg_roles
                             WHERE rolname = current_user), false)
        """).fetchone()
        if not row or not row[0]:
            print("ERROR: Cannot identify database role.")
            return 2
        role, session, bypass = row
        print("Backend database login role:", role)
        print("Session role:", session)
        print("Current role bypasses RLS:", bool(bypass))
        if role in ("anon", "authenticated"):
            print("BLOCKER: backend uses a role scheduled for access revocation.")
            return 2
        if not bypass:
            print("BLOCKER: backend role does not bypass RLS; review policies first.")
            return 2
        print("ROLE CHECK PASSED: confirm backup before applying SQL.")
        return 0
    except Exception:
        print("ERROR: Database role inspection failed. See private Render logs.")
        return 2
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


if __name__ == "__main__":
    raise SystemExit(inspect())
