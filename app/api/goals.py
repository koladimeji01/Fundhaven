from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app import database
from app.api.dependencies import get_current_user


# ============================================================
# ROUTER
# ============================================================

router = APIRouter(
    prefix="/goals",
    tags=["Goals"]
)


# ============================================================
# SCHEMAS
# ============================================================

class GoalCreate(BaseModel):

    name: str = Field(
        ...,
        min_length=2,
        max_length=100
    )

    target_amount: float = Field(
        ...,
        gt=0,
        allow_inf_nan=False
    )

    current_amount: float = Field(
        default=0,
        ge=0,
        allow_inf_nan=False
    )

    target_date: Optional[date] = None


class GoalUpdate(BaseModel):

    name: Optional[str] = Field(
        default=None,
        min_length=2,
        max_length=100
    )

    target_amount: Optional[float] = Field(
        default=None,
        gt=0,
        allow_inf_nan=False
    )

    current_amount: Optional[float] = Field(
        default=None,
        ge=0,
        allow_inf_nan=False
    )

    target_date: Optional[date] = None


# ============================================================
# HELPER
# ============================================================

def calculate_goal_data(goal):
    """
    Add progress and completed status to a goal.
    """

    target_amount = float(
        goal["target_amount"]
    )

    current_amount = float(
        goal["current_amount"]
    )

    if target_amount <= 0:
        progress = 0
    else:
        progress = round(
            (current_amount / target_amount) * 100
        )

    progress = min(
        progress,
        100
    )

    goal["progress"] = progress

    goal["completed"] = (
        current_amount >= target_amount
    )

    return goal


# ============================================================
# CREATE GOAL
# ============================================================

@router.post(
    "",
    status_code=status.HTTP_200_OK
)
def create_goal(
    goal: GoalCreate,
    current_user=Depends(get_current_user)
):

    user_id = current_user[0]

    # ----------------------------------------
    # Validate current amount
    # ----------------------------------------

    if goal.current_amount > goal.target_amount:

        raise HTTPException(
            status_code=400,
            detail="Current amount cannot exceed target amount"
        )

    try:

        goal_id = database.create_goal(
            user_id=user_id,
            name=goal.name,
            target_amount=goal.target_amount,
            current_amount=goal.current_amount,
            target_date=(
                goal.target_date.isoformat()
                if goal.target_date
                else None
            )
        )

        # ------------------------------------
        # Get the newly created goal
        # ------------------------------------

        created_goal = database.get_goal(
            user_id,
            goal_id
        )

        if not created_goal:

            raise HTTPException(
                status_code=500,
                detail="Failed to retrieve created goal"
            )

        return calculate_goal_data(
            created_goal
        )

    except HTTPException:
        raise

    except Exception:

        raise HTTPException(
            status_code=500,
            detail="Failed to create goal"
        )


# ============================================================
# GET ALL GOALS
# ============================================================

@router.get("")
def get_goals(
    current_user=Depends(get_current_user)
):

    user_id = current_user[0]

    try:

        goals = database.get_goals(
            user_id
        )

        goals = [
            calculate_goal_data(goal)
            for goal in goals
        ]

        return {
            "goals": goals
        }

    except Exception:

        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve goals"
        )


# ============================================================
# GET SINGLE GOAL
# ============================================================

@router.get("/{goal_id}")
def get_goal(
    goal_id: int,
    current_user=Depends(get_current_user)
):

    user_id = current_user[0]

    goal = database.get_goal(
        user_id,
        goal_id
    )

    if not goal:

        raise HTTPException(
            status_code=404,
            detail="Goal not found"
        )

    return calculate_goal_data(
        goal
    )


# ============================================================
# UPDATE GOAL
# ============================================================

@router.put("/{goal_id}")
def update_goal(
    goal_id: int,
    goal: GoalUpdate,
    current_user=Depends(get_current_user)
):

    user_id = current_user[0]

    # ----------------------------------------
    # Find existing goal
    # ----------------------------------------

    existing_goal = database.get_goal(
        user_id,
        goal_id
    )

    if not existing_goal:

        raise HTTPException(
            status_code=404,
            detail="Goal not found"
        )

    # ----------------------------------------
    # Preserve existing values when omitted
    # ----------------------------------------

    name = (
        goal.name
        if goal.name is not None
        else existing_goal["name"]
    )

    target_amount = (
        goal.target_amount
        if goal.target_amount is not None
        else existing_goal["target_amount"]
    )

    current_amount = (
        goal.current_amount
        if goal.current_amount is not None
        else existing_goal["current_amount"]
    )

    target_date = (
        goal.target_date.isoformat() if goal.target_date is not None else None
    ) if "target_date" in goal.model_fields_set else existing_goal.get("target_date")

    # ----------------------------------------
    # Validate amounts
    # ----------------------------------------

    if current_amount > target_amount:

        raise HTTPException(
            status_code=400,
            detail="Current amount cannot exceed target amount"
        )

    try:

        database.update_goal(
            user_id=user_id,
            goal_id=goal_id,
            name=name,
            target_amount=target_amount,
            current_amount=current_amount,
            target_date=target_date
        )

        # ------------------------------------
        # Return updated goal
        # ------------------------------------

        updated_goal = database.get_goal(
            user_id,
            goal_id
        )

        if not updated_goal:

            raise HTTPException(
                status_code=404,
                detail="Goal not found"
            )

        return calculate_goal_data(
            updated_goal
        )

    except HTTPException:
        raise

    except Exception:

        raise HTTPException(
            status_code=500,
            detail="Failed to update goal"
        )


# ============================================================
# DELETE GOAL
# ============================================================

@router.delete("/{goal_id}")
def delete_goal(
    goal_id: int,
    current_user=Depends(get_current_user)
):

    user_id = current_user[0]

    existing_goal = database.get_goal(
        user_id,
        goal_id
    )

    if not existing_goal:

        raise HTTPException(
            status_code=404,
            detail="Goal not found"
        )

    try:

        deleted = database.delete_goal(
            user_id,
            goal_id
        )

        if not deleted:

            raise HTTPException(
                status_code=404,
                detail="Goal not found"
            )

        return {
            "message": "Goal deleted successfully"
        }

    except HTTPException:
        raise

    except Exception:

        raise HTTPException(
            status_code=500,
            detail="Failed to delete goal"
        )