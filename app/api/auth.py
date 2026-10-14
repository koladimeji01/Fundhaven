from app.db_backend import INTEGRITY_ERRORS

from fastapi import APIRouter, HTTPException

from app import database
from app.email import send_welcome_email

from app.auth import (
    hash_password,
    verify_password,
    create_access_token
)

from app.logging_config import logger

from app.api.schemas import (
    User,
    LoginRequest,
    UserCreatedResponse
)


router = APIRouter(
    tags=["Authentication"]
)


@router.post(
    "/users",
    response_model=UserCreatedResponse,
    summary="Create a new user"
)
def create_user(user: User):

    existing_user = database.get_user_by_name(
        user.name
    )

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Username already exists"
        )

    existing_email = database.get_user_by_email(
        user.email
    )

    if existing_email:
        raise HTTPException(
            status_code=400,
            detail="Email already exists"
        )

    hashed_password = hash_password(
        user.password
    )

    try:

        user_id = database.create_user(
            name=user.name,
            income=user.income,
            password=hashed_password,
            email=str(user.email)
        )

    except INTEGRITY_ERRORS:

        raise HTTPException(
            status_code=400,
            detail="Username or email already exists"
        )

    logger.info(
        f"New user created: {user.name}"
    )

    # Prepare welcome email
    send_welcome_email(
        recipient=str(user.email),
        name=user.name
    )

    return {
        "id": user_id,
        "name": user.name,
        "income": user.income,
        "email": user.email
    }


@router.post(
    "/login",
    summary="Login to BudgetWise"
)
def login(login_data: LoginRequest):

    # Login using email when email is provided.
    if login_data.email is not None:

        user = database.get_user_by_email(
            str(login_data.email)
        )

        login_identifier = str(
            login_data.email
        )

    # Otherwise login using username.
    elif login_data.name is not None:

        user = database.get_user_by_name(
            login_data.name
        )

        login_identifier = login_data.name

    else:

        raise HTTPException(
            status_code=422,
            detail="Either name or email is required"
        )

    if user is None:

        logger.warning(
            f"Login failed: user not found - "
            f"{login_identifier}"
        )

        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )

    stored_password = user[3]

    password_is_correct = verify_password(
        login_data.password,
        stored_password
    )

    if not password_is_correct:

        logger.warning(
            f"Login failed: incorrect password - "
            f"{login_identifier}"
        )

        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )

    # Successful password authentication issues a short-lived JWT directly.
    # No email provider, OTP challenge, or testing-only bypass is required.
    return {
        "message": "Login successful",
        "access_token": create_access_token(user[0]),
        "token_type": "bearer"
    }
