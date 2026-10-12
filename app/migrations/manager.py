import sqlite3

from app.config import DATABASE_NAME
from app.logging_config import logger


# ==========================================
# CREATE MIGRATIONS TABLE
# ==========================================

def create_migrations_table(connection):

    cursor = connection.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version INTEGER NOT NULL UNIQUE,
            description TEXT NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    connection.commit()


# ==========================================
# GET CURRENT DATABASE VERSION
# ==========================================

def get_current_version(connection):

    cursor = connection.cursor()

    cursor.execute("""
        SELECT MAX(version)
        FROM migrations
    """)

    result = cursor.fetchone()

    if result[0] is None:
        return 0

    return result[0]


# ==========================================
# RECORD MIGRATION
# ==========================================

def record_migration(
    connection,
    version,
    description
):

    cursor = connection.cursor()

    cursor.execute("""
        INSERT INTO migrations (
            version,
            description
        )
        VALUES (?, ?)
    """, (
        version,
        description
    ))

    connection.commit()


# ==========================================
# RUN MIGRATIONS
# ==========================================

def run_migrations():

    connection = sqlite3.connect(
        DATABASE_NAME
    )

    try:

        connection.execute(
            "PRAGMA foreign_keys = ON"
        )

        create_migrations_table(
            connection
        )

        current_version = (
            get_current_version(
                connection
            )
        )

        logger.info(
            f"Current database version: "
            f"{current_version}"
        )

        # ==================================
        # MIGRATION 1
        # ==================================

        if current_version < 1:

            logger.info(
                "Applying migration 1"
            )

            cursor = connection.cursor()

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    income REAL NOT NULL CHECK(income > 0),
                    password TEXT NOT NULL
                )
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS expenses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    amount REAL NOT NULL CHECK(amount > 0),
                    category TEXT NOT NULL,
                    description TEXT NOT NULL,

                    FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
                )
            """)

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS
                idx_expenses_user_id
                ON expenses(user_id)
            """)

            record_migration(
                connection,
                1,
                "Create users and expenses tables"
            )

            logger.info(
                "Migration 1 applied successfully"
            )

        # ==================================
        # MIGRATION 2
        # ==================================

        current_version = get_current_version(
            connection
        )

        if current_version < 2:

            logger.info(
                "Applying migration 2"
            )

            cursor = connection.cursor()

            cursor.execute("""
                ALTER TABLE users
                ADD COLUMN email TEXT
            """)

            record_migration(
                connection,
                2,
                "Add email column to users"
            )

            logger.info(
                "Migration 2 applied successfully"
            )

        # ==================================
        # MIGRATION 3
        # ==================================

        current_version = get_current_version(
            connection
        )

        if current_version < 3:

            logger.info(
                "Applying migration 3"
            )

            cursor = connection.cursor()

            cursor.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS
                idx_users_email
                ON users(email)
                WHERE email IS NOT NULL
            """)

            record_migration(
                connection,
                3,
                "Add unique index for user emails"
            )

            logger.info(
                "Migration 3 applied successfully"
            )

        # ==================================
        # MIGRATION 4
        # ==================================

        current_version = get_current_version(
            connection
        )

        if current_version < 4:

            logger.info(
                "Applying migration 4"
            )

            cursor = connection.cursor()

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS budgets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    category TEXT NOT NULL,
                    amount REAL NOT NULL CHECK(amount > 0),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                    FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
                )
            """)

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS
                idx_budgets_user_id
                ON budgets(user_id)
            """)

            record_migration(
                connection,
                4,
                "Create budgets table"
            )

            logger.info(
                "Migration 4 applied successfully"
            )

        # ==================================
        # MIGRATION 5
        # ==================================

        current_version = get_current_version(
            connection
        )

        if current_version < 5:

            logger.info(
                "Applying migration 5"
            )

            cursor = connection.cursor()

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS goals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    target_amount REAL NOT NULL CHECK(target_amount > 0),
                    current_amount REAL NOT NULL DEFAULT 0
                        CHECK(current_amount >= 0),
                    target_date TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                    FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
                )
            """)

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS
                idx_goals_user_id
                ON goals(user_id)
            """)

            record_migration(
                connection,
                5,
                "Create goals table"
            )

            logger.info(
                "Migration 5 applied successfully"
            )

        # ==================================
        # MIGRATION 6
        # ==================================

        current_version = get_current_version(
            connection
        )

        if current_version < 6:

            logger.info(
                "Applying migration 6"
            )

            cursor = connection.cursor()

            # ----------------------------------
            # Add transaction date column
            # ----------------------------------

            cursor.execute("""
                ALTER TABLE expenses
                ADD COLUMN date TEXT
            """)

            # ----------------------------------
            # Give existing transactions today's
            # date so old records remain valid.
            # ----------------------------------

            cursor.execute("""
                UPDATE expenses
                SET date = DATE('now')
                WHERE date IS NULL
            """)

            # ----------------------------------
            # Index transaction dates
            # ----------------------------------

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS
                idx_expenses_date
                ON expenses(date)
            """)

            record_migration(
                connection,
                6,
                "Add transaction date to expenses"
            )

            logger.info(
                "Migration 6 applied successfully"
            )

        # ==================================
        # FINAL VERSION
        # ==================================

        final_version = get_current_version(
            connection
        )

        logger.info(
            f"Database is now at version "
            f"{final_version}"
        )

    except sqlite3.Error as error:

        connection.rollback()

        logger.error(
            f"Migration failed: {error}"
        )

        raise

    finally:

        connection.close()