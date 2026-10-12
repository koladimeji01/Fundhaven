import os

from unittest.mock import patch


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

    if os.path.exists(DATABASE_NAME):
        os.remove(DATABASE_NAME)

    run_migrations()

    yield

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
# HELPER: CREATE TEST USER
# ==========================================

def create_test_user(
    client,
    name="testuser",
    email="testuser@example.com",
    income=300000,
    password="password123"
):

    response = client.post(
        "/api/v1/users",
        json={
            "name": name,
            "email": email,
            "income": income,
            "password": password
        }
    )

    return response


# ==========================================
# HELPER: LOGIN
# ==========================================

def login_test_user(
    client,
    name="testuser",
    password="password123"
):

    # Make sure the test user exists
    create_response = create_test_user(
        client,
        name=name,
        email=f"{name}@example.com",
        income=300000,
        password=password
    )

    # If the user already exists, continue to login.
    # This makes the helper safe for tests that
    # may create the user before calling it.

    response = client.post(
        "/api/v1/login",
        json={
            "name": name,
            "password": password
        }
    )

    return response


# ==========================================
# HELPER: GET TOKEN
# ==========================================

def get_test_token(client):

    response = login_test_user(
        client
    )

    assert response.status_code == 200

    return response.json()[
        "access_token"
    ]


# ==========================================
# HOME
# ==========================================

def test_home(client):

    response = client.get("/")

    assert response.status_code == 200

    data = response.json()

    assert data["message"] == (
        "Welcome to BudgetWise API"
    )


# ==========================================
# HEALTH CHECK
# ==========================================

def test_health_check(client):

    response = client.get("/health")

    assert response.status_code == 200

    data = response.json()

    assert data["status"] == "healthy"


# ==========================================
# API V1 HOME
# ==========================================

def test_api_v1_home(client):

    response = client.get(
        "/api/v1/"
    )

    assert response.status_code == 200

    data = response.json()

    assert data["version"] == "1"


# ==========================================
# CREATE USER
# ==========================================

def test_create_user(client):

    response = create_test_user(
        client
    )

    assert response.status_code == 200

    data = response.json()

    assert data["name"] == "testuser"

    assert data["email"] == (
        "testuser@example.com"
    )

    assert data["income"] == 300000

    assert "id" in data


# ==========================================
# DUPLICATE USERNAME
# ==========================================

def test_duplicate_username(client):

    first_response = create_test_user(
        client
    )

    assert first_response.status_code == 200

    response = client.post(
        "/api/v1/users",
        json={
            "name": "testuser",
            "email": "another@example.com",
            "income": 300000,
            "password": "password123"
        }
    )

    assert response.status_code == 400

    data = response.json()

    assert data["detail"] == (
        "Username already exists"
    )


# ==========================================
# DUPLICATE EMAIL
# ==========================================

def test_duplicate_email(client):

    first_response = create_test_user(
        client
    )

    assert first_response.status_code == 200

    response = client.post(
        "/api/v1/users",
        json={
            "name": "anotheruser",
            "email": "testuser@example.com",
            "income": 300000,
            "password": "password123"
        }
    )

    assert response.status_code == 400

    data = response.json()

    assert data["detail"] == (
        "Email already exists"
    )


# ==========================================
# INVALID EMAIL
# ==========================================

def test_invalid_email(client):

    response = client.post(
        "/api/v1/users",
        json={
            "name": "emailuser",
            "email": "not-an-email",
            "income": 300000,
            "password": "password123"
        }
    )

    assert response.status_code == 422


# ==========================================
# LOGIN
# ==========================================

def test_login(client):

    response = login_test_user(
        client
    )

    assert response.status_code == 200

    data = response.json()

    assert data["message"] == (
        "Login successful"
    )

    assert "access_token" in data

    assert data["token_type"] == "bearer"


# ==========================================
# WRONG PASSWORD
# ==========================================

def test_wrong_password(client):

    create_test_user(
        client
    )

    response = client.post(
        "/api/v1/login",
        json={
            "name": "testuser",
            "password": "wrongpassword"
        }
    )

    assert response.status_code == 401

    data = response.json()

    assert data["detail"] == (
        "Invalid username or password"
    )


