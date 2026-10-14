/* ============================================================
   BUDGETWISE LOGIN — EMAIL OR USERNAME + PASSWORD
   Backend checks the password and returns a JWT directly.
   No OTP, Brevo dependency, or verification-code step.
   ============================================================ */
(() => {
    "use strict";

    const API_URL = (
        window.BUDGETWISE_API_BASE_URL ||
        "http://127.0.0.1:8000/api/v1"
    );

    const byId = id => document.getElementById(id);

    document.addEventListener("DOMContentLoaded", () => {
        const loginForm = byId("loginForm");
        const loginButton = byId("loginButton");
        const loginError = byId("loginError");

        if (!loginForm || !loginButton || !loginError) {
            console.error("BudgetWise login form is missing required elements.");
            return;
        }

        function showError(message) {
            loginError.textContent = String(message || "Please try again.");
            loginError.style.display = "block";
        }

        function clearError() {
            loginError.textContent = "";
            loginError.style.display = "none";
        }

        loginForm.addEventListener("submit", async event => {
            event.preventDefault();
            clearError();

            const email = byId("email")?.value.trim() || "";
            const password = byId("password")?.value || "";

            if (!email || !password) {
                showError("Enter your email and password.");
                return;
            }

            loginButton.disabled = true;
            loginButton.textContent = "Signing in...";

            try {
                let response;
                try {
                    response = await fetch(API_URL + "/login", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Accept": "application/json"
                        },
                        body: JSON.stringify({email, password})
                    });
                } catch {
                    throw new Error(
                        "Cannot connect to BudgetWise. Check your internet connection and backend."
                    );
                }

                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const detail = Array.isArray(data.detail)
                        ? data.detail.map(item => item.msg).join(", ")
                        : data.detail;
                    throw new Error(detail || "Sign in failed. Please try again.");
                }

                if (!data.access_token || typeof data.access_token !== "string") {
                    throw new Error("Login did not return an access token.");
                }

                // Clear data from an older session before setting this one.
                ["access_token", "user_email", "user_name", "user_id"]
                    .forEach(key => localStorage.removeItem(key));

                localStorage.setItem("access_token", data.access_token);
                localStorage.setItem("user_email", email);

                window.location.replace("dashboard.html");
            } catch (error) {
                showError(error.message);
            } finally {
                loginButton.disabled = false;
                loginButton.textContent = "Sign In";
            }
        });
    });
})();
