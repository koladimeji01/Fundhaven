import os

import pytest

from fastapi.testclient import TestClient

from api import app

from app.config import DATABASE_NAME

from app.migrations.manager import run_migrations


# ============================================================
# TEST DATABASE
# ============================================================

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


# ============================================================
# CLIENT
# ============================================================

@pytest.fixture
def client():

    with TestClient(app) as test_client:

        yield test_client


# ============================================================
# HELPERS
# ============================================================

def create_user(client):

    response = client.post(
        "/api/v1/users",
        json={
            "name": "goaluser",
            "email": "goaluser@example.com",
            "income": 300000,
            "password": "password123"
        }
    )

    assert response.status_code == 200

    return response


def get_token(client):

    create_user(client)

    response = client.post(
        "/api/v1/login",
        json={
            "name": "goaluser",
            "password": "password123"
        }
    )

    assert response.status_code == 200

    return response.json()["access_token"]


def auth_headers(token):

    return {
        "Authorization": f"Bearer {token}"
    }


# ============================================================
# AUTHENTICATION
# ============================================================

def test_goals_requires_authentication(client):

    response = client.get(
        "/api/v1/goals"
    )

    assert response.status_code == 401


# ============================================================
# CREATE GOAL
# ============================================================

def test_create_goal(client):

    token = get_token(client)

    response = client.post(
        "/api/v1/goals",
        json={
            "name": "Emergency Fund",
            "target_amount": 500000,
            "current_amount": 100000,
            "target_date": "2027-12-31"
        },
        headers=auth_headers(token)
    )

    assert response.status_code == 200

    data = response.json()

    assert data["name"] == "Emergency Fund"

    assert data["target_amount"] == 500000

    assert data["current_amount"] == 100000

    assert data["progress"] == 20

    assert data["completed"] is False

    assert "id" in data


# ============================================================
# GET GOALS
# ============================================================

def test_get_goals(client):

    token = get_token(client)

    client.post(
        "/api/v1/goals",
        json={
            "name": "New Laptop",
            "target_amount": 300000,
            "current_amount": 50000
        },
        headers=auth_headers(token)
    )

    response = client.get(
        "/api/v1/goals",
        headers=auth_headers(token)
    )

    assert response.status_code == 200

    data = response.json()

    assert "goals" in data

    assert len(data["goals"]) == 1

    assert data["goals"][0]["name"] == "New Laptop"


# ============================================================
# GET SINGLE GOAL
# ============================================================

def test_get_single_goal(client):

    token = get_token(client)

    create_response = client.post(
        "/api/v1/goals",
        json={
            "name": "Car Fund",
            "target_amount": 2000000,
            "current_amount": 500000
        },
        headers=auth_headers(token)
    )

    goal_id = create_response.json()["id"]

    response = client.get(
        f"/api/v1/goals/{goal_id}",
        headers=auth_headers(token)
    )

    assert response.status_code == 200

    data = response.json()

    assert data["id"] == goal_id

    assert data["name"] == "Car Fund"


# ============================================================
# UPDATE GOAL
# ============================================================

def test_update_goal(client):

    token = get_token(client)

    create_response = client.post(
        "/api/v1/goals",
        json={
            "name": "Vacation",
            "target_amount": 500000,
            "current_amount": 100000
        },
        headers=auth_headers(token)
    )

    goal_id = create_response.json()["id"]

    response = client.put(
        f"/api/v1/goals/{goal_id}",
        json={
            "name": "Vacation Fund",
            "current_amount": 250000
        },
        headers=auth_headers(token)
    )

    assert response.status_code == 200

    data = response.json()

    assert data["name"] == "Vacation Fund"

    assert data["target_amount"] == 500000

    assert data["current_amount"] == 250000

    assert data["progress"] == 50


# ============================================================
# COMPLETED GOAL
# ============================================================

def test_completed_goal(client):

    token = get_token(client)

    response = client.post(
        "/api/v1/goals",
        json={
            "name": "Phone",
            "target_amount": 200000,
            "current_amount": 200000
        },
        headers=auth_headers(token)
    )

    assert response.status_code == 200

    data = response.json()

    assert data["progress"] == 100

    assert data["completed"] is True


