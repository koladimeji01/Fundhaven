from datetime import date

from app.config import DATABASE_NAME
from app.db_backend import (
    connect_database, using_postgres, DB_ERRORS, INTEGRITY_ERRORS
)
from app.logging_config import logger


# ==========================================
# DATABASE CONNECTION
# ==========================================

def create_connection():
    """Connect to PostgreSQL when DATABASE_URL is set, otherwise SQLite."""
    return connect_database(DATABASE_NAME)


# ==========================================
# CREATE TABLES
# ==========================================

def create_tables():
    """Deprecated compatibility wrapper: one migration authority only."""
    from app.migrations.manager import run_migrations
    run_migrations()


# ==========================================
# USER FUNCTIONS
# ==========================================

def create_user(
    name,
    income,
    password,
    email=None
):
    connection = create_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            INSERT INTO users (
                name,
                income,
                password,
                email
            )
            VALUES (?, ?, ?, ?)
            """,
            (
                name,
                income,
                password,
                email
            )
        )

        user_id = cursor.lastrowid

        cursor.execute("""
            INSERT INTO monthly_income(user_id, month, amount)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, month)
            DO UPDATE SET amount = excluded.amount
        """, (user_id, date.today().strftime("%Y-%m"), income))

        connection.commit()
        return user_id

    except DB_ERRORS as error:
        connection.rollback()

        logger.error(
            f"Database error while creating user: {error}"
        )

        raise

    finally:
        connection.close()


def get_user(user_id):
    connection = create_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT
                id,
                name,
                income,
                password,
                email
            FROM users
            WHERE id = ?
            """,
            (user_id,)
        )

        return cursor.fetchone()

    except DB_ERRORS as error:
        logger.error(
            f"Database error while getting user: {error}"
        )

        raise

    finally:
        connection.close()


def get_user_by_id(user_id):
    connection = create_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT
                id,
                name,
                income,
                password,
                email
            FROM users
            WHERE id = ?
            LIMIT 1
            """,
            (user_id,)
        )

        return cursor.fetchone()

    except DB_ERRORS as error:
        logger.error(
            f"Database error while getting user by id: {error}"
        )

        raise

    finally:
        connection.close()


def get_user_by_name(name):
    connection = create_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT
                id,
                name,
                income,
                password,
                email
            FROM users
            WHERE name = ?
            """,
            (name,)
        )

        return cursor.fetchone()

    except DB_ERRORS as error:
        logger.error(
            f"Database error while getting user by name: {error}"
        )

        raise

    finally:
        connection.close()


def get_user_by_email(email):
    connection = create_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT
                id,
                name,
                income,
                password,
                email
            FROM users
            WHERE email = ?
            """,
            (email,)
        )

        return cursor.fetchone()

    except DB_ERRORS as error:
        logger.error(
            f"Database error while getting user by email: {error}"
        )

        raise

    finally:
        connection.close()


def update_user(
    user_id,
    name,
    income
):
    connection = create_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            UPDATE users
            SET
                name = ?,
                income = ?
            WHERE id = ?
            """,
            (
                name,
                income,
                user_id
            )
        )

        updated = cursor.rowcount
        if updated:
            cursor.execute("""
                INSERT INTO monthly_income(user_id, month, amount)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id, month)
                DO UPDATE SET amount = excluded.amount
            """, (user_id, date.today().strftime("%Y-%m"), income))
        connection.commit()
        return updated

    except INTEGRITY_ERRORS as error:
        connection.rollback()

        logger.error(
            f"Database integrity error while updating user: {error}"
        )

        raise ValueError(
            "Name already exists"
        )

    except DB_ERRORS as error:
        connection.rollback()

        logger.error(
            f"Database error while updating user: {error}"
        )

        raise

    finally:
        connection.close()

# ============================================================
# EXPENSES
# ============================================================

def add_expense(
    user_id,
    amount,
    category,
    description,
    expense_date
):
    connection = create_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        INSERT INTO expenses (
            user_id,
            amount,
            category,
            description,
            date
        )
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            user_id,
            amount,
            category,
            description,
            expense_date
        )
    )

    expense_id = cursor.lastrowid

    connection.commit()
    connection.close()

    return expense_id


def get_expenses(user_id):
    connection = create_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        SELECT
            id,
            amount,
            category,
            description,
            date
        FROM expenses
        WHERE user_id = ?
        ORDER BY id DESC
        """,
        (user_id,)
    )

    expenses = cursor.fetchall()

    connection.close()

    return expenses


def update_expense(
    user_id,
    expense_id,
    amount,
    category,
    description,
    expense_date
):
    connection = create_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        UPDATE expenses
        SET
            amount = ?,
            category = ?,
            description = ?,
            date = ?
        WHERE id = ?
        AND user_id = ?
        """,
        (
            amount,
            category,
            description,
            expense_date,
            expense_id,
            user_id
        )
    )

    updated = cursor.rowcount > 0

    connection.commit()
    connection.close()

    return updated

