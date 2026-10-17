from contextlib import asynccontextmanager

import os
import sqlite3
from urllib.parse import urlsplit

from fastapi import FastAPI, Response
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

    if os.getenv("ENVIRONMENT", "development").lower() == "production":
        from app.config import SECRET_KEY
        if not SECRET_KEY or len(SECRET_KEY) < 32:
            raise RuntimeError("Production requires a SECRET_KEY of at least 32 characters")

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
    """Allow verified production sites and explicitly configured HTTPS origins.

    FUNDHAVEN_ALLOWED_ORIGINS is the preferred Render setting. The legacy
    BUDGETWISE_ALLOWED_ORIGINS remains supported during migration; both are
    validated and combined without wildcards.
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
    # Accept the renamed key without removing the already deployed setting.
    # The extra origins are additive so existing users remain able to log in.
    for key in ("FUNDHAVEN_ALLOWED_ORIGINS", "BUDGETWISE_ALLOWED_ORIGINS"):
        for item in os.getenv(key, "").split(","):
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
                    f"{key} must contain complete, exact HTTPS origins, "
                    "separated by commas (no paths or wildcards)"
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
# PREVENT FINANCIAL RESPONSES BEING CACHED
# ==========================================

@app.middleware("http")
async def prevent_sensitive_api_caching(request, call_next):
    """Protect authenticated financial and login responses in every environment.

    Applies to successful replies and normal API error responses. No-store
    prevents browsers or shared proxies from retaining customer financial
    records, login tokens, and user information.
    """
    response = await call_next(request)
    path = request.url.path
    if path == "/api/v1" or path.startswith("/api/v1/"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
        response.headers["X-Content-Type-Options"] = "nosniff"
    return response


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


@app.get("/ready", tags=["System"], summary="Verify database readiness")
def readiness_check():
    """Test database connectivity without returning secrets or customer data."""
    connection = None
    try:
        connection = database.create_connection()
        row = connection.execute("SELECT 1").fetchone()
        if not row or row[0] != 1:
            raise RuntimeError("Database readiness check failed")
    except Exception:
        logger.warning("FundHaven database is not ready")
        return JSONResponse(
            status_code=503, content={"status": "unavailable"},
            headers={"Cache-Control": "no-store"},
        )
    finally:
        if connection is not None:
            try:
                connection.close()
            except Exception:
                logger.warning("Readiness probe connection close failed")
    return JSONResponse(
        status_code=200, content={"status": "ready"},
        headers={"Cache-Control": "no-store"},
    )


@app.head("/health", include_in_schema=False)
def health_check_head():
    """Allow free uptime monitors that use HEAD requests by default.

    HEAD confirms availability without returning the JSON body. Keep GET
    unchanged for browsers, API clients, and more thorough health checks.
    """
    return Response(status_code=200)


# ==========================================
# REGISTER API V1
# ==========================================

app.include_router(
    v1_router
)