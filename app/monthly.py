"""Shared month validation and calendar boundaries for BudgetWise.

All dates are local calendar dates (YYYY-MM-DD). Month filtering uses
[start_of_month, start_of_next_month) to avoid boundary errors.
"""
from datetime import date
import re

MONTH_PATTERN = re.compile(r"^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$")


def resolve_month(month: str | None = None) -> str:
    """Resolve optional YYYY-MM or reject malformed months."""
    if month is None:
        return date.today().strftime("%Y-%m")
    if not isinstance(month, str) or not MONTH_PATTERN.fullmatch(month):
        raise ValueError("month must use YYYY-MM (for example 2026-10)")
    return month


def month_bounds(month: str | None = None) -> tuple[str, str]:
    """Return ISO start-of-month and exclusive next-month date strings."""
    selected = resolve_month(month)
    year, number = map(int, selected.split("-"))
    if number == 12:
        next_year, next_month = year + 1, 1
    else:
        next_year, next_month = year, number + 1
    return f"{selected}-01", f"{next_year:04d}-{next_month:02d}-01"
