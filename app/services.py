from app import database
from app.auth import hash_password, verify_password


# ============================================================
# PASSWORD
# ============================================================

def change_user_password(
    user_id,
    current_password,
    new_password
):
    user = database.get_user(user_id)

    if not user:
        return False

    stored_password = user[3]

    if not verify_password(
        current_password,
        stored_password
    ):
        return False

    new_hashed_password = hash_password(
        new_password
    )

    return database.update_user_password(
        user_id,
        new_hashed_password
    )


# ============================================================
# USER PROFILE
# ============================================================

def get_user_profile(user_id):
    user = database.get_user(user_id)

    if not user:
        return None

    expenses = database.get_expenses(user_id)

    total_expenses = sum(
        float(expense[1])
        for expense in expenses
    )

    balance = float(user[2]) - total_expenses

    formatted_expenses = []

    for expense in expenses:
        formatted_expenses.append({
            "id": expense[0],
            "amount": expense[1],
            "category": expense[2],
            "description": expense[3],
            "date": expense[4]
        })

    return {
        "id": user[0],
        "name": user[1],
        "income": user[2],
        "email": user[4],
        "expenses": formatted_expenses,
        "total_expenses": total_expenses,
        "balance": balance
    }


def update_user_profile(user_id, name, income):
    """
    Update profile fields and record this month's effective income.

    database.update_user() handles the monthly-income record within
    the same SQLite transaction. Return the updated user profile
    because PUT /users/me declares UserResponse.
    """
    updated = database.update_user(
        user_id=user_id,
        name=name,
        income=income,
    )

    if not updated:
        return None

    return get_user_profile(user_id)


# ============================================================
# EXPENSES
# ============================================================

def get_user_expenses(user_id):
    expenses = database.get_expenses(user_id)

    return [
        {
            "id": expense[0],
            "amount": expense[1],
            "category": expense[2],
            "description": expense[3],
            "date": expense[4]
        }
        for expense in expenses
    ]


def create_user_expense(
    user_id,
    amount,
    category,
    description,
    expense_date
):
    expense_id = database.add_expense(
        user_id,
        amount,
        category,
        description,
        expense_date
    )

    return {
        "id": expense_id,
        "user_id": user_id,
        "amount": amount,
        "category": category,
        "description": description,
        "date": expense_date
    }


def update_user_expense(
    user_id,
    expense_id,
    amount,
    category,
    description,
    expense_date
):
    updated = database.update_expense(
        user_id,
        expense_id,
        amount,
        category,
        description,
        expense_date
    )

    if not updated:
        return None

    return {
        "id": expense_id,
        "user_id": user_id,
        "amount": amount,
        "category": category,
        "description": description,
        "date": expense_date
    }


def delete_user_expense(
    user_id,
    expense_id
):
    return database.delete_expense(
        user_id,
        expense_id
    )


# ============================================================
# BUDGETS
# ============================================================

def create_user_budget(
    user_id,
    category,
    amount
):
    budget_id = database.add_budget(
        user_id,
        category,
        amount
    )

    return {
        "id": budget_id,
        "user_id": user_id,
        "category": category,
        "amount": amount
    }


def get_user_budgets(user_id):
    budgets = database.get_budgets(user_id)

    return [
        {
            "id": budget[0],
            "user_id": budget[1],
            "category": budget[2],
            "amount": budget[3]
        }
        for budget in budgets
    ]


def update_user_budget(
    user_id,
    budget_id,
    category,
    amount
):
    updated = database.update_budget(
        user_id,
        budget_id,
        category,
        amount
    )

    if not updated:
        return None

    return {
        "id": budget_id,
        "user_id": user_id,
        "category": category,
        "amount": amount
    }


def delete_user_budget(
    user_id,
    budget_id
):
    return database.delete_budget(
        user_id,
        budget_id
    )


# ============================================================
# MAIN DASHBOARD
# ============================================================

