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
        # MIGRATION 7: MONTHLY INCOME HISTORY
        # ==================================

        current_version = get_current_version(connection)

        if current_version < 7:
            cursor = connection.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS monthly_income (
                    user_id INTEGER NOT NULL,
                    month TEXT NOT NULL,
                    amount REAL NOT NULL CHECK(amount > 0),
                    PRIMARY KEY (user_id, month),
                    FOREIGN KEY (user_id)
                        REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            # We cannot reconstruct historical salary from an undated field.
            # Seed existing incomes from the current month onward.
            cursor.execute("""
                INSERT OR IGNORE INTO monthly_income
                    (user_id, month, amount)
                SELECT id, STRFTIME('%Y-%m','now'), income
                FROM users
            """)
            record_migration(
                connection, 7, "Track effective monthly income"
            )

        # ==================================
        # MIGRATION 8: EMAIL OTP AND MONTHLY REPORTS
        # ==================================

        current_version = get_current_version(connection)

        if current_version < 8:
            cursor = connection.cursor()

            cursor.execute("""
                ALTER TABLE users
                ADD COLUMN monthly_reports_enabled
                    INTEGER NOT NULL DEFAULT 0
                    CHECK(monthly_reports_enabled IN (0, 1))
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS login_challenges (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    code_digest TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL,
                    last_sent_at INTEGER NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    resend_count INTEGER NOT NULL DEFAULT 0,
                    consumed_at INTEGER,
                    FOREIGN KEY(user_id)
                        REFERENCES users(id) ON DELETE CASCADE
                )
            """)

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_login_challenges_user
                ON login_challenges(user_id, created_at)
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS monthly_report_delivery (
                    user_id INTEGER NOT NULL,
                    report_month TEXT NOT NULL,
                    status TEXT NOT NULL
                        CHECK(status IN ('sending', 'sent', 'failed')),
                    claimed_at INTEGER NOT NULL,
                    sent_at INTEGER,
                    provider_message_id TEXT,
                    PRIMARY KEY(user_id, report_month),
                    FOREIGN KEY(user_id)
                        REFERENCES users(id) ON DELETE CASCADE
                )
            """)

            record_migration(
                connection, 8,
                "Email verification and monthly report preferences"
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