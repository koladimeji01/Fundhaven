import os
from uuid import uuid4

os.environ["ENVIRONMENT"] = "testing"

import pytest
from fastapi.testclient import TestClient

from api import app
from app.config import DATABASE_NAME
from app.migrations.manager import run_migrations


@pytest.fixture(scope="function", autouse=True)
def setup_test_database():

    if os.path.exists(DATABASE_NAME):
        os.remove(DATABASE_NAME)

    run_migrations()

    yield

    if os.path.exists(DATABASE_NAME):
        os.remove(DATABASE_NAME)


@pytest.fixture
def client():
    return TestClient(app)


def create_and_login_user(client):

    unique_id = uuid4().hex[:8]

    user_data = {
        "name": f"dashboarduser_{unique_id}",
        "email": f"dashboarduser_{unique_id}@example.com",
        "income": 300000,
        "password": "password123"
    }

    # Actual BudgetWise registration endpoint
    register_response = client.post(
        "/api/v1/users",
        json=user_data
    )

    assert register_response.status_code in [200, 201]

    login_response = client.post(
        "/api/v1/login",
        json={
            "email": user_data["email"],
            "password": user_data["password"]
        }
    )

    assert login_response.status_code == 200

    token = login_response.json()["access_token"]

    return {
        "Authorization": f"Bearer {token}"
    }


def test_dashboard_requires_authentication(client):

    response = client.get("/api/v1/dashboard")

    assert response.status_code == 401


def test_dashboard_returns_financial_summary(client):

    headers = create_and_login_user(client)

    response = client.get(
        "/api/v1/dashboard",
        headers=headers
    )

    assert response.status_code == 200

    data = response.json()

    assert data["income"] == 300000
    assert data["total_expenses"] == 0
    assert data["balance"] == 300000

    assert data["total_budget"] == 0
    assert data["total_budget_spent"] == 0
    assert data["total_budget_remaining"] == 0

    assert data["budgets"] == []


def test_dashboard_calculates_budget_usage(client):

    headers = create_and_login_user(client)

    budget_response = client.post(
        "/api/v1/budgets",
        json={
            "category": "Food",
            "amount": 50000
        },
        headers=headers
    )

    assert budget_response.status_code == 200

    expense_response = client.post(
        "/api/v1/expenses",
        json={
            "amount": 30000,
            "category": "Food",
            "description": "Lunch and dinner"
        },
        headers=headers
    )

    assert expense_response.status_code in [200, 201]

    response = client.get(
        "/api/v1/dashboard",
        headers=headers
    )

    assert response.status_code == 200

    data = response.json()

    assert data["total_budget"] == 50000
    assert data["total_budget_spent"] == 30000
    assert data["total_budget_remaining"] == 20000

    budget = data["budgets"][0]

    assert budget["category"] == "Food"
    assert budget["budget"] == 50000
    assert budget["spent"] == 30000
    assert budget["remaining"] == 20000
    assert budget["usage_percentage"] == 60
    assert budget["status"] == "on_track"


def test_dashboard_warning_at_80_percent(client):

    headers = create_and_login_user(client)

    client.post(
        "/api/v1/budgets",
        json={
            "category": "Transport",
            "amount": 50000
        },
        headers=headers
    )

    client.post(
        "/api/v1/expenses",
        json={
            "amount": 40000,
            "category": "Transport",
            "description": "Transport expenses"
        },
        headers=headers
    )

    response = client.get(
        "/api/v1/dashboard",
        headers=headers
    )

    assert response.status_code == 200

    budget = response.json()["budgets"][0]

    assert budget["usage_percentage"] == 80
    assert budget["status"] == "warning"


def test_dashboard_detects_overspending(client):

    headers = create_and_login_user(client)

    client.post(
        "/api/v1/budgets",
        json={
            "category": "Fuel",
            "amount": 20000
        },
        headers=headers
    )

    client.post(
        "/api/v1/expenses",
        json={
            "amount": 25000,
            "category": "Fuel",
            "description": "Fuel purchase"
        },
        headers=headers
    )

    response = client.get(
        "/api/v1/dashboard",
        headers=headers
    )

    assert response.status_code == 200

    budget = response.json()["budgets"][0]

    assert budget["budget"] == 20000
    assert budget["spent"] == 25000
    assert budget["remaining"] == -5000
    assert budget["usage_percentage"] == 125
    assert budget["status"] == "overspent"


def test_dashboard_handles_multiple_categories(client):

    headers = create_and_login_user(client)

    client.post(
        "/api/v1/budgets",
        json={
            "category": "Food",
            "amount": 50000
        },
        headers=headers
    )

    client.post(
        "/api/v1/budgets",
        json={
            "category": "Transport",
            "amount": 30000
        },
        headers=headers
    )

    client.post(
        "/api/v1/expenses",
        json={
            "amount": 20000,
            "category": "Food",
            "description": "Food shopping"
        },
        headers=headers
    )

    client.post(
        "/api/v1/expenses",
        json={
            "amount": 15000,
            "category": "Transport",
            "description": "Transport"
        },
        headers=headers
    )

    response = client.get(
        "/api/v1/dashboard",
        headers=headers
    )

    assert response.status_code == 200

    data = response.json()

    assert data["total_budget"] == 80000
    assert data["total_budget_spent"] == 35000
    assert data["total_budget_remaining"] == 45000

    assert len(data["budgets"]) == 2