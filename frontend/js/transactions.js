const API_URL = (window.BUDGETWISE_API_BASE_URL || "http://127.0.0.1:8000/api/v1");

let allTransactions = [];

let transactionSearch = "";

let transactionCategory = "";

// ============================================================
// AUTHENTICATION
// ============================================================

function getToken() {
    return localStorage.getItem("access_token");
}

function logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_name");
    localStorage.removeItem("user_id");

    window.location.replace("login.html");
}
function getHeaders() {
    const token = getToken();

    const headers = {
        "Content-Type": "application/json",
        Accept: "application/json"
    };

    if (token) {
        headers.Authorization = "Bearer " + token;
    }

    return headers;
}

// ============================================================
// API REQUEST
// ============================================================

async function apiRequest(endpoint, options = {}) {
    const token = getToken();

    if (!token) {
        logout();
        return null;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            ...getHeaders(),
            ...(options.headers || {})
        }
    });

    if (response.status === 401) {
        logout();
        return null;
    }

    let data = null;

    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        let message = "Something went wrong. Please try again.";

        if (Array.isArray(data?.detail)) {
            message = data.detail
                .map((error) => error.msg || error.message || "Invalid input")
                .join(", ");
        } else if (typeof data?.detail === "string") {
            message = data.detail;
        } else if (typeof data?.message === "string") {
            message = data.message;
        }

        throw new Error(message);
    }

    return data;
}

// ============================================================
// FORMATTING
// ============================================================

function formatNaira(amount) {
    return window.BudgetWiseCurrency.format(amount);
}