def get_user_dashboard(user_id, month=None):
    from app.monthly import resolve_month
    month = resolve_month(month)
    user = database.get_user(user_id)

    if not user:
        return None

    expenses = database.get_month_expenses(user_id, month)

    income_value = database.get_monthly_income(user_id, month)
    income = float(income_value) if income_value is not None else 0.0

    total_expenses = sum(
        float(expense[1])
        for expense in expenses
    )

    balance = income - total_expenses

    # --------------------------------------------------------
    # SPENDING BY CATEGORY
    # --------------------------------------------------------

    spending_by_category = {}

    for expense in expenses:
        category = expense[2]
        amount = float(expense[1])

        spending_by_category.setdefault(
            category,
            0.0
        )

        spending_by_category[category] += amount

    # --------------------------------------------------------
    # SAVINGS RATE
    # --------------------------------------------------------

    if income > 0:
        savings_rate = (
            balance / income
        ) * 100
    else:
        savings_rate = 0.0

    # --------------------------------------------------------
    # HIGHEST SPENDING CATEGORY
    # --------------------------------------------------------

    if spending_by_category:

        highest_category = max(
            spending_by_category,
            key=spending_by_category.get
        )

        highest_spending_category = {
            "category": highest_category,
            "amount": spending_by_category[
                highest_category
            ]
        }

    else:

        highest_spending_category = {
            "category": None,
            "amount": 0.0
        }

    # --------------------------------------------------------
    # SPENDING WARNING
    # --------------------------------------------------------

    if income > 0:

        expense_percentage = (
            total_expenses / income
        ) * 100

    else:

        expense_percentage = 0.0

    if expense_percentage >= 100:

        warning = (
            f"You have spent more than your income "
            f"({expense_percentage:.0f}%)."
        )

    elif expense_percentage >= 80:

        warning = (
            f"You have used {expense_percentage:.0f}% "
            f"of your income on expenses."
        )

    else:

        warning = (
            f"Your spending is on track "
            f"({expense_percentage:.0f}% of income used)."
        )

    # --------------------------------------------------------
    # RETURN DASHBOARD
    # --------------------------------------------------------

    return {
        "month": month,
        "income_recorded": income_value is not None,
        "income": income,
        "total_expenses": total_expenses,
        "balance": balance,
        "savings_rate": savings_rate,
        "spending_by_category": spending_by_category,
        "highest_spending_category": highest_spending_category,
        "warning": warning
    }


# ============================================================
# BUDGET DASHBOARD
# ============================================================

def get_budget_dashboard(user_id, month=None):
    from app.monthly import resolve_month
    month = resolve_month(month)
    user = database.get_user_by_id(user_id)

    if not user:
        return None

    income_value = database.get_monthly_income(user_id, month)
    income = float(income_value) if income_value is not None else 0.0

    expenses = database.get_month_expenses(user_id, month)

    budgets = database.get_budgets(user_id)

    # --------------------------------------------------------
    # TOTAL EXPENSES
    # --------------------------------------------------------

    total_expenses = sum(
        float(expense[1])
        for expense in expenses
    )

    balance = income - total_expenses

    # --------------------------------------------------------
    # SPENDING BY CATEGORY
    # --------------------------------------------------------

    spending_by_category = {}

    for expense in expenses:

        category = expense[2]
        amount = float(expense[1])

        spending_by_category[category] = (
            spending_by_category.get(
                category,
                0.0
            ) + amount
        )

    # --------------------------------------------------------
    # BUDGET TOTALS
    # --------------------------------------------------------

    total_budget = 0.0
    total_budget_spent = 0.0
    total_budget_remaining = 0.0

    formatted_budgets = []

    # --------------------------------------------------------
    # EACH BUDGET
    # --------------------------------------------------------

    for budget in budgets:

        category = budget[2]
        budget_amount = float(budget[3])

        spent = 0.0

        for (
            expense_category,
            expense_amount
        ) in spending_by_category.items():

            if (
                expense_category.lower()
                == category.lower()
            ):
                spent = expense_amount
                break

        remaining = (
            budget_amount - spent
        )

        if budget_amount > 0:

            usage_percentage = (
                spent / budget_amount
            ) * 100

        else:

            usage_percentage = 0.0

        # ----------------------------------------------------
        # BUDGET STATUS
        # ----------------------------------------------------

        if usage_percentage >= 100:

            status = "overspent"

        elif usage_percentage >= 80:

            status = "warning"

        else:

            status = "on_track"

        # ----------------------------------------------------
        # TOTALS
        # ----------------------------------------------------

        total_budget += budget_amount

        total_budget_spent += spent

        total_budget_remaining += remaining

        # ----------------------------------------------------
        # FORMAT BUDGET
        # ----------------------------------------------------

        formatted_budgets.append({
            "category": category,
            "budget": budget_amount,
            "spent": spent,
            "remaining": remaining,
            "usage_percentage": usage_percentage,
            "status": status
        })

    # --------------------------------------------------------
    # RETURN BUDGET DASHBOARD
    # --------------------------------------------------------

    return {
        "user_id": user_id,
        "month": month,
        "income_recorded": income_value is not None,
        "income": income,
        "total_expenses": total_expenses,
        "balance": balance,
        "total_budget": total_budget,
        "total_budget_spent": total_budget_spent,
        "total_budget_remaining": total_budget_remaining,
        "budgets": formatted_budgets
    }