from app import database

from app.expenses import (
    add_expense,
    view_expenses,
    update_expense,
    delete_expense
)

from app.reports import (
    total_expenses,
    show_balance,
    financial_dashboard
)

from app.utils import (
    get_valid_amount,
    get_valid_text
)


# ==========================================
# DATABASE
# ==========================================

database.create_tables()


# ==========================================
# HEADER
# ==========================================

print("==============================")
print("       FUNDHAVEN")
print("==============================")
print()


# ==========================================
# CREATE USER
# ==========================================

name = get_valid_text(
    "What is your name? "
)

income = get_valid_amount(
    "What is your monthly income? ₦"
)


# Save user to database
user_id = database.create_user(
    name,
    income
)


print()

print(
    f"Welcome, {name}!"
)

print(
    f"Your monthly income is "
    f"₦{income:,.2f}"
)


# ==========================================
# MAIN MENU
# ==========================================

while True:

    print("\n--------- MENU ---------")

    print("1. Add Expense")
    print("2. View Expenses")
    print("3. Update Expense")
    print("4. Delete Expense")
    print("5. View Total Expenses")
    print("6. View Balance")
    print("7. Financial Dashboard")
    print("8. Exit")

    choice = input(
        "Choose an option: "
    ).strip()

    if choice == "1":

        add_expense(user_id)

    elif choice == "2":

        view_expenses(user_id)

    elif choice == "3":

        update_expense(user_id)

    elif choice == "4":

        delete_expense(user_id)

    elif choice == "5":

        total = total_expenses(
            user_id
        )

        print(
            f"Total expenses: "
            f"₦{total:,.2f}"
        )

    elif choice == "6":

        show_balance(
            user_id,
            income
        )

    elif choice == "7":

        financial_dashboard(
            user_id,
            income
        )

    elif choice == "8":

        print(
            "\nThank you for using "
            "FundHaven!"
        )

        break

    else:

        print(
            "❌ Invalid option. "
            "Please choose a number "
            "from 1 to 8."
        )