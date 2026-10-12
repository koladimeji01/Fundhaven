from fastapi import APIRouter, Depends

from app import services
from app.api.dependencies import get_current_user
from app.api.schemas import Dashboard2Response
from app.logging_config import logger


router = APIRouter(
    tags=["Dashboard"]
)


@router.get(
    "/dashboard",
    response_model=Dashboard2Response,
    summary="Get BudgetWise Dashboard 2.0"
)
def get_dashboard(
    current_user=Depends(get_current_user)
):
    user_id = current_user[0]

    dashboard = services.get_budget_dashboard(
        user_id
    )

    logger.info(
        f"Dashboard 2.0 requested for user {user_id}"
    )

    return dashboard