def delete_expense(
    user_id,
    expense_id
):
    connection = create_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            DELETE FROM expenses
            WHERE
                id = ?
                AND user_id = ?
            """,
            (
                expense_id,
                user_id
            )
        )

        connection.commit()

        return cursor.rowcount

    except DB_ERRORS as error:
        connection.rollback()

        logger.error(
            f"Database error while deleting expense: {error}"
        )

        raise

    finally:
        connection.close()


# ==========================================
# BUDGET FUNCTIONS
# ==========================================

def add_budget(
    user_id,
    category,
    amount
):
    connection = create_connection()

    try:
        cursor = connection.cursor()
        cursor.execute("BEGIN IMMEDIATE")
        cursor.execute(
            "SELECT id FROM budgets WHERE user_id = ? AND LOWER(TRIM(category)) = LOWER(TRIM(?))",
            (user_id, category.strip()),
        )
        if cursor.fetchone():
            connection.rollback()
            raise ValueError("A budget already exists for this category")

        cursor.execute(
            """
            INSERT INTO budgets (
                user_id,
                category,
                amount
            )
            VALUES (?, ?, ?)
            """,
            (
                user_id,
                category,
                amount
            )
        )

        connection.commit()

        budget_id = cursor.lastrowid

        return budget_id

    except DB_ERRORS as error:
        connection.rollback()

        logger.error(
            f"Database error while adding budget: {error}"
        )

        raise

    finally:
        connection.close()


def get_budgets(user_id):
    connection = create_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT
                id,
                user_id,
                category,
                amount
            FROM budgets
            WHERE user_id = ?
            ORDER BY id DESC
            """,
            (user_id,)
        )

        return cursor.fetchall()

    except DB_ERRORS as error:
        logger.error(
            f"Database error while getting budgets: {error}"
        )

        raise

    finally:
        connection.close()


def update_budget(
    user_id,
    budget_id,
    category,
    amount
):
    connection = create_connection()

    try:
        cursor = connection.cursor()
        cursor.execute("BEGIN IMMEDIATE")
        cursor.execute(
            "SELECT id FROM budgets WHERE user_id = ? AND id != ? AND LOWER(TRIM(category)) = LOWER(TRIM(?))",
            (user_id, budget_id, category.strip()),
        )
        if cursor.fetchone():
            connection.rollback()
            raise ValueError("A budget already exists for this category")

        cursor.execute(
            """
            UPDATE budgets
            SET
                category = ?,
                amount = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE
                id = ?
                AND user_id = ?
            """,
            (
                category,
                amount,
                budget_id,
                user_id
            )
        )

        connection.commit()

        return cursor.rowcount

    except DB_ERRORS as error:
        connection.rollback()

        logger.error(
            f"Database error while updating budget: {error}"
        )

        raise

    finally:
        connection.close()


def delete_budget(
    user_id,
    budget_id
):
    connection = create_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            DELETE FROM budgets
            WHERE
                id = ?
                AND user_id = ?
            """,
            (
                budget_id,
                user_id
            )
        )

        connection.commit()

        return cursor.rowcount

    except DB_ERRORS as error:
        connection.rollback()

        logger.error(
            f"Database error while deleting budget: {error}"
        )

        raise

    finally:
        connection.close()


# ==========================================
# GOAL FUNCTIONS
# ==========================================

def create_goal(
    user_id,
    name,
    target_amount,
    current_amount=0,
    target_date=None
):
    connection = create_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            INSERT INTO goals (
                user_id,
                name,
                target_amount,
                current_amount,
                target_date
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                user_id,
                name,
                target_amount,
                current_amount,
                target_date
            )
        )

        connection.commit()

        goal_id = cursor.lastrowid

        return goal_id

    except DB_ERRORS as error:
        connection.rollback()

        logger.error(
            f"Database error while creating goal: {error}"
        )

        raise

    finally:
        connection.close()


def get_goals(user_id):
    connection = create_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT
                id,
                user_id,
                name,
                target_amount,
                current_amount,
                target_date
            FROM goals
            WHERE user_id = ?
            ORDER BY id DESC
            """,
            (user_id,)
        )

        rows = cursor.fetchall()

        goals = []

        for row in rows:
            (
                goal_id,
                goal_user_id,
                name,
                target_amount,
                current_amount,
                target_date
            ) = row

            progress = (
                (current_amount / target_amount) * 100
                if target_amount > 0
                else 0
            )

            progress = min(progress, 100)

            goals.append(
                {
                    "id": goal_id,
                    "user_id": goal_user_id,
                    "name": name,
                    "target_amount": target_amount,
                    "current_amount": current_amount,
                    "target_date": target_date,
                    "progress": round(progress, 2),
                    "completed": current_amount >= target_amount
                }
            )

        return goals

    except DB_ERRORS as error:
        logger.error(
            f"Database error while getting goals: {error}"
        )

        raise

    finally:
        connection.close()


