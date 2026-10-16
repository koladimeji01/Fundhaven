from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import (
    HTTPBearer,
    HTTPAuthorizationCredentials
)
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import sqlite3

from app import database
from app import services

from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token
)

from app.config import (
    APP_NAME,
    APP_VERSION
)

from app.logging_config import logger

from app.api.v1 import router as v1_router

# ==========================================
# APPLICATION LIFESPAN
# ==========================================

@asynccontextmanager
async def lifespan(app):

    # Create database tables when the application starts
    database.create_tables()

    logger.info(
        "FundHaven database initialized"
    )

    logger.info(
        "FundHaven application started"
    )

    yield

    logger.info(
        "FundHaven application stopped"
    )

# ==========================================
# CREATE FASTAPI APPLICATION
# ==========================================

app = FastAPI(
    title=f"{APP_NAME} API",
    lifespan=lifespan,
    description="""
# FundHaven API

FundHaven is a personal finance management API.

It allows users to:

- Create an account
- Login securely
- Track expenses
- Update expenses
- Delete expenses
- View financial summaries
- Monitor spending by category
- Calculate savings rate

## Authentication

Protected endpoints require a JWT access token.

Use the `/login` endpoint to obtain a token.

Then click **Authorize** in Swagger and enter:

`Bearer YOUR_ACCESS_TOKEN`
""",
    version=APP_VERSION,
    contact={
        "name": "FundHaven"
    }
)


app.include_router(
    v1_router
)

# ==========================================
# AUTHENTICATION
# ==========================================

security = HTTPBearer()


# ==========================================
# DATABASE ERROR HANDLER
# ==========================================

@app.exception_handler(sqlite3.Error)
async def database_exception_handler(
    request,
    exc
):

    logger.error(
        f"Database error: {exc}"
    )

    return JSONResponse(
        status_code=500,
        content={
            "detail":
            "A database error occurred. "
            "Please try again later."
        }
    )


# ==========================================
# GENERAL ERROR HANDLER
# ==========================================

@app.exception_handler(Exception)
async def general_exception_handler(
    request,
    exc
):

    logger.exception(
        f"Unexpected application error: {exc}"
    )

    return JSONResponse(
        status_code=500,
        content={
            "detail":
            "An unexpected error occurred. "
            "Please try again later."
        }
    )


# ==========================================
# EXPENSE REQUEST MODEL
# ==========================================

class ExpenseCreate(BaseModel):

    amount: float = Field(
        gt=0,
        description="Expense amount in Nigerian Naira."
    )

    category: str = Field(
        min_length=2,
        max_length=50,
        description="Expense category such as Food, Transport or Rent."
    )

    description: str = Field(
        min_length=2,
        max_length=200,
        description="Short description of the expense."
    )


# ==========================================
# USER REQUEST MODEL
# ==========================================

class User(BaseModel):

    name: str = Field(
        min_length=2,
        max_length=50,
        description="Username for the FundHaven account."
    )

    income: float = Field(
        gt=0,
        description="Monthly income in Nigerian Naira."
    )

    password: str = Field(
        min_length=8,
        max_length=100,
        description="Account password. Minimum 8 characters."
    )


# ==========================================
# LOGIN REQUEST MODEL
# ==========================================

class LoginRequest(BaseModel):

    name: str = Field(
        min_length=2,
        max_length=50,
        description="FundHaven username."
    )

    password: str = Field(
        min_length=8,
        max_length=100,
        description="Account password."
    )


# ==========================================
# EXPENSE RESPONSE
# ==========================================

class ExpenseResponse(BaseModel):

    id: int
    amount: float
    category: str
    description: str


# ==========================================
# EXPENSE LIST RESPONSE
# ==========================================

class ExpenseListResponse(BaseModel):

    user_id: int
    expenses: list[ExpenseResponse]


# ==========================================
# USER CREATED RESPONSE
# ==========================================

