"""Authenticated Finova spending insights API for BudgetWise.

Local summaries never call an external AI provider.
The paid AI provider is called only by an explicit consented POST.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.ai_insights import (
    AIServiceError,
    AIRateLimitError,
    ai_provider_configured,
    build_spending_summary,
    generate_ai_advice,
    local_insights,
)
from app.api.dependencies import get_current_user
from app.monthly import resolve_month


router = APIRouter(prefix="/ai", tags=["Finova AI Financial Insights"])


class AIInsightsRequest(BaseModel):
    month: str | None = None
    share_aggregates_with_ai: bool = False


def _month_or_422(month):
    try:
        return resolve_month(month)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/status", summary="Check Finova setup (authenticated)")
def get_finova_status(current_user=Depends(get_current_user)):
    """Check key presence only; do not expose tokens or contact OpenAI."""
    return {
        "assistant": "Finova",
        "generative_configured": ai_provider_configured(),
        "requires_explicit_consent": True,
    }


@router.get("/insights", summary="View local Finova spending insights")
def get_local_insights(
    month: str | None = Query(default=None),
    current_user=Depends(get_current_user),
):
    """No external data transfer. Uses only this user's monthly records."""
    summary = build_spending_summary(current_user[0], _month_or_422(month))
    return {
        "assistant": "Finova",
        "month": summary["month"],
        "source": "local_rules",
        "summary": summary,
        "insights": local_insights(summary),
        "disclaimer": "Educational spending observations, not professional financial advice.",
    }


@router.post("/insights", summary="Generate Finova AI advice with consent")
def post_ai_insights(
    request: AIInsightsRequest,
    current_user=Depends(get_current_user),
):
    """Never disclose individual transactions, names, emails, or account data."""
    if request.share_aggregates_with_ai is not True:
        raise HTTPException(
            status_code=422,
            detail="Explicit consent is required to send monthly totals to the AI provider.",
        )
    summary = build_spending_summary(
        current_user[0], _month_or_422(request.month)
    )

    try:
        advice = generate_ai_advice(summary, current_user[0])
    except AIRateLimitError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except AIServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        "assistant": "Finova",
        "month": summary["month"],
        "source": "ai_model",
        "summary": summary,
        "advice": advice,
        "disclaimer": (
            "AI can make mistakes. Double-check suggestions before "
            "making important financial decisions."
        ),
    }