# ============================================================
# INVALID CURRENT AMOUNT
# ============================================================

def test_goal_current_amount_cannot_exceed_target(client):

    token = get_token(client)

    response = client.post(
        "/api/v1/goals",
        json={
            "name": "Invalid Goal",
            "target_amount": 100000,
            "current_amount": 150000
        },
        headers=auth_headers(token)
    )

    assert response.status_code == 400

    assert response.json()["detail"] == (
        "Current amount cannot exceed target amount"
    )


# ============================================================
# GOAL NOT FOUND
# ============================================================

def test_goal_not_found(client):

    token = get_token(client)

    response = client.get(
        "/api/v1/goals/999999",
        headers=auth_headers(token)
    )

    assert response.status_code == 404

    assert response.json()["detail"] == (
        "Goal not found"
    )


# ============================================================
# DELETE GOAL
# ============================================================

def test_delete_goal(client):

    token = get_token(client)

    create_response = client.post(
        "/api/v1/goals",
        json={
            "name": "Delete Me",
            "target_amount": 100000
        },
        headers=auth_headers(token)
    )

    goal_id = create_response.json()["id"]

    response = client.delete(
        f"/api/v1/goals/{goal_id}",
        headers=auth_headers(token)
    )

    assert response.status_code == 200

    assert response.json()["message"] == (
        "Goal deleted successfully"
    )

    get_response = client.get(
        f"/api/v1/goals/{goal_id}",
        headers=auth_headers(token)
    )

    assert get_response.status_code == 404


# ============================================================
# USER OWNERSHIP
# ============================================================

def test_user_cannot_access_another_users_goal(client):

    # First user
    first_response = client.post(
        "/api/v1/users",
        json={
            "name": "firstgoaluser",
            "email": "firstgoal@example.com",
            "income": 300000,
            "password": "password123"
        }
    )

    assert first_response.status_code == 200

    first_login = client.post(
        "/api/v1/login",
        json={
            "name": "firstgoaluser",
            "password": "password123"
        }
    )

    first_token = first_login.json()["access_token"]

    # First user creates goal
    goal_response = client.post(
        "/api/v1/goals",
        json={
            "name": "Private Goal",
            "target_amount": 500000
        },
        headers=auth_headers(first_token)
    )

    goal_id = goal_response.json()["id"]

    # Second user
    second_response = client.post(
        "/api/v1/users",
        json={
            "name": "secondgoaluser",
            "email": "secondgoal@example.com",
            "income": 400000,
            "password": "password123"
        }
    )

    assert second_response.status_code == 200

    second_login = client.post(
        "/api/v1/login",
        json={
            "name": "secondgoaluser",
            "password": "password123"
        }
    )

    second_token = second_login.json()["access_token"]

    # Attempt to access first user's goal
    response = client.get(
        f"/api/v1/goals/{goal_id}",
        headers=auth_headers(second_token)
    )

    assert response.status_code == 404


# ============================================================
# OWNERSHIP DELETE
# ============================================================

def test_user_cannot_delete_another_users_goal(client):

    # First user
    client.post(
        "/api/v1/users",
        json={
            "name": "owneruser",
            "email": "owner@example.com",
            "income": 300000,
            "password": "password123"
        }
    )

    first_login = client.post(
        "/api/v1/login",
        json={
            "name": "owneruser",
            "password": "password123"
        }
    )

    first_token = first_login.json()["access_token"]

    goal_response = client.post(
        "/api/v1/goals",
        json={
            "name": "Protected Goal",
            "target_amount": 500000
        },
        headers=auth_headers(first_token)
    )

    goal_id = goal_response.json()["id"]

    # Second user
    client.post(
        "/api/v1/users",
        json={
            "name": "attackeruser",
            "email": "attacker@example.com",
            "income": 300000,
            "password": "password123"
        }
    )

    second_login = client.post(
        "/api/v1/login",
        json={
            "name": "attackeruser",
            "password": "password123"
        }
    )

    second_token = second_login.json()["access_token"]

    response = client.delete(
        f"/api/v1/goals/{goal_id}",
        headers=auth_headers(second_token)
    )

    assert response.status_code == 404