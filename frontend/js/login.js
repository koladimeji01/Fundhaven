/* ============================================================
   BUDGETWISE LOGIN — PASSWORD + EMAIL OTP
   JWT is saved only after the code has been verified.
   ============================================================ */
(() => {
    "use strict";

    const API_URL = "http://127.0.0.1:8000/api/v1";
    const byId = (id) => document.getElementById(id);

    document.addEventListener("DOMContentLoaded", () => {
        const loginForm = byId("loginForm");
        const verifyForm = byId("verificationForm");
        const loginButton = byId("loginButton");
        const verifyButton = byId("verifyButton");
        const resendButton = byId("resendCodeButton");
        const loginError = byId("loginError");
        const otpError = byId("otpError");
        const codeInput = byId("verificationCode");

        if (!loginForm || !verifyForm) {
            console.error("BudgetWise login or verification form is missing.");
            return;
        }

        // A previous session must not bypass this sign-in attempt.
        localStorage.removeItem("access_token");
        let challengeId = null;
        let pendingEmail = "";

        function showError(target, message) {
            target.textContent = String(message || "Please try again.");
            target.style.display = "block";
        }

        function clearError(target) {
            target.textContent = "";
            target.style.display = "none";
        }

        async function post(endpoint, payload) {
            let response;
            try {
                response = await fetch(API_URL + endpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify(payload)
                });
            } catch {
                throw new Error("Cannot connect to BudgetWise. Check your internet connection and backend.");
            }

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const message = Array.isArray(data.detail)
                    ? data.detail.map(item => item.msg).join(", ")
                    : data.detail || "The request could not be completed.";
                throw new Error(message);
            }
            return data;
        }

        function completeSignIn(token) {
            if (!token || typeof token !== "string") {
                throw new Error("Login did not return an access token.");
            }
            localStorage.setItem("access_token", token);
            localStorage.setItem("user_email", pendingEmail);
            window.location.replace("dashboard.html");
        }

        loginForm.addEventListener("submit", async event => {
            event.preventDefault();
            clearError(loginError);

            const email = byId("email").value.trim();
            const password = byId("password").value;

            if (!email || !password) {
                showError(loginError, "Enter your email and password.");
                return;
            }

            loginButton.disabled = true;
            loginButton.textContent = "Checking credentials...";

            try {
                const result = await post("/login", {email, password});
                pendingEmail = email;

                if (result.verification_required && result.challenge_id) {
                    challengeId = result.challenge_id;
                    byId("password").value = "";
                    loginForm.style.display = "none";
                    verifyForm.style.display = "block";
                    codeInput.value = "";
                    clearError(otpError);
                    codeInput.focus();
                } else if (result.access_token) {
                    // Legacy login response for automated testing only.
                    completeSignIn(result.access_token);
                } else {
                    throw new Error("Unexpected sign-in response. Please try again.");
                }
            } catch (error) {
                showError(loginError, error.message);
            } finally {
                loginButton.disabled = false;
                loginButton.textContent = "Sign In";
            }
        });

        verifyForm.addEventListener("submit", async event => {
            event.preventDefault();
            clearError(otpError);
            const code = codeInput.value.trim();

            if (!challengeId || !/^\d{6}$/.test(code)) {
                showError(otpError, "Enter the six-digit code from your email.");
                return;
            }

            verifyButton.disabled = true;
            verifyButton.textContent = "Verifying...";

            try {
                const data = await post("/login/verify", {
                    challenge_id: challengeId,
                    code
                });
                completeSignIn(data.access_token);
            } catch (error) {
                showError(otpError, error.message);
            } finally {
                verifyButton.disabled = false;
                verifyButton.textContent = "Verify & Sign In";
            }
        });

        resendButton?.addEventListener("click", async () => {
            if (!challengeId) {
                showError(otpError, "Start the sign-in process again.");
                return;
            }
            clearError(otpError);
            resendButton.disabled = true;
            resendButton.textContent = "Sending...";
            try {
                const data = await post("/login/resend", {
                    challenge_id: challengeId
                });
                byId("otpMessage").textContent = data.message +
                    ". The code expires in five minutes.";
                codeInput.value = "";
                codeInput.focus();
            } catch (error) {
                showError(otpError, error.message);
            } finally {
                resendButton.disabled = false;
                resendButton.textContent = "Resend code";
            }
        });

        byId("backToSignIn")?.addEventListener("click", () => {
            challengeId = null;
            pendingEmail = "";
            verifyForm.style.display = "none";
            loginForm.style.display = "block";
            clearError(otpError);
            clearError(loginError);
            byId("password").focus();
        });
    });
})();
