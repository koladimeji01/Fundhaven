from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app import database
from app.api.dependencies import get_current_user


# ==========================================
# ROUTER
# ==========================================

router = APIRouter(
    tags=["Budgets"]
)


# ==========================================
# SCHEMAS
# ==========================================

class BudgetCreate(BaseModel):

    category: str = Field(
        min_length=2,
        max_length=50
    )

    amount: float = Field(
        gt=0,
        allow_inf_nan=False
    )


# ==========================================
# CREATE BUDGET
# ==========================================

@router.post(
    "/budgets",
    summary="Create a budget"
)
def create_budget(
    budget: BudgetCreate,
    current_user=Depends(
        get_current_user
    )
):

    user_id = current_user[0]

    try:
        budget_id = database.add_budget(
            user_id=user_id,
            category=budget.category,
            amount=budget.amount
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return {
        "id": budget_id,
        "user_id": user_id,
        "category": budget.category,
        "amount": budget.amount
    }


# ==========================================
# GET BUDGETS
# ==========================================

@router.get(
    "/budgets",
    summary="Get my budgets"
)
def get_budgets(
    current_user=Depends(
        get_current_user
    )
):

    user_id = current_user[0]

    budgets = database.get_budgets(
        user_id
    )

    return {
        "user_id": user_id,
        "budgets": [
            {
                "id": budget[0],
                "user_id": budget[1],
                "category": budget[2],
                "amount": budget[3]
            }
            for budget in budgets
        ]
    }


# ==========================================
# UPDATE BUDGET
# ==========================================

@router.put(
    "/budgets/{budget_id}",
    summary="Update a budget"
)
def update_budget(
    budget_id: int,
    budget: BudgetCreate,
    current_user=Depends(
        get_current_user
    )
):

    user_id = current_user[0]

    try:
        updated = database.update_budget(
            user_id=user_id,
            budget_id=budget_id,
            category=budget.category,
            amount=budget.amount
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    if not updated:

        raise HTTPException(
            status_code=404,
            detail="Budget not found"
        )

    budgets = database.get_budgets(
        user_id
    )

    for item in budgets:

        if item[0] == budget_id:

            return {
                "id": item[0],
                "user_id": item[1],
                "category": item[2],
                "amount": item[3]
            }

    raise HTTPException(
        status_code=404,
        detail="Budget not found"
    )


# ==========================================
# DELETE BUDGET
# ==========================================

@router.delete(
    "/budgets/{budget_id}",
    summary="Delete a budget"
)
def delete_budget(
    budget_id: int,
    current_user=Depends(
        get_current_user
    )
):

    user_id = current_user[0]

    deleted = database.delete_budget(
        user_id=user_id,
        budget_id=budget_id
    )

    if not deleted:

        raise HTTPException(
            status_code=404,
            detail="Budget not found"
        )

    return {
        "message":
        "Budget deleted successfully"
    }