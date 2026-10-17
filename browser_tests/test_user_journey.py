"""Real browser journey; refuses to run against production data or databases."""
import os
import uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

SITE = "http://127.0.0.1:5500"
API = "http://127.0.0.1:8000/api/v1"


def test_fundhaven_browser_journey():
    assert os.getenv("ENVIRONMENT") == "testing", "Only run on isolated testing environment"
    assert not os.getenv("DATABASE_URL"), "Postgres/production URLs are prohibited"
    assert os.getenv("DATABASE_NAME", "") == "ci_browser_fundhaven.sqlite3"
    unique = uuid.uuid4().hex[:8]
    username = "Browser QA " + unique
    email = "browser_" + unique + "@example.com"
    password = "LocalOnlyTestPass123!"
    description = "QA grocery purchase " + unique
    goal = "QA laptop plan " + unique

    with sync_playwright() as engine:
        browser = engine.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.set_default_timeout(16000)
        try:
            page.goto(SITE + "/register.html")
            page.locator("#name").fill(username)
            page.locator("#email").fill(email)
            page.locator("#income").fill("240000")
            page.locator("#password").fill(password)
            page.locator("#confirmPassword").fill(password)
            with page.expect_response(lambda r: r.url == API + "/users" and r.request.method == "POST") as created:
                page.locator("#registerButton").click()
            assert created.value.status == 200
            page.wait_for_url("**/login.html", timeout=20000)

            page.locator("#email").fill(email)
            page.locator("#password").fill(password)
            with page.expect_response(lambda r: r.url == API + "/login" and r.request.method == "POST") as logged:
                page.locator("#loginButton").click()
            assert logged.value.status == 200
            page.wait_for_url("**/dashboard.html", timeout=20000)
            token = page.evaluate("localStorage.getItem('access_token')")
            assert token, "Browser login did not save the JWT"

            page.goto(SITE + "/transactions.html")
            page.locator("#openAddExpense").first.click()
            expect(page.locator("#expenseForm")).to_be_visible()
            page.locator("#expenseAmount").fill("1234.50")
            page.locator("#expenseCategory").select_option("Food")
            page.locator("#expenseDescription").fill(description)
            with page.expect_response(lambda r: r.url == API + "/expenses" and r.request.method == "POST") as saved:
                page.locator('#expenseForm button[type="submit"]').click()
            assert saved.value.status == 200
            expect(page.locator("#transactionsContent")).to_contain_text(description, timeout=16000)
            expect(page.locator("#transactionCount")).to_contain_text("1 transaction")
            records = page.request.get(API + "/expenses", headers={"Authorization": "Bearer " + token})
            assert records.status == 200
            assert any(r["description"] == description and abs(r["amount"] - 1234.5) < 0.001 for r in records.json()["expenses"])

            page.goto(SITE + "/budgets.html")
            page.locator("#addBudgetBtn").click()
            expect(page.locator("#budgetForm")).to_be_visible()
            page.locator("#budgetCategory").fill("Food")
            page.locator("#budgetAmount").fill("50000")
            with page.expect_response(lambda r: r.url == API + "/budgets" and r.request.method == "POST") as budget:
                page.locator("#saveBudgetBtn").click()
            assert budget.value.status == 200
            expect(page.locator("#budgetList")).to_contain_text("Food", timeout=16000)

            page.goto(SITE + "/goals.html")
            page.locator("#addGoalBtn").click()
            expect(page.locator("#goalForm")).to_be_visible()
            page.locator("#goalName").fill(goal)
            page.locator("#targetAmount").fill("100000")
            page.locator("#currentAmount").fill("10000")
            page.locator("#targetDate").fill("2027-12-01")
            with page.expect_response(lambda r: r.url == API + "/goals" and r.request.method == "POST") as goal_response:
                page.locator('#goalForm button[type="submit"]').click()
            assert goal_response.value.status == 200
            expect(page.locator("#goalsList")).to_contain_text(goal, timeout=16000)

            page.goto(SITE + "/dashboard.html")
            expect(page.locator("#expenses")).to_contain_text("1,235", timeout=16000)
            page.goto(SITE + "/reports.html")
            expect(page.locator("body")).to_contain_text("Reports")
            page.goto(SITE + "/settings.html")
            expect(page.locator("#profileName")).to_have_value(username, timeout=16000)

            page.set_viewport_size({"width": 390, "height": 844})
            page.goto(SITE + "/transactions.html")
            expect(page.locator("#openAddExpense").first).to_be_visible()
            expect(page.locator("#transactionsContent")).to_contain_text(description)
            page.evaluate("localStorage.removeItem('access_token')")
            page.goto(SITE + "/goals.html")
            page.wait_for_url("**/login.html")
        except Exception:
            output = Path("browser_tests/artifacts")
            output.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(output / "failure.png"), full_page=True)
            raise
        finally:
            browser.close()