function formatDate(dateValue) {
    if (!dateValue) {
        return "—";
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return String(dateValue);
    }

    return date.toLocaleDateString("en-NG", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function getInitials(name) {
    if (!name) {
        return "BW";
    }

    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ============================================================
// CATEGORY ICONS
// ============================================================

function getCategoryIcon(category) {
    const value = String(category || "").toLowerCase().trim();

    // Food
    if (
        value === "food" ||
        value.includes("restaurant") ||
        value.includes("meal")
    ) {
        return "utensils";
    }

    // Groceries
    if (
        value === "groceries" ||
        value.includes("grocery")
    ) {
        return "shopping-basket";
    }

    // Fuel
    if (
        value === "fuel" ||
        value.includes("petrol") ||
        value.includes("gas")
    ) {
        return "fuel";
    }

    // Transport
    if (
        value === "transport" ||
        value.includes("uber") ||
        value.includes("taxi") ||
        value.includes("bus") ||
        value.includes("car")
    ) {
        return "car-front";
    }

    // Shopping
    if (
        value === "shopping" ||
        value.includes("cloth") ||
        value.includes("fashion")
    ) {
        return "shopping-bag";
    }

    // Bills
    if (
        value === "bills" ||
        value === "bill" ||
        value.includes("utility") ||
        value.includes("electric") ||
        value.includes("internet") ||
        value.includes("data")
    ) {
        return "receipt-text";
    }

    // Rent
    if (
        value === "rent" ||
        value.includes("house") ||
        value.includes("apartment") ||
        value.includes("home")
    ) {
        return "house";
    }

    // Health
    if (
        value === "health" ||
        value.includes("medical") ||
        value.includes("pharmacy") ||
        value.includes("hospital")
    ) {
        return "heart-pulse";
    }

    // Education
    if (
        value === "education" ||
        value.includes("school") ||
        value.includes("tuition") ||
        value.includes("course")
    ) {
        return "graduation-cap";
    }

    // Entertainment
    if (
        value === "entertainment" ||
        value.includes("movie") ||
        value.includes("cinema") ||
        value.includes("game") ||
        value.includes("fun")
    ) {
        return "clapperboard";
    }

    // Other
    return "wallet";
}

// ============================================================
// UI HELPERS
// ============================================================

function renderEmptyState(message, detailedMessage) {
    const container = document.getElementById("transactionsContent");

    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">
                <i data-lucide="receipt"></i>
            </div>

            <h3>${escapeHtml(message)}</h3>

            <p>${escapeHtml(detailedMessage)}</p>
        </div>
    `;

    if (window.lucide) {
        lucide.createIcons();
    }
}

function setupMobileMenu() {
    const menuButton = document.getElementById("mobileMenu");
    const sidebar = document.getElementById("sidebar");

    if (!menuButton || !sidebar) {
        return;
    }

    menuButton.addEventListener("click", () => {
        sidebar.classList.toggle("open");
    });
}

function setupSearch() {
    const searchInput = document.getElementById("transactionSearch");

    if (!searchInput) {
        return;
    }

    searchInput.addEventListener("input", (event) => {
        transactionSearch = event.target.value.trim().toLowerCase();

        renderTransactions();
    });
}

function setupCategoryFilter() {
    const filter = document.getElementById("categoryFilter");

    if (!filter) {
        return;
    }

    filter.addEventListener("change", (event) => {
        transactionCategory = String(
            event.target.value || ""
        ).toLowerCase();

        renderTransactions();
    });
}

function setupAddExpenseButton() {
    const button = document.getElementById("openAddExpense");

    if (!button) {
        return;
    }

    button.onclick = null;

    button.addEventListener("click", openExpenseForm);
}

function showToast(message, type = "success") {
    const existingToast = document.getElementById("budgetwiseToast");

    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement("div");

    toast.id = "budgetwiseToast";

    toast.style.position = "fixed";
    toast.style.right = "20px";
    toast.style.bottom = "20px";
    toast.style.padding = "12px 16px";
    toast.style.borderRadius = "10px";
    toast.style.fontSize = "13px";
    toast.style.fontWeight = "600";
    toast.style.boxShadow =
        "0 10px 24px rgba(15, 23, 42, 0.16)";
    toast.style.zIndex = "1000";
    toast.style.color = "#fff";
    toast.style.background =
        type === "error" ? "#c53030" : "#0b3d2e";

    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 2200);
}

// ============================================================
// LOAD USER
// ============================================================


async function loadUser() {
    try {
        const user = await apiRequest("/users/me");

        if (!user) {
            return;
        }

        const name = String(user.name || "").trim();
        const email = String(user.email || "").trim();

        // Update stored profile values only when the API returns them.
        if (name) {
            localStorage.setItem("user_name", name);
        }

        if (email) {
            localStorage.setItem("user_email", email);
        }

        const displayName =
            name || localStorage.getItem("user_name") || "User";

        const displayEmail =
            email || localStorage.getItem("user_email") || "";

        const initials = getInitials(displayName);

        const sidebarUserName =
            document.getElementById("sidebarUserName");

        const sidebarUserEmail =
            document.getElementById("sidebarUserEmail");

        const sidebarAvatar =
            document.getElementById("sidebarAvatar");

        const topUserName =
            document.getElementById("topUserName");

        const topAvatar =
            document.getElementById("topAvatar");

        if (sidebarUserName) {
            sidebarUserName.textContent = displayName;
            sidebarUserName.title = displayName;
        }

        if (sidebarUserEmail) {
            sidebarUserEmail.textContent = displayEmail;
            sidebarUserEmail.title = displayEmail;
        }

        if (sidebarAvatar) {
            sidebarAvatar.textContent = initials;
            sidebarAvatar.setAttribute(
                "aria-label",
                `${displayName} profile initials`
            );
        }

        if (topUserName) {
            topUserName.textContent = displayName;
        }

        if (topAvatar) {
            topAvatar.textContent = initials;
            topAvatar.setAttribute(
                "aria-label",
                `${displayName} profile initials`
            );
        }
    } catch (error) {
        console.error("Error loading user:", error);
    }
}

// ============================================================
// RENDER TRANSACTIONS
// ============================================================

function renderTransactions() {
    const container =
        document.getElementById("transactionsContent");

    const countElement =
        document.getElementById("transactionCount");

    if (!container) {
        return;
    }

    const filteredTransactions = allTransactions.filter(
        (transaction) => {
            const categoryValue =
                String(transaction.category || "").toLowerCase();

            const descriptionValue =
                String(transaction.description || "").toLowerCase();

            const searchValue =
                String(transaction.amount || "").toLowerCase();

            const matchesCategory =
                !transactionCategory ||
                categoryValue.includes(transactionCategory);

            const matchesSearch =
                !transactionSearch ||
                categoryValue.includes(transactionSearch) ||
                descriptionValue.includes(transactionSearch) ||
                searchValue.includes(transactionSearch);

            return matchesCategory && matchesSearch;
        }
    );

    if (countElement) {
        const transactionLabel =
            filteredTransactions.length === 1
                ? "transaction"
                : "transactions";

        countElement.textContent =
            `${filteredTransactions.length} ${transactionLabel}`;
    }

    if (!filteredTransactions.length) {
        renderEmptyState(
            "No transactions found",
            "Try changing your search or add a new expense."
        );

        return;
    }

    const rows = filteredTransactions
        .map((transaction) => {
            const id = Number(transaction.id);

            const description =
                transaction.description || "No description";

            const category =
                transaction.category || "Other";

            const dateValue =
                transaction.date ||
                transaction.created_at ||
                "";

            return `
                <tr>
                    <td>
                        <div class="transaction-category">

                            <div class="transaction-category-icon">
                                <i
                                    data-lucide="${getCategoryIcon(category)}"
                                    aria-hidden="true"
                                ></i>
                            </div>

                            <div>
                                <div class="transaction-category-name">
                                    ${escapeHtml(category)}
                                </div>

                                <div class="transaction-description">
                                    ${escapeHtml(description)}
                                </div>
                            </div>

                        </div>
                    </td>

                    <td class="transaction-date">
                        ${escapeHtml(formatDate(dateValue))}
                    </td>

                    <td class="transaction-amount">
                        ${escapeHtml(formatNaira(transaction.amount))}
                    </td>

                    <td>
                        <button
                            class="delete-btn"
                            type="button"
                            data-id="${escapeHtml(id)}"
                            aria-label="Delete expense"
                        >
                            <i data-lucide="trash-2"></i>
                            <span>Delete</span>
                        </button>
                    </td>
                </tr>
            `;
        })
        .join("");

    container.innerHTML = `
        <div class="table-wrapper">

            <table class="transactions-table">

                <thead>
                    <tr>
                        <th>Expense</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Action</th>
                    </tr>
                </thead>

                <tbody>
                    ${rows}
                </tbody>

            </table>

        </div>
    `;

    container
        .querySelectorAll(".delete-btn")
        .forEach((button) => {
            button.addEventListener("click", async () => {
                const expenseId =
                    Number(button.dataset.id);

                if (!expenseId) {
                    return;
                }

                await deleteTransaction(expenseId);
            });
        });

    if (window.lucide) {
        lucide.createIcons();
    }
}

// ============================================================
// LOAD TRANSACTIONS
// ============================================================

async function loadTransactions() {
    const container =
        document.getElementById("transactionsContent");

    if (!container) {
        return;
    }

    try {
        const data = await apiRequest("/expenses");

        allTransactions =
            Array.isArray(data?.expenses)
                ? data.expenses
                : [];

        renderTransactions();
    } catch (error) {
        console.error(
            "Error loading transactions:",
            error
        );

        renderEmptyState(
            "Unable to load transactions",
            error.message ||
                "Please try again later."
        );
    }
}

// ============================================================
// DELETE TRANSACTION
// ============================================================

async function deleteTransaction(expenseId) {
    const confirmed = window.confirm(
        "Are you sure you want to delete this expense?"
    );

    if (!confirmed) {
        return;
    }

    try {
        await apiRequest(`/expenses/${expenseId}`, {
            method: "DELETE"
        });

        await loadTransactions();

        showToast("Expense deleted successfully.");
    } catch (error) {
        console.error(
            "Delete expense error:",
            error
        );

        showToast(
            error.message ||
                "Unable to delete expense.",
            "error"
        );
    }
}

// ============================================================
// EXPENSE FORM
// ============================================================

function openExpenseForm() {
    const existingModal =
        document.getElementById("expenseModal");

    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement("div");

    modal.id = "expenseModal";

    modal.style.position = "fixed";
    modal.style.inset = "0";
    modal.style.background =
        "rgba(15, 23, 42, 0.48)";
    modal.style.display = "flex";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.zIndex = "1000";
    modal.style.padding = "16px";

    modal.innerHTML = `
        <div style="width: min(100%, 500px); background: white; border-radius: 16px; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28); overflow: hidden;">

            <div style="display:flex; align-items:center; justify-content:space-between; padding: 18px 20px; border-bottom:1px solid #edf1ef;">

                <h3 style="margin:0; font-size: 22px; color:#17221e;">
                    Add Expense
                </h3>

                <button
                    type="button"
                    id="closeExpenseModal"
                    style="border:none; background:#f1f5f3; width: 36px; height:36px; border-radius:10px; font-size: 20px; cursor:pointer;"
                >
                    ×
                </button>

            </div>

            <form
                id="expenseForm"
                style="padding: 20px; display: grid; gap: 16px;"
            >

                <div>

                    <label
                        for="expenseAmount"
                        style="display:block; margin-bottom:6px; font-size:13px; font-weight:600; color:#374151;"
                    >
                        Amount
                    </label>

                    <input
                        id="expenseAmount"
                        name="amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        style="width:100%; box-sizing:border-box; height:44px; border:1px solid #dfe7e3; border-radius:10px; padding:0 12px; font-size:14px;"
                        placeholder="0.00"
                    />

                </div>

                <div>

                    <label
                        for="expenseCategory"
                        style="display:block; margin-bottom:6px; font-size:13px; font-weight:600; color:#374151;"
                    >
                        Category
                    </label>

                    <select
                        id="expenseCategory"
                        name="category"
                        required
                        style="width:100%; box-sizing:border-box; height:44px; border:1px solid #dfe7e3; border-radius:10px; padding:0 12px; font-size:14px; background:#fff;"
                    >
                        <option value="">Select Category</option>
                        <option value="Food">Food</option>
                        <option value="Groceries">Groceries</option>
                        <option value="Fuel">Fuel</option>
                        <option value="Transport">Transport</option>
                        <option value="Shopping">Shopping</option>
                        <option value="Bills">Bills</option>
                        <option value="Rent">Rent</option>
                        <option value="Health">Health</option>
                        <option value="Education">Education</option>
                        <option value="Entertainment">Entertainment</option>
                        <option value="Other">Other</option>
                    </select>

                </div>

                <div>

                    <label
                        for="expenseDescription"
                        style="display:block; margin-bottom:6px; font-size:13px; font-weight:600; color:#374151;"
                    >
                        Description
                    </label>

                    <textarea
                        id="expenseDescription"
                        name="description"
                        rows="4"
                        required
                        style="width:100%; box-sizing:border-box; resize:vertical; border:1px solid #dfe7e3; border-radius:10px; padding:10px 12px; font-size:14px;"
                        placeholder="What did you spend on?"
                    ></textarea>

                </div>

                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top: 4px;">

                    <button
                        type="button"
                        id="cancelExpenseModal"
                        style="border:1px solid #dfe7e3; background:#fff; color:#17221e; border-radius:10px; padding:10px 16px; font-weight:600; cursor:pointer;"
                    >
                        Cancel
                    </button>

                    <button
                        type="submit"
                        style="border:none; border-radius:10px; padding:10px 18px; background:#0b3d2e; color:#fff; font-weight:700; cursor:pointer;"
                    >
                        Save Expense
                    </button>

                </div>

            </form>

        </div>
    `;

    document.body.appendChild(modal);

    document
        .getElementById("closeExpenseModal")
        .addEventListener("click", () => {
            modal.remove();
        });

    document
        .getElementById("cancelExpenseModal")
        .addEventListener("click", () => {
            modal.remove();
        });

    modal.addEventListener("click", (event) => {
        if (event.target === modal) {
            modal.remove();
        }
    });

    const form =
        document.getElementById("expenseForm");

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const formData = new FormData(form);

        const amount =
            Number(formData.get("amount"));

        const category =
            String(
                formData.get("category") || ""
            ).trim();

        const description =
            String(
                formData.get("description") || ""
            ).trim();

        if (!amount || amount <= 0) {
            showToast(
                "Please enter a valid amount.",
                "error"
            );

            return;
        }

        if (!category || !description) {
            showToast(
                "Category and description are required.",
                "error"
            );

            return;
        }

        try {
            await apiRequest("/expenses", {
                method: "POST",
                body: JSON.stringify({
                    amount,
                    category,
                    description
                })
            });

            modal.remove();

            await loadTransactions();

            showToast(
                "Expense added successfully."
            );
        } catch (error) {
            showToast(
                error.message ||
                    "Unable to add expense.",
                "error"
            );
        }
    });
}

// ============================================================
// INITIALIZE
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {
        if (!getToken()) {
            window.location.href = "login.html";
            return;
        }

        setupMobileMenu();
        setupSearch();
        setupCategoryFilter();
        setupAddExpenseButton();

        await loadUser();
        await loadTransactions();

        if (window.lucide) {
            lucide.createIcons();
        }
    }
);
// Re-render stored NGN expense rows when FX rates finish loading.
window.addEventListener("budgetwise:currency-ready", () => {
    if (allTransactions.length) renderTransactions();
});
