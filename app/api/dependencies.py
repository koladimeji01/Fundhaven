from fastapi import Depends, HTTPException

from fastapi.security import (
    HTTPBearer,
    HTTPAuthorizationCredentials
)

from app import database

from app.auth import decode_access_token, token_matches_password


# ==========================================
# AUTHENTICATION
# ==========================================

security = HTTPBearer()


# ==========================================
# GET CURRENT USER
# ==========================================

def get_current_user(
    credentials: HTTPAuthorizationCredentials =
    Depends(security)
):

    token = credentials.credentials

    payload = decode_access_token(
        token
    )

    if not payload:

        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token"
        )

    user_id = payload.get(
        "user_id"
    )

    if not user_id:

        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )

    user = database.get_user(
        user_id
    )

    if not user:

        raise HTTPException(
            status_code=401,
            detail="User not found"
        )

    if not token_matches_password(payload, user[3]):
        raise HTTPException(status_code=401, detail="Session expired. Sign in again.")

    return user