# ==========================================
# NONEXISTENT USER
# ==========================================

def test_nonexistent_user(client):

    response = client.post(
        "/api/v1/login",
        json={
            "name": "doesnotexist",
            "password": "password123"
        }
    )

    assert response.status_code == 401

    data = response.json()

    assert data["detail"] == (
        "Invalid username or password"
    )


# ==========================================
# PROFILE WITHOUT TOKEN
# ==========================================

def test_profile_without_token(client):

    response = client.get(
        "/api/v1/users/me"
    )

    assert response.status_code == 401


# ==========================================
# PROFILE WITH TOKEN
# ==========================================

def test_profile_with_token(client):

    token = get_test_token(
        client
    )

    response = client.get(
        "/api/v1/users/me",
        headers={
            "Authorization":
            f"Bearer {token}"
        }
    )

    assert response.status_code == 200

    data = response.json()

    assert data["name"] == "testuser"

    assert data["income"] == 300000

    assert data["email"] == (
        "testuser@example.com"
    )

    assert "expenses" in data

    assert "total_expenses" in data

    assert "balance" in data


# ==========================================
# CREATE EXPENSE
# ==========================================

def test_create_expense(client):

    token = get_test_token(
        client
    )

    response = client.post(
        "/api/v1/expenses",
        json={
            "amount": 5000,
            "category": "food",
            "description": "Lunch"
        },
        headers={
            "Authorization":
            f"Bearer {token}"
        }
    )

    assert response.status_code == 200

    data = response.json()

    assert data["amount"] == 5000

    assert data["category"] == "food"

    assert data["description"] == "Lunch"

    assert "id" in data


# ==========================================
# GET EXPENSES
# ==========================================

def test_get_expenses(client):

    token = get_test_token(
        client
    )

    response = client.get(
        "/api/v1/expenses",
        headers={
            "Authorization":
            f"Bearer {token}"
        }
    )

    assert response.status_code == 200

    data = response.json()

    assert "user_id" in data

    assert "expenses" in data

    assert isinstance(
        data["expenses"],
        list
    )


# ==========================================
# UPDATE EXPENSE
# ==========================================

def test_update_expense(client):

    token = get_test_token(
        client
    )

    create_response = client.post(
        "/api/v1/expenses",
        json={
            "amount": 7000,
            "category": "transport",
            "description": "Fuel"
        },
        headers={
            "Authorization":
            f"Bearer {token}"
        }
    )

    assert create_response.status_code == 200

    expense_id = create_response.json()[
        "id"
    ]

    response = client.put(
        f"/api/v1/expenses/{expense_id}",
        json={
            "amount": 8000,
            "category": "transport",
            "description": "Updated fuel"
        },
        headers={
            "Authorization":
            f"Bearer {token}"
        }
    )

    assert response.status_code == 200

    data = response.json()

    assert data["id"] == expense_id

    assert data["amount"] == 8000

    assert data["category"] == "transport"

    assert data["description"] == (
        "Updated fuel"
    )


# ==========================================
# DELETE EXPENSE
# ==========================================

def test_delete_expense(client):

    token = get_test_token(
        client
    )

    create_response = client.post(
        "/api/v1/expenses",
        json={
            "amount": 3000,
            "category": "food",
            "description": "Breakfast"
        },
        headers={
            "Authorization":
            f"Bearer {token}"
        }
    )

    assert create_response.status_code == 200

    expense_id = create_response.json()[
        "id"
    ]

    response = client.delete(
        f"/api/v1/expenses/{expense_id}",
        headers={
            "Authorization":
            f"Bearer {token}"
        }
    )

    assert response.status_code == 200

    data = response.json()

    assert data["message"] == (
        "Expense deleted successfully"
    )


# ==========================================
# USER OWNERSHIP
# ==========================================