class UserCreatedResponse(BaseModel):

    id: int
    name: str
    income: float


# ==========================================
# USER PROFILE RESPONSE
# ==========================================

class UserResponse(BaseModel):

    id: int
    name: str
    income: float
    total_expenses: float
    balance: float
    expenses: list[ExpenseResponse]


# ==========================================
# HIGHEST SPENDING CATEGORY
# ==========================================

class HighestSpendingCategory(BaseModel):

    category: str | None
    amount: float


# ==========================================
# DASHBOARD RESPONSE
# ==========================================

class DashboardResponse(BaseModel):

    user: UserCreatedResponse
    income: float
    total_expenses: float
    balance: float
    savings_rate: float
    spending_by_category: dict[str, float]
    highest_spending_category: HighestSpendingCategory
    warning: str


# ==========================================
# GET CURRENT USER
# ==========================================

def get_current_user(
    credentials: HTTPAuthorizationCredentials =
    Depends(security)
):

    token = credentials.credentials

    payload = decode_access_token(
        token
    )

    if not payload:

        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token"
        )

    user_id = payload.get(
        "user_id"
    )

    if not user_id:

        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )

    user = database.get_user(
        user_id
    )

    if not user:

        raise HTTPException(
            status_code=401,
            detail="User not found"
        )

    return user


# ==========================================
# HOME
# ==========================================

@app.get(
    "/",
    tags=["System"],
    summary="Welcome to FundHaven",
    description="Returns a simple welcome message from the FundHaven API."
)
def home():

    return {
        "message":
        "Welcome to FundHaven API"
    }


# ==========================================
# HEALTH CHECK
# ==========================================

@app.get(
    "/health",
    tags=["System"],
    summary="Check API health",
    description="Checks whether the FundHaven API is running."
)
def health_check():

    return {
        "status": "healthy"
    }


# ==========================================
# CREATE USER
# ==========================================

@app.post(
    "/users",
    response_model=UserCreatedResponse,
    tags=["Authentication"],
    summary="Create a new user",
    description="""
Creates a new FundHaven account.

The password is securely hashed before being stored.

A username must be unique.
""",
    responses={
        400: {
            "description": "Username already exists."
        },
        422: {
            "description": "Invalid user information."
        }
    }
)
def create_user(
    user: User
):

    existing_user = database.get_user_by_name(
        user.name
    )

    if existing_user:

        raise HTTPException(
            status_code=400,
            detail="Username already exists"
        )

    hashed_password = hash_password(
        user.password
    )

    user_id = database.create_user(
        user.name,
        user.income,
        hashed_password
    )

    logger.info(
        f"New user created: {user.name}"
    )

    return {
        "id": user_id,
        "name": user.name,
        "income": user.income
    }


# ==========================================
# LOGIN
# ==========================================

@app.post(
    "/login",
    tags=["Authentication"],
    summary="Login to FundHaven",
    description="""
Authenticates a FundHaven user.

If the username and password are correct,
the API returns a JWT access token.

Use this token to access protected endpoints.
""",
    responses={
        401: {
            "description": "Invalid username or password."
        },
        422: {
            "description": "Invalid login information."
        }
    }
)
def login(
    login_data: LoginRequest
):

    user = database.get_user_by_name(
        login_data.name
    )

    if not user:

        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )

    password_is_correct = verify_password(
        login_data.password,
        user[3]
    )

    if not password_is_correct:

        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )

    access_token = create_access_token(
        user[0]
    )

    logger.info(
        f"User logged in: {login_data.name}"
    )

    return {
        "message": "Login successful",
        "access_token": access_token,
        "token_type": "bearer"
    }


# ==========================================
# GET MY PROFILE
# ==========================================

