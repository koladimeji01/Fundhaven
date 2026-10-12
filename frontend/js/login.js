const API_URL = "http://127.0.0.1:8000/api/v1";


document.addEventListener("DOMContentLoaded", function () {

    const form = document.getElementById("loginForm");
    const loginButton = document.getElementById("loginButton");
    const errorMessage = document.getElementById("loginError");


    // Make sure the form exists
    if (!form) {
        console.error("Login form was not found.");
        return;
    }


    console.log("BudgetWise login page loaded.");


    form.addEventListener("submit", async function (event) {

        event.preventDefault();

        console.log("Sign In button clicked.");


        errorMessage.style.display = "none";
        errorMessage.textContent = "";


        const email =
            document.getElementById("email").value.trim();

        const password =
            document.getElementById("password").value;


        if (!email || !password) {

            errorMessage.textContent =
                "Please enter your email and password.";

            errorMessage.style.display = "block";

            return;
        }


        loginButton.disabled = true;
        loginButton.textContent = "Signing in...";


        try {

            console.log("Sending login request...");


            const response = await fetch(
                `${API_URL}/login`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },

                    body: JSON.stringify({
                        email: email,
                        password: password
                    })
                }
            );


            console.log(
                "Server response:",
                response.status
            );


            const data = await response.json();


            console.log("Server data:", data);


            if (!response.ok) {

                let message = "Login failed.";

                if (Array.isArray(data.detail)) {

                    message = data.detail
                        .map(error => error.msg)
                        .join(", ");

                } else if (data.detail) {

                    message = data.detail;

                }

                throw new Error(message);
            }


            if (!data.access_token) {

                throw new Error(
                    "Login succeeded but no access token was returned."
                );

            }


            // Save token
            localStorage.setItem(
                "access_token",
                data.access_token
            );


            // Save email
            localStorage.setItem(
                "user_email",
                email
            );


            console.log("Login successful.");
            console.log(
                "Access token saved:",
                localStorage.getItem("access_token")
            );


            // Redirect
            window.location.href =
                "dashboard.html";

        }

        catch (error) {

            console.error(
                "Login error:",
                error
            );


            errorMessage.textContent =
                error.message ||
                "Unable to login. Please try again.";


            errorMessage.style.display =
                "block";

        }

        finally {

            loginButton.disabled = false;

            loginButton.textContent =
                "Sign In";

        }

    });

});