const API_URL = "http://127.0.0.1:8000/api/v1";

const form = document.getElementById("registerForm");
const registerButton = document.getElementById("registerButton");
const errorMessage = document.getElementById("registerError");
const successMessage = document.getElementById("registerSuccess");


function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = "block";
    successMessage.style.display = "none";
}


function showSuccess(message) {
    successMessage.textContent = message;
    successMessage.style.display = "block";
    errorMessage.style.display = "none";
}


form.addEventListener("submit", async function (event) {

    event.preventDefault();

    errorMessage.style.display = "none";
    successMessage.style.display = "none";

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const income = Number(document.getElementById("income").value);
    const password = document.getElementById("password").value;
    const confirmPassword =
        document.getElementById("confirmPassword").value;


    if (password !== confirmPassword) {
        showError("Passwords do not match.");
        return;
    }


    if (password.length < 8) {
        showError("Password must contain at least 8 characters.");
        return;
    }


    if (income <= 0) {
        showError("Monthly income must be greater than zero.");
        return;
    }


    registerButton.disabled = true;
    registerButton.textContent = "Creating account...";


    try {

        const response = await fetch(`${API_URL}/users`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                name: name,
                email: email,
                income: income,
                password: password
            })

        });


        const data = await response.json();


        if (!response.ok) {

            let message = "Registration failed.";

            if (Array.isArray(data.detail)) {
                message = data.detail
                    .map(error => error.msg)
                    .join(", ");
            } else if (data.detail) {
                message = data.detail;
            }

            throw new Error(message);
        }


        showSuccess(
            "Account created successfully! Redirecting to login..."
        );


        localStorage.setItem("user_name", data.name);
        localStorage.setItem("user_email", data.email);


        setTimeout(() => {
            window.location.href = "login.html";
        }, 1200);


    } catch (error) {

        console.error("Registration error:", error);

        showError(
            error.message ||
            "Unable to create your account. Please try again."
        );

    } finally {

        registerButton.disabled = false;
        registerButton.textContent = "Create Account";

    }

});