@app.get(
    "/users/me",
    response_model=UserResponse,
    tags=["User"],
    summary="Get my profile",
    description="""
Returns the authenticated user's financial profile.

The response includes:

- User information
- Total expenses
- Remaining balance
- Expense history
""",
    responses={
        401: {
            "description": "Authentication required."
        },
        404: {
            "description": "User not found."
        }
    }
)
def get_my_profile(
    current_user=Depends(
        get_current_user
    )
):

    user_id = current_user[0]

    profile = services.get_user_profile(
        user_id
    )

    if not profile:

        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    return profile


# ==========================================
# GET MY EXPENSES
# ==========================================

@app.get(
    "/expenses",
    response_model=ExpenseListResponse,
    tags=["Expenses"],
    summary="Get my expenses",
    description="""
Returns all expenses belonging to the authenticated user.

Users can only access their own expenses.
""",
    responses={
        401: {
            "description": "Authentication required."
        }
    }
)
def get_expenses(
    current_user=Depends(
        get_current_user
    )
):

    user_id = current_user[0]

    expenses = services.get_user_expenses(
        user_id
    )

    return {
        "user_id": user_id,
        "expenses": expenses
    }


# ==========================================
# CREATE EXPENSE
# ==========================================

@app.post(
    "/expenses",
    response_model=ExpenseResponse,
    tags=["Expenses"],
    summary="Create an expense",
    description="""
Creates a new expense for the authenticated user.

The amount must be greater than zero.
""",
    responses={
        401: {
            "description": "Authentication required."
        },
        422: {
            "description": "Invalid expense information."
        }
    }
)
def create_expense(
    expense: ExpenseCreate,
    current_user=Depends(
        get_current_user
    )
):

    user_id = current_user[0]

    new_expense = services.create_user_expense(
        user_id,
        expense.amount,
        expense.category,
        expense.description
    )

    logger.info(
        f"Expense created for user {user_id}: "
        f"{expense.amount}"
    )

    return new_expense


# ==========================================
# UPDATE EXPENSE
# ==========================================

@app.put(
    "/expenses/{expense_id}",
    response_model=ExpenseResponse,
    tags=["Expenses"],
    summary="Update an expense",
    description="""
Updates an existing expense.

A user can only update their own expense.
""",
    responses={
        401: {
            "description": "Authentication required."
        },
        404: {
            "description": "Expense not found or does not belong to the user."
        },
        422: {
            "description": "Invalid expense information."
        }
    }
)
def update_expense(
    expense_id: int,
    expense: ExpenseCreate,
    current_user=Depends(
        get_current_user
    )
):

    user_id = current_user[0]

    updated_expense = services.update_user_expense(
        user_id,
        expense_id,
        expense.amount,
        expense.category,
        expense.description
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


# ==========================================
# DELETE EXPENSE
# ==========================================

@app.delete(
    "/expenses/{expense_id}",
    tags=["Expenses"],
    summary="Delete an expense",
    description="""
Deletes an expense belonging to the authenticated user.

Users cannot delete another user's expense.
""",
    responses={
        401: {
            "description": "Authentication required."
        },
        404: {
            "description": "Expense not found or does not belong to the user."
        }
    }
)
def delete_expense(
    expense_id: int,
    current_user=Depends(
        get_current_user
    )
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
        "message":
        "Expense deleted successfully"
    }


# ==========================================
# FINANCIAL DASHBOARD
# ==========================================

@app.get(
    "/users/me/dashboard",
    response_model=DashboardResponse,
    tags=["Dashboard"],
    summary="Get financial dashboard",
    description="""
Returns a complete financial summary for the authenticated user.

The dashboard includes:

- Monthly income
- Total expenses
- Current balance
- Savings rate
- Spending by category
- Highest spending category
- Spending warning
""",
    responses={
        401: {
            "description": "Authentication required."
        },
        404: {
            "description": "User not found."
        }
    }
)
def get_dashboard(
    current_user=Depends(
        get_current_user
    )
):

    user_id = current_user[0]

    dashboard = services.get_user_dashboard(
        user_id
    )

    if not dashboard:

        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    return dashboard