from contextlib import asynccontextmanager

import sqlite3

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app import database

from app.migrations.manager import run_migrations

from fastapi.middleware.cors import CORSMiddleware

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

    run_migrations()

    logger.info(
        "BudgetWise database initialized"
    )

    logger.info(
        "BudgetWise application started"
    )

    yield

    logger.info(
        "BudgetWise application stopped"
    )

# ==========================================
# CREATE FASTAPI APPLICATION
# ==========================================

app = FastAPI(

    title=f"{APP_NAME} API",

    description="""
# BudgetWise API

BudgetWise is a personal finance management API.

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

Use the `/api/v1/login` endpoint to obtain a token.

Then click **Authorize** in Swagger and enter:

`Bearer YOUR_ACCESS_TOKEN`
""",

    version=APP_VERSION,

    contact={
        "name": "BudgetWise"
    },

    lifespan=lifespan
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


# Register the same safe error response for psycopg if installed.
try:
    import psycopg
    app.add_exception_handler(psycopg.Error, database_exception_handler)
except ImportError:
    pass


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
# SYSTEM ROUTES
# ==========================================

@app.get(
    "/",
    tags=["System"],
    summary="Welcome to BudgetWise"
)
def home():

    return {
        "message":
        "Welcome to BudgetWise API"
    }


@app.get(
    "/health",
    tags=["System"],
    summary="Check API health"
)
def health_check():

    return {
        "status": "healthy"
    }


# ==========================================
# REGISTER API V1
# ==========================================

app.include_router(
    v1_router
)