def test_user_cannot_modify_another_users_expense(
    client
):

    first_response = create_test_user(
        client,
        name="firstuser",
        email="firstuser@example.com",
        income=300000,
        password="password123"
    )

    assert first_response.status_code == 200

    second_response = create_test_user(
        client,
        name="seconduser",
        email="seconduser@example.com",
        income=400000,
        password="password123"
    )

    assert second_response.status_code == 200

    first_login = login_test_user(
        client,
        name="firstuser",
        password="password123"
    )

    first_token = first_login.json()[
        "access_token"
    ]

    expense_response = client.post(
        "/api/v1/expenses",
        json={
            "amount": 10000,
            "category": "food",
            "description": "Private expense"
        },
        headers={
            "Authorization":
            f"Bearer {first_token}"
        }
    )

    assert expense_response.status_code == 200

    expense_id = expense_response.json()[
        "id"
    ]

    second_login = login_test_user(
        client,
        name="seconduser",
        password="password123"
    )

    second_token = second_login.json()[
        "access_token"
    ]

    update_response = client.put(
        f"/api/v1/expenses/{expense_id}",
        json={
            "amount": 99999,
            "category": "other",
            "description": "Unauthorized update"
        },
        headers={
            "Authorization":
            f"Bearer {second_token}"
        }
    )

    assert update_response.status_code == 404

    delete_response = client.delete(
        f"/api/v1/expenses/{expense_id}",
        headers={
            "Authorization":
            f"Bearer {second_token}"
        }
    )

    assert delete_response.status_code == 404


# ==========================================
# DASHBOARD
# ==========================================

def test_dashboard(client):

    token = get_test_token(
        client
    )

    response = client.get(
        "/api/v1/users/me/dashboard",
        headers={
            "Authorization":
            f"Bearer {token}"
        }
    )

    assert response.status_code == 200

    data = response.json()

    assert "income" in data

    assert "total_expenses" in data

    assert "balance" in data

    assert "savings_rate" in data

    assert "spending_by_category" in data

    assert "highest_spending_category" in data

    assert "warning" in data


# ==========================================
# DASHBOARD 80% WARNING
# ==========================================

def test_dashboard_80_percent_warning(
    client
):

    create_response = create_test_user(
        client,
        name="warninguser",
        email="warninguser@example.com",
        income=100000,
        password="password123"
    )

    assert create_response.status_code == 200

    login_response = login_test_user(
        client,
        name="warninguser",
        password="password123"
    )

    token = login_response.json()[
        "access_token"
    ]

    expense_response = client.post(
        "/api/v1/expenses",
        json={
            "amount": 80000,
            "category": "rent",
            "description": "House rent"
        },
        headers={
            "Authorization":
            f"Bearer {token}"
        }
    )

    assert expense_response.status_code == 200

    dashboard_response = client.get(
        "/api/v1/users/me/dashboard",
        headers={
            "Authorization":
            f"Bearer {token}"
        }
    )

    assert dashboard_response.status_code == 200

    data = dashboard_response.json()

    assert "80%" in data["warning"]


# ==========================================
# DASHBOARD OVERSPENDING WARNING
# ==========================================

def test_dashboard_overspending_warning(
    client
):

    create_response = create_test_user(
        client,
        name="overspenduser",
        email="overspenduser@example.com",
        income=50000,
        password="password123"
    )

    assert create_response.status_code == 200

    login_response = login_test_user(
        client,
        name="overspenduser",
        password="password123"
    )

    token = login_response.json()[
        "access_token"
    ]

    expense_response = client.post(
        "/api/v1/expenses",
        json={
            "amount": 60000,
            "category": "shopping",
            "description": "Overspending"
        },
        headers={
            "Authorization":
            f"Bearer {token}"
        }
    )

    assert expense_response.status_code == 200

    dashboard_response = client.get(
        "/api/v1/users/me/dashboard",
        headers={
            "Authorization":
            f"Bearer {token}"
        }
    )

    assert dashboard_response.status_code == 200

    data = dashboard_response.json()

    assert (
        "spent more than your income"
        in data["warning"]
    )


# ==========================================
# INVALID EXPENSE AMOUNT
# ==========================================

def test_invalid_expense_amount(client):

    token = get_test_token(
        client
    )

    response = client.post(
        "/api/v1/expenses",
        json={
            "amount": -100,
            "category": "food",
            "description": "Invalid expense"
        },
        headers={
            "Authorization":
            f"Bearer {token}"
        }
    )

    assert response.status_code == 422


# ==========================================
# ZERO EXPENSE AMOUNT
# ==========================================

