import os
from pathlib import Path

from dotenv import load_dotenv


# Project root
BASE_DIR = Path(__file__).resolve().parent.parent


# Read the environment
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")


# Load the correct environment file
if ENVIRONMENT == "testing":
    env_file = BASE_DIR / ".env.test"
else:
    env_file = BASE_DIR / ".env"


load_dotenv(env_file)


# Application settings
APP_NAME = os.getenv("APP_NAME", "BudgetWise")
APP_VERSION = os.getenv("APP_VERSION", "1.0.0")


# Database
DATABASE_NAME = os.getenv(
    "DATABASE_NAME",
    "budgetwise.db"
)


# Authentication
SECRET_KEY = os.getenv("SECRET_KEY")

ALGORITHM = os.getenv(
    "ALGORITHM",
    "HS256"
)


# Helpful startup information
print(f"BudgetWise environment: {ENVIRONMENT}")