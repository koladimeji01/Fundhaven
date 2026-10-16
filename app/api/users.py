from fastapi import APIRouter, Depends, HTTPException, Query
import math
from typing import Literal
from pydantic import BaseModel, Field
from app.auth import verify_password
from app.monthly import resolve_month

from app import services
from app.api.dependencies import get_current_user
from app.api.schemas import DashboardResponse, UserResponse

router = APIRouter(tags=["User"])


# ============================================================
# GET MY PROFILE
# ============================================================

@router.get(
    "/users/me",
    response_model=UserResponse,
    summary="Get my profile",
)
def get_my_profile(
    current_user=Depends(get_current_user),
    include_expenses: bool = Query(default=True),
):
    user_id = current_user[0]

    profile = services.get_user_profile(
        user_id,
        include_expenses=include_expenses,
        authenticated_user=current_user,
    )

    if not profile:
        raise HTTPException(status_code=404, detail="User not found")

    return profile


# ============================================================
# UPDATE MY PROFILE
# ============================================================

@router.put(
    "/users/me",
    response_model=UserResponse,
    summary="Update my profile",
)
def update_my_profile(profile_data: dict, current_user=Depends(get_current_user)):
    user_id = current_user[0]

    name = profile_data.get("name")
    income = profile_data.get("income")

    if not isinstance(name, str):
        raise HTTPException(status_code=422, detail="Name must be a string")

    name = name.strip()

    if len(name) > 50:
        raise HTTPException(status_code=422, detail="Name must be at most 50 characters")

    if len(name) < 2:
        raise HTTPException(
            status_code=422,
            detail="Name must be at least 2 characters",
        )

    if income is None:
        raise HTTPException(status_code=422, detail="Income is required")

    try:
        income = float(income)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Income must be a number") from exc

    if not math.isfinite(income):
        raise HTTPException(status_code=422, detail="Income must be a finite number")

    if income <= 0:
        raise HTTPException(status_code=422, detail="Income must be greater than 0")

    try:
        updated = services.update_user_profile(
            user_id=user_id,
            name=name,
            income=income,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    if not updated:
        raise HTTPException(status_code=404, detail="User not found")

    return updated


# ============================================================
# CHANGE PASSWORD
# ============================================================

@router.put(
    "/users/me/password",
    summary="Change my password",
)
def change_my_password(password_data: dict, current_user=Depends(get_current_user)):
    user_id = current_user[0]

    current_password = password_data.get("current_password")
    new_password = password_data.get("new_password")
    confirm_password = password_data.get("confirm_password")

    if not isinstance(current_password, str):
        raise HTTPException(status_code=422, detail="Current password is required")

    if not isinstance(new_password, str):
        raise HTTPException(status_code=422, detail="New password is required")

    if not isinstance(confirm_password, str):
        raise HTTPException(status_code=422, detail="Password confirmation is required")

    if len(new_password) < 8:
        raise HTTPException(
            status_code=422,
            detail="New password must be at least 8 characters",
        )

    if len(new_password) > 100:
        raise HTTPException(
            status_code=422,
            detail="New password must not exceed 100 characters",
        )

    if new_password != confirm_password:
        raise HTTPException(status_code=422, detail="New passwords do not match")

    if current_password == new_password:
        raise HTTPException(
            status_code=422,
            detail="New password must be different from current password",
        )

    try:
        changed = services.change_user_password(
            user_id=user_id,
            current_password=current_password,
            new_password=new_password,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    if not changed:
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    return {"message": "Password changed. Sign in again on all devices."}


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1)
    confirmation: Literal["DELETE"]


@router.delete("/users/me", summary="Permanently delete my account")
def delete_my_account(
    request: DeleteAccountRequest, current_user=Depends(get_current_user)
):
    if not verify_password(request.password, current_user[3]):
        raise HTTPException(status_code=400, detail="Incorrect password")
    if not database.delete_user_account(current_user[0]):
        raise HTTPException(status_code=404, detail="Account not found")
    return {"message": "Account deleted"}


# ============================================================
# MONTHLY FINANCIAL EMAIL PREFERENCE (OPT IN)
# ============================================================

from app import database


class MonthlyReportPreference(BaseModel):
    monthly_reports_enabled: bool


@router.get("/users/me/monthly-email")
def get_monthly_email_preference(current_user=Depends(get_current_user)):
    conn = database.create_connection()
    try:
        row = conn.execute("""
            SELECT monthly_reports_enabled FROM users WHERE id = ?
        """, (current_user[0],)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="User not found")
        return {"monthly_reports_enabled": bool(row[0])}
    finally:
        conn.close()


@router.put("/users/me/monthly-email")
def set_monthly_email_preference(
    preference: MonthlyReportPreference,
    current_user=Depends(get_current_user)
):
    conn = database.create_connection()
    try:
        updated = conn.execute("""
            UPDATE users SET monthly_reports_enabled = ?
            WHERE id = ?
        """, (int(preference.monthly_reports_enabled), current_user[0]))
        conn.commit()
        if updated.rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")
        return {"monthly_reports_enabled": preference.monthly_reports_enabled}
    finally:
        conn.close()


# ============================================================
# GET MY DASHBOARD
# ============================================================

@router.get(
    "/users/me/dashboard",
    response_model=DashboardResponse,
    summary="Get my financial dashboard",
)
def get_my_dashboard(current_user=Depends(get_current_user), month: str | None = Query(default=None)):
    try:
        month = resolve_month(month)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    user_id = current_user[0]

    dashboard = services.get_user_dashboard(user_id, month)

    if not dashboard:
        raise HTTPException(status_code=404, detail="User not found")

    return dashboard