def test_zero_expense_amount(client):

    token = get_test_token(
        client
    )

    response = client.post(
        "/api/v1/expenses",
        json={
            "amount": 0,
            "category": "food",
            "description": "Zero expense"
        },
        headers={
            "Authorization":
            f"Bearer {token}"
        }
    )

    assert response.status_code == 422


# ==========================================
# SHORT CATEGORY
# ==========================================

def test_short_category(client):

    token = get_test_token(
        client
    )

    response = client.post(
        "/api/v1/expenses",
        json={
            "amount": 1000,
            "category": "x",
            "description": "Test expense"
        },
        headers={
            "Authorization":
            f"Bearer {token}"
        }
    )

    assert response.status_code == 422


# ==========================================
# SHORT DESCRIPTION
# ==========================================

def test_short_description(client):

    token = get_test_token(
        client
    )

    response = client.post(
        "/api/v1/expenses",
        json={
            "amount": 1000,
            "category": "food",
            "description": "x"
        },
        headers={
            "Authorization":
            f"Bearer {token}"
        }
    )

    assert response.status_code == 422


# ==========================================
# INVALID INCOME
# ==========================================

def test_invalid_income(client):

    response = client.post(
        "/api/v1/users",
        json={
            "name": "incomeuser",
            "email": "incomeuser@example.com",
            "income": -100,
            "password": "password123"
        }
    )

    assert response.status_code == 422


# ==========================================
# SHORT PASSWORD
# ==========================================

def test_short_password(client):

    response = client.post(
        "/api/v1/users",
        json={
            "name": "passworduser",
            "email": "passworduser@example.com",
            "income": 300000,
            "password": "123"
        }
    )

    assert response.status_code == 422


# ==========================================
# MISSING DESCRIPTION
# ==========================================

def test_missing_description(client):

    token = get_test_token(
        client
    )

    response = client.post(
        "/api/v1/expenses",
        json={
            "amount": 5000,
            "category": "food"
        },
        headers={
            "Authorization":
            f"Bearer {token}"
        }
    )

    assert response.status_code == 422


# ==========================================
# INVALID JWT
# ==========================================

def test_invalid_jwt(client):

    response = client.get(
        "/api/v1/users/me",
        headers={
            "Authorization":
            "Bearer invalid-token"
        }
    )

    assert response.status_code == 401


# ==========================================
# MALFORMED AUTHORIZATION
# ==========================================

def test_malformed_authorization(client):

    response = client.get(
        "/api/v1/users/me",
        headers={
            "Authorization":
            "invalid-token"
        }
    )

    assert response.status_code == 401


# ==========================================
# EXPENSES INVALID TOKEN
# ==========================================

def test_expenses_invalid_token(client):

    response = client.get(
        "/api/v1/expenses",
        headers={
            "Authorization":
            "Bearer invalid-token"
        }
    )

    assert response.status_code == 401


# ==========================================
# DASHBOARD WITHOUT TOKEN
# ==========================================

def test_dashboard_without_token(client):

    response = client.get(
        "/api/v1/users/me/dashboard"
    )

    assert response.status_code == 401


# ==========================================
# WELCOME EMAIL CONTENT
# ==========================================

def test_welcome_email_content():
    """The optional welcome email is now sent through Brevo."""
    from app.email import send_welcome_email

    with patch("app.email.brevo_configured", return_value=True):
        with patch("app.email.send_email", return_value="example-message-id") as mocked:
            result = send_welcome_email("test@example.com", "Kehinde")

    assert result == "example-message-id"
    mocked.assert_called_once()
    args = mocked.call_args.args
    assert args[0] == "test@example.com"
    assert args[1] == "Welcome to BudgetWise"
    assert "Kehinde" in args[2]
    assert "BudgetWise" in args[2]


# ==========================================
# REGISTRATION SENDS WELCOME EMAIL
# ==========================================

def test_registration_sends_welcome_email(
    client
):

    with patch(
        "app.api.auth.send_welcome_email"
    ) as mock_email:

        response = client.post(
            "/api/v1/users",
            json={
                "name": "emailuser",
                "email": "emailuser@example.com",
                "income": 300000,
                "password": "password123"
            }
        )

        assert response.status_code == 200

        mock_email.assert_called_once_with(
            recipient="emailuser@example.com",
            name="emailuser"
        )