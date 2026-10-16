from contextlib import asynccontextmanager

import os
import sqlite3
from urllib.parse import urlsplit

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app import database
from app.db_backend import using_postgres

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

    # Free cloud hosts have ephemeral filesystems: never create a private
    # SQLite database that disappears on restart, or split user accounts
    # between independent instances.
    if os.getenv("ENVIRONMENT", "development").lower() == "production":
        if not using_postgres():
            raise RuntimeError(
                "Production deployment requires DATABASE_URL for PostgreSQL. "
                "SQLite is supported only for local development and testing."
            )

    run_migrations()

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

Use the `/api/v1/login` endpoint to obtain a token.

Then click **Authorize** in Swagger and enter:

`Bearer YOUR_ACCESS_TOKEN`
""",

    version=APP_VERSION,

    contact={
        "name": "FundHaven"
    },

    lifespan=lifespan
)
def configured_cors_origins():
    """Allow our verified Vercel origins plus exact HTTPS origins from Render.

    Set BUDGETWISE_ALLOWED_ORIGINS for additional domains (e.g. custom
    domains); comma-separated values must be exact, never wildcards.
    """
    # Never allow localhost in production, and never use wildcard CORS.
    # These HTTPS origins belong to the connected FundHaven Vercel project.
    # The stable production aliases continue to work after future deployments.
    # Include the current deployment URL because users may open it directly.
    production_frontend_origins = [
        "https://fundhaven.vercel.app",
        "https://budgetwise-frontend-tan.vercel.app",
        "https://budgetwise-frontend-kehindeoladimeji455-2157s-projects.vercel.app",
        "https://budgetwise-frontend-c5ajigvrg.vercel.app",
    ]
    origins = (
        production_frontend_origins.copy()
        if os.getenv("ENVIRONMENT", "development").lower() == "production"
        else ["http://127.0.0.1:5500", "http://localhost:5500"]
    )
    raw = os.getenv("BUDGETWISE_ALLOWED_ORIGINS", "")
    for item in raw.split(","):
        candidate = item.strip().rstrip("/")
        if not candidate:
            continue
        parsed = urlsplit(candidate)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.path
            or parsed.query
            or parsed.fragment
            or "*" in candidate
        ):
            raise ValueError(
                "BUDGETWISE_ALLOWED_ORIGINS must contain complete, exact "
                "HTTPS origins, separated by commas (no paths or wildcards)"
            )
        if candidate not in origins:
            origins.append(candidate)
    return origins


app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_cors_origins(),
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
    summary="Welcome to FundHaven"
)
def home():

    return {
        "message":
        "Welcome to FundHaven API"
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