"""One-time email verification for password-authenticated logins.

Only HMAC digests are persisted. Codes expire after five minutes,
have limited attempts, are single-use and are never returned by the API.
"""
import hashlib
import hmac
import secrets
from app.db_backend import DB_ERRORS
import time
from uuid import uuid4

from app import database
from app.config import SECRET_KEY

CODE_LIFETIME_SECONDS = 300
RESEND_COOLDOWN_SECONDS = 60
MAX_ATTEMPTS = 5
MAX_RESENDS = 3


class VerificationError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def _digest(challenge_id: str, code: str) -> str:
    if not SECRET_KEY:
        raise RuntimeError("SECRET_KEY must be configured")
    material = (challenge_id + ":" + code).encode("utf-8")
    return hmac.new(
        SECRET_KEY.encode("utf-8"), material, hashlib.sha256
    ).hexdigest()


def _new_code():
    return f"{secrets.randbelow(1000000):06d}"


def issue_login_challenge(user_id: int):
    """Return challenge ID and plaintext code for one immediate email send."""
    now = int(time.time())
    challenge_id = str(uuid4())
    code = _new_code()
    db = database.create_connection()
    try:
        db.execute("BEGIN IMMEDIATE")
        recent = db.execute("""
            SELECT 1 FROM login_challenges
            WHERE user_id = ? AND created_at > ?
              AND consumed_at IS NULL
            LIMIT 1
        """, (user_id, now - RESEND_COOLDOWN_SECONDS)).fetchone()
        if recent:
            raise VerificationError(
                429, "Please wait a minute before requesting another sign-in code"
            )
        db.execute("""
            UPDATE login_challenges
            SET consumed_at = ?
            WHERE user_id = ? AND consumed_at IS NULL
        """, (now, user_id))
        db.execute("""
            INSERT INTO login_challenges
            (id, user_id, code_digest, created_at, expires_at, last_sent_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            challenge_id, user_id, _digest(challenge_id, code),
            now, now + CODE_LIFETIME_SECONDS, now
        ))
        db.commit()
        return challenge_id, code
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def discard_challenge(challenge_id: str):
    db = database.create_connection()
    try:
        db.execute("""
            DELETE FROM login_challenges WHERE id = ?
        """, (challenge_id,))
        db.commit()
    finally:
        db.close()


def invalidate_challenge(challenge_id: str):
    db = database.create_connection()
    try:
        db.execute("""
            UPDATE login_challenges
            SET consumed_at = ?
            WHERE id = ? AND consumed_at IS NULL
        """, (int(time.time()), challenge_id))
        db.commit()
    finally:
        db.close()


def resend_login_challenge(challenge_id: str):
    """Reissue a code with a cooldown; return recipient user ID and code."""
    now = int(time.time())
    db = database.create_connection()
    try:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("""
            SELECT user_id, expires_at, last_sent_at,
                   attempts, resend_count, consumed_at
            FROM login_challenges WHERE id = ?
        """, (challenge_id,)).fetchone()

        if not row or row[5] is not None or row[1] <= now or row[3] >= MAX_ATTEMPTS:
            raise VerificationError(401, "Verification session has expired")
        if now - row[2] < RESEND_COOLDOWN_SECONDS:
            raise VerificationError(429, "Please wait before resending your code")
        if row[4] >= MAX_RESENDS:
            raise VerificationError(429, "Maximum resends reached. Sign in again")

        code = _new_code()
        db.execute("""
            UPDATE login_challenges
            SET code_digest = ?, last_sent_at = ?, expires_at = ?,
                resend_count = resend_count + 1
            WHERE id = ?
        """, (_digest(challenge_id, code), now,
              now + CODE_LIFETIME_SECONDS, challenge_id))
        db.commit()
        return row[0], code
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def consume_login_challenge(challenge_id: str, code: str) -> int:
    """Atomically verify then consume. Return the authenticated user ID."""
    now = int(time.time())
    db = database.create_connection()
    try:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("""
            SELECT user_id, code_digest, expires_at, attempts, consumed_at
            FROM login_challenges WHERE id = ?
        """, (challenge_id,)).fetchone()

        if (
            not row
            or row[4] is not None
            or row[2] <= now
            or row[3] >= MAX_ATTEMPTS
        ):
            raise VerificationError(401, "Invalid or expired verification code")

        correct = hmac.compare_digest(
            row[1], _digest(challenge_id, code)
        )
        if not correct:
            attempts = row[3] + 1
            db.execute("""
                UPDATE login_challenges
                SET attempts = ?,
                    consumed_at = CASE WHEN ? >= ? THEN ? ELSE consumed_at END
                WHERE id = ?
            """, (attempts, attempts, MAX_ATTEMPTS, now, challenge_id))
            db.commit()
            raise VerificationError(401, "Invalid or expired verification code")

        db.execute("""
            UPDATE login_challenges SET consumed_at = ?
            WHERE id = ?
        """, (now, challenge_id))
        db.commit()
        return int(row[0])
    except VerificationError:
        raise
    except DB_ERRORS:
        db.rollback()
        raise
    finally:
        db.close()
