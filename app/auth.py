from datetime import datetime, timedelta, timezone
import hashlib
import hmac

import jwt

from pwdlib import PasswordHash

from app.config import (
    SECRET_KEY,
    ALGORITHM
)


# ==========================================
# PASSWORD HASHING
# ==========================================

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    """
    Hash a plain-text password.
    """

    return password_hash.hash(
        password
    )


def verify_password(
    password: str,
    hashed_password: str
) -> bool:
    """
    Verify a plain-text password
    against its hashed version.
    """

    try:

        return password_hash.verify(
            password,
            hashed_password
        )

    except Exception:

        return False


# ==========================================
# CREATE ACCESS TOKEN
# ==========================================

def create_access_token(user_id: int, current_hash: str | None = None) -> str:
    """
    Create a JWT access token for a user.
    """

    expiration_time = (
        datetime.now(timezone.utc)
        + timedelta(hours=24)
    )

    if current_hash is None:
        from app import database
        user = database.get_user(user_id)
        if not user:
            raise ValueError("Cannot issue token for an unknown account")
        current_hash = user[3]

    payload = {
        "user_id": user_id,
        "pv": password_fingerprint(current_hash),
        "exp": expiration_time
    }

    token = jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    return token


# ==========================================
# DECODE ACCESS TOKEN
# ==========================================

def decode_access_token(
    token: str
):
    """
    Decode and validate a JWT access token.

    Returns:
        Payload dictionary if valid.
        None if invalid or expired.
    """

    try:

        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        return payload

    except jwt.ExpiredSignatureError:

        return None

    except jwt.InvalidTokenError:

        return None

    except Exception:

        return None

def password_fingerprint(stored_hash: str) -> str:
    """Bind issued sessions to the CURRENT stored password without revealing it."""
    if not SECRET_KEY or len(SECRET_KEY) < 16:
        raise RuntimeError("SECRET_KEY is missing or too short")
    return hmac.new(
        SECRET_KEY.encode("utf-8"),
        stored_hash.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def token_matches_password(payload: dict, stored_hash: str) -> bool:
    """Password changes automatically invalidate previously issued JWTs."""
    claim = payload.get("pv")
    return isinstance(claim, str) and hmac.compare_digest(
        claim, password_fingerprint(stored_hash)
    )