def get_goal(
    user_id,
    goal_id
):
    connection = create_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT
                id,
                user_id,
                name,
                target_amount,
                current_amount,
                target_date
            FROM goals
            WHERE
                id = ?
                AND user_id = ?
            LIMIT 1
            """,
            (
                goal_id,
                user_id
            )
        )

        row = cursor.fetchone()

        if row is None:
            return None

        (
            goal_id,
            goal_user_id,
            name,
            target_amount,
            current_amount,
            target_date
        ) = row

        progress = (
            (current_amount / target_amount) * 100
            if target_amount > 0
            else 0
        )

        progress = min(progress, 100)

        return {
            "id": goal_id,
            "user_id": goal_user_id,
            "name": name,
            "target_amount": target_amount,
            "current_amount": current_amount,
            "target_date": target_date,
            "progress": round(progress, 2),
            "completed": current_amount >= target_amount
        }

    except DB_ERRORS as error:
        logger.error(
            f"Database error while getting goal: {error}"
        )

        raise

    finally:
        connection.close()


def update_goal(
    user_id,
    goal_id,
    name,
    target_amount,
    current_amount,
    target_date
):
    connection = create_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            UPDATE goals
            SET
                name = ?,
                target_amount = ?,
                current_amount = ?,
                target_date = ?
            WHERE
                id = ?
                AND user_id = ?
            """,
            (
                name,
                target_amount,
                current_amount,
                target_date,
                goal_id,
                user_id
            )
        )

        connection.commit()

        return cursor.rowcount

    except DB_ERRORS as error:
        connection.rollback()

        logger.error(
            f"Database error while updating goal: {error}"
        )

        raise

    finally:
        connection.close()


def delete_goal(
    user_id,
    goal_id
):
    connection = create_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            DELETE FROM goals
            WHERE
                id = ?
                AND user_id = ?
            """,
            (
                goal_id,
                user_id
            )
        )

        connection.commit()

        return cursor.rowcount

    except DB_ERRORS as error:
        connection.rollback()

        logger.error(
            f"Database error while deleting goal: {error}"
        )

        raise

    finally:
        connection.close()


# ==========================================
# UPDATE USER PASSWORD
# ==========================================

def update_user_password(user_id, hashed_password):
    connection = create_connection()

    try:
        cursor = connection.cursor()

        cursor.execute(
            """
            UPDATE users
            SET password = ?
            WHERE id = ?
            """,
            (
                hashed_password,
                user_id,
            ),
        )

        connection.commit()

        return cursor.rowcount

    except DB_ERRORS as error:
        connection.rollback()

        logger.error(
            f"Database error while updating password: {error}"
        )

        raise

    finally:
        connection.close()

# ============================================================
# MONTHLY FINANCIAL RECORDS
# ============================================================

def get_month_expenses(user_id, month=None):
    """Return only expenses belonging to the specified calendar month."""
    from app.monthly import month_bounds
    start, end = month_bounds(month)
    connection = create_connection()
    try:
        return connection.execute("""
            SELECT id, amount, category, description, date
            FROM expenses
            WHERE user_id = ? AND date >= ? AND date < ?
            ORDER BY date DESC, id DESC
        """, (user_id, start, end)).fetchall()
    finally:
        connection.close()


def get_monthly_income(user_id, month=None):
    """Get the income effective in a month; None if no history exists."""
    from app.monthly import resolve_month
    selected = resolve_month(month)
    connection = create_connection()
    try:
        row = connection.execute("""
            SELECT amount FROM monthly_income
            WHERE user_id = ? AND month <= ?
            ORDER BY month DESC LIMIT 1
        """, (user_id, selected)).fetchone()
        return float(row[0]) if row else None
    finally:
        connection.close()


def delete_user_account(user_id):
    """Delete only the authenticated user's account and cascading records."""
    connection = create_connection()
    try:
        cursor = connection.execute("DELETE FROM users WHERE id = ?", (user_id,))
        deleted = cursor.rowcount
        connection.commit()
        return bool(deleted)
    except DB_ERRORS:
        connection.rollback()
        raise
    finally:
        connection.close()
