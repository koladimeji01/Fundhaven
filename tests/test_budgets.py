import os
from uuid import uuid4

# ==========================================
# USE TESTING ENVIRONMENT
# ==========================================

os.environ["ENVIRONMENT"] = "testing"


# ==========================================
# IMPORTS
# ==========================================

import pytest

from fastapi.testclient import TestClient

from api import app

from app.config import DATABASE_NAME

from app.migrations.manager import run_migrations


# ==========================================
# TEST DATABASE SETUP
# ==========================================

@pytest.fixture(
    scope="function",
    autouse=True
)
def setup_test_database():

    # Remove old test database
    if os.path.exists(DATABASE_NAME):
        os.remove(DATABASE_NAME)

    # Create all database tables
    run_migrations()

    yield

    # Clean up after every test
    if os.path.exists(DATABASE_NAME):
        os.remove(DATABASE_NAME)


# ==========================================
# TEST CLIENT
# ==========================================

@pytest.fixture
def client():

    with TestClient(app) as test_client:
        yield test_client


# ==========================================
# HELPER: CREATE AND LOGIN USER
# ==========================================

def create_and_login_user(client):

    unique_id = uuid4().hex[:8]

    name = f"budgetuser_{unique_id}"
    email = f"budgetuser_{unique_id}@example.com"

    # --------------------------------------
    # CREATE USER
    # --------------------------------------

    create_response = client.post(
        "/api/v1/users",
        json={
            "name": name,
            "income": 300000,
            "password": "password123",
            "email": email,
        },
    )

    assert create_response.status_code == 200, (
        create_response.text
    )

    # --------------------------------------
    # LOGIN USER
    # --------------------------------------

    login_response = client.post(
        "/api/v1/login",
        json={
            "name": name,
            "password": "password123",
        },
    )

    assert login_response.status_code == 200, (
        login_response.text
    )

    data = login_response.json()

    assert "access_token" in data

    return data["access_token"]


# ==========================================
# TEST CREATE BUDGET
# ==========================================

def test_create_budget(client):

    token = create_and_login_user(client)

    response = client.post(
        "/api/v1/budgets",
        headers={
            "Authorization": f"Bearer {token}"
        },
        json={
            "category": "Food",
            "amount": 50000,
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert "id" in data
    assert "user_id" in data
    assert data["category"] == "Food"
    assert data["amount"] == 50000


# ==========================================
# TEST GET BUDGETS
# ==========================================

def test_get_budgets(client):

    token = create_and_login_user(client)

    # Create first budget
    response = client.post(
        "/api/v1/budgets",
        headers={
            "Authorization": f"Bearer {token}"
        },
        json={
            "category": "Food",
            "amount": 50000,
        },
    )

    assert response.status_code == 200

    # Create second budget
    response = client.post(
        "/api/v1/budgets",
        headers={
            "Authorization": f"Bearer {token}"
        },
        json={
            "category": "Transport",
            "amount": 30000,
        },
    )

    assert response.status_code == 200

    # Get budgets
    response = client.get(
        "/api/v1/budgets",
        headers={
            "Authorization": f"Bearer {token}"
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert "user_id" in data
    assert "budgets" in data

    assert len(data["budgets"]) == 2

    categories = [
        budget["category"]
        for budget in data["budgets"]
    ]

    assert "Food" in categories
    assert "Transport" in categories


# ==========================================
# TEST UPDATE BUDGET
# ==========================================

def test_update_budget(client):

    token = create_and_login_user(client)

    # Create budget
    create_response = client.post(
        "/api/v1/budgets",
        headers={
            "Authorization": f"Bearer {token}"
        },
        json={
            "category": "Food",
            "amount": 50000,
        },
    )

    assert create_response.status_code == 200

    budget_id = create_response.json()["id"]

    # Update budget
    update_response = client.put(
        f"/api/v1/budgets/{budget_id}",
        headers={
            "Authorization": f"Bearer {token}"
        },
        json={
            "category": "Groceries",
            "amount": 75000,
        },
    )

    assert update_response.status_code == 200

    data = update_response.json()

    assert data["id"] == budget_id
    assert data["category"] == "Groceries"
    assert data["amount"] == 75000


# ==========================================
# TEST DELETE BUDGET
# ==========================================

def test_delete_budget(client):

    token = create_and_login_user(client)

    # Create budget
    create_response = client.post(
        "/api/v1/budgets",
        headers={
            "Authorization": f"Bearer {token}"
        },
        json={
            "category": "Entertainment",
            "amount": 20000,
        },
    )

    assert create_response.status_code == 200

    budget_id = create_response.json()["id"]

    # Delete budget
    delete_response = client.delete(
        f"/api/v1/budgets/{budget_id}",
        headers={
            "Authorization": f"Bearer {token}"
        },
    )

    assert delete_response.status_code == 200

    data = delete_response.json()

    assert data["message"] == (
        "Budget deleted successfully"
    )

    # Confirm it is gone
    get_response = client.get(
        "/api/v1/budgets",
        headers={
            "Authorization": f"Bearer {token}"
        },
    )

    assert get_response.status_code == 200

    budgets = get_response.json()["budgets"]

    assert all(
        budget["id"] != budget_id
        for budget in budgets
    )


# ==========================================
# TEST AUTHENTICATION REQUIRED
# ==========================================

def test_budget_requires_authentication(client):

    response = client.get(
        "/api/v1/budgets"
    )

    assert response.status_code == 401


# ==========================================
# TEST INVALID BUDGET AMOUNT
# ==========================================

def test_invalid_budget_amount(client):

    token = create_and_login_user(client)

    response = client.post(
        "/api/v1/budgets",
        headers={
            "Authorization": f"Bearer {token}"
        },
        json={
            "category": "Food",
            "amount": 0,
        },
    )

    assert response.status_code == 422


# ==========================================
# TEST INVALID BUDGET CATEGORY
# ==========================================

def test_invalid_budget_category(client):

    token = create_and_login_user(client)

    response = client.post(
        "/api/v1/budgets",
        headers={
            "Authorization": f"Bearer {token}"
        },
        json={
            "category": "F",
            "amount": 50000,
        },
    )

    assert response.status_code == 422


# ==========================================
# TEST BUDGET NOT FOUND
# ==========================================

def test_budget_not_found(client):

    token = create_and_login_user(client)

    response = client.put(
        "/api/v1/budgets/999999",
        headers={
            "Authorization": f"Bearer {token}"
        },
        json={
            "category": "Food",
            "amount": 50000,
        },
    )

    assert response.status_code == 404

    assert response.json()["detail"] == (
        "Budget not found"
    )