from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.expenses import router as expenses_router
from app.api.dashboard import router as dashboard_router
from app.api.budgets import router as budgets_router
from app.api.goals import router as goals_router
from app.api.ai import router as ai_router


# ==========================================
# API V1 ROUTER
# ==========================================

router = APIRouter(
    prefix="/api/v1"
)


# ==========================================
# REGISTER ROUTERS
# ==========================================

router.include_router(
    auth_router
)

router.include_router(
    users_router
)

router.include_router(
    expenses_router
)

router.include_router(
    dashboard_router
)

router.include_router(
    budgets_router
)

router.include_router(
    goals_router
)


router.include_router(
    ai_router
)


# ==========================================
# API V1 HOME
# ==========================================

@router.get(
    "/",
    tags=["API v1"],
    summary="API v1 information"
)
def api_v1_home():

    return {
        "message":
        "Welcome to FundHaven API v1",

        "version":
        "1"
    }