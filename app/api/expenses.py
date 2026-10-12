from fastapi import APIRouter, Depends, HTTPException, Query
from app.monthly import resolve_month

from app import services
from app.api.dependencies import get_current_user
from app.api.schemas import (
    ExpenseCreate,
    ExpenseResponse,
    ExpenseListResponse
)
from app.logging_config import logger


router = APIRouter(
    tags=["Expenses"]
)


# ============================================================
# GET EXPENSES
# ============================================================

@router.get(
    "/expenses",
    response_model=ExpenseListResponse,
    summary="Get my expenses"
)
def get_expenses(
    current_user=Depends(get_current_user),
    month: str | None = Query(default=None)
):
    user_id = current_user[0]

    if month is None:
        expenses = services.get_user_expenses(user_id)
    else:
        from app import database
        try:
            selected = resolve_month(month)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        expenses = [
            {
                "id": item[0], "amount": item[1],
                "category": item[2], "description": item[3],
                "date": item[4]
            }
            for item in database.get_month_expenses(user_id, selected)
        ]

    return {
        "user_id": user_id,
        "expenses": expenses
    }


# ============================================================
# CREATE EXPENSE
# ============================================================

@router.post(
    "/expenses",
    response_model=ExpenseResponse,
    summary="Create an expense"
)
def create_expense(
    expense: ExpenseCreate,
    current_user=Depends(get_current_user)
):
    user_id = current_user[0]

    new_expense = services.create_user_expense(
        user_id,
        expense.amount,
        expense.category,
        expense.description,
        expense.date
    )

    logger.info(
        f"Expense created for user {user_id}: "
        f"{expense.amount}"
    )

    return new_expense


# ============================================================
# UPDATE EXPENSE
# ============================================================

@router.put(
    "/expenses/{expense_id}",
    response_model=ExpenseResponse,
    summary="Update an expense"
)
def update_expense(
    expense_id: int,
    expense: ExpenseCreate,
    current_user=Depends(get_current_user)
):
    user_id = current_user[0]

    updated_expense = services.update_user_expense(
        user_id,
        expense_id,
        expense.amount,
        expense.category,
        expense.description,
        expense.date
    )

    if not updated_expense:
        raise HTTPException(
            status_code=404,
            detail="Expense not found"
        )

    logger.info(
        f"Expense {expense_id} updated "
        f"for user {user_id}"
    )

    return updated_expense


# ============================================================
# DELETE EXPENSE
# ============================================================

@router.delete(
    "/expenses/{expense_id}"
)
def delete_expense(
    expense_id: int,
    current_user=Depends(get_current_user)
):
    user_id = current_user[0]

    deleted = services.delete_user_expense(
        user_id,
        expense_id
    )

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="Expense not found"
        )

    logger.info(
        f"Expense {expense_id} deleted "
        f"for user {user_id}"
    )

    return {
        "message": "Expense deleted successfully"
    }