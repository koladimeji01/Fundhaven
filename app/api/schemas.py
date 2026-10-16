from datetime import date as DateType

from pydantic import BaseModel, EmailStr, Field


# ============================================================
# USER / AUTHENTICATION
# ============================================================

class User(BaseModel):
    name: str = Field(
        min_length=2,
        max_length=50
    )

    email: EmailStr

    income: float = Field(
        gt=0,
        allow_inf_nan=False
    )

    password: str = Field(
        min_length=8,
        max_length=100
    )


class LoginRequest(BaseModel):
    name: str | None = Field(
        default=None,
        min_length=2,
        max_length=50
    )

    email: EmailStr | None = None

    password: str = Field(
        min_length=8,
        max_length=100
    )


class UserCreatedResponse(BaseModel):
    id: int
    name: str
    income: float
    email: EmailStr


class UserResponse(BaseModel):
    id: int
    name: str
    income: float
    email: EmailStr
    expenses: list = []
    total_expenses: float = 0
    balance: float = 0


# ============================================================
# EXPENSES / TRANSACTIONS
# ============================================================

class ExpenseCreate(BaseModel):
    amount: float = Field(
        gt=0,
        description="Expense amount must be greater than zero"
    )

    category: str = Field(
        min_length=2,
        max_length=50
    )

    description: str = Field(
        min_length=2,
        max_length=200
    )

    # Optional from the user's point of view.
    # If no date is supplied, today's date is used.
    date: DateType = Field(
        default_factory=DateType.today
    )


class ExpenseResponse(BaseModel):
    id: int
    user_id: int | None = None
    amount: float
    category: str
    description: str
    date: DateType


class ExpenseListResponse(BaseModel):
    user_id: int
    expenses: list[ExpenseResponse]


# ============================================================
# BUDGETS
# ============================================================

class BudgetCreate(BaseModel):
    category: str = Field(
        min_length=2,
        max_length=50
    )

    amount: float = Field(
        gt=0,
        allow_inf_nan=False
    )


class BudgetUpdate(BaseModel):
    category: str = Field(
        min_length=2,
        max_length=50
    )

    amount: float = Field(
        gt=0,
        allow_inf_nan=False
    )


class BudgetResponse(BaseModel):
    id: int
    user_id: int
    category: str
    amount: float


class BudgetListResponse(BaseModel):
    user_id: int
    budgets: list[BudgetResponse]


# ============================================================
# MAIN DASHBOARD
# ============================================================

class DashboardResponse(BaseModel):
    month: str | None = None
    income_recorded: bool = True
    income: float
    total_expenses: float
    balance: float
    savings_rate: float
    spending_by_category: dict
    highest_spending_category: dict
    warning: str

# ============================================================
# BUDGET DASHBOARD
# ============================================================

class BudgetDashboardItem(BaseModel):
    category: str
    budget: float
    spent: float
    remaining: float
    usage_percentage: float
    status: str


class Dashboard2Response(BaseModel):
    month: str | None = None
    income_recorded: bool = True
    user_id: int
    income: float
    total_expenses: float
    balance: float
    total_budget: float
    total_budget_spent: float
    total_budget_remaining: float
    budgets: list[BudgetDashboardItem]