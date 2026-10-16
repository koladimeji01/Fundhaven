const API_URL = (window.BUDGETWISE_API_BASE_URL || "http://127.0.0.1:8000/api/v1");

let allBudgets = [];
let allExpenses = [];
let editingBudgetId = null;


// ============================================================
// AUTH
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


// ============================================================
// API REQUEST
// ============================================================

async function apiRequest(endpoint, options = {}) {

    const token = getToken();

    if (!token) {
        logout();
        return null;
    }

    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    headers["Authorization"] = `Bearer ${token}`;

    try {

        const response = await fetch(
            `${API_URL}${endpoint}`,
            {
                ...options,
                headers
            }
        );

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

            const message =
                data?.detail ||
                data?.message ||
                "Something went wrong.";

            throw new Error(message);
        }

        return data;

    } catch (error) {

        console.error(
            `API request failed: ${endpoint}`,
            error
        );

        throw error;
    }
}


// ============================================================
// HELPERS
// ============================================================

function formatCurrency(amount) {
    return window.BudgetWiseCurrency.format(amount);
}


function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function refreshIcons() {

    if (window.lucide) {
        lucide.createIcons();
    }
}


function showToast(message, type = "success") {

    const toast = document.getElementById("toast");

    if (!toast) {
        return;
    }

    toast.textContent = message;

    toast.classList.remove("error");

    if (type === "error") {
        toast.classList.add("error");
    }

    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}


// ============================================================
// LOAD USER
// ============================================================

async function loadUser() {

    try {

        const data = await apiRequest("/users/me");

        if (!data) {
            return;
        }

        const name =
            data.name ||
            data.username ||
            "User";

        const userName =
            document.getElementById("userName");

        const avatar =
            document.getElementById("userAvatar");

        if (userName) {
            userName.textContent = name;
        }

        if (avatar) {

            avatar.textContent =
                name
                    .trim()
                    .charAt(0)
                    .toUpperCase();
        }

    } catch (error) {

        console.error(
            "Failed to load user:",
            error
        );
    }
}


// ============================================================
// LOAD EXPENSES
// ============================================================

async function loadExpenses() {

    try {

        const data =
            await apiRequest("/expenses");

        if (!data) {
            return;
        }

        if (Array.isArray(data)) {

            allExpenses = data;

        } else if (Array.isArray(data.expenses)) {

            allExpenses = data.expenses;

        } else {

            allExpenses = [];
        }

        console.log(
            "Expenses loaded:",
            allExpenses
        );

    } catch (error) {

        console.error(
            "Failed to load expenses:",
            error
        );

        allExpenses = [];
    }
}


// ============================================================
// LOAD BUDGETS
// ============================================================

async function loadBudgets() {

    try {

        const data =
            await apiRequest("/budgets");

        if (!data) {
            return;
        }

        console.log(
            "Budgets API response:",
            data
        );

        if (Array.isArray(data)) {

            allBudgets = data;

        } else if (Array.isArray(data.budgets)) {

            allBudgets = data.budgets;

        } else {

            allBudgets = [];
        }

        console.log(
            "Budgets loaded:",
            allBudgets
        );

        renderBudgets();

    } catch (error) {

        console.error(
            "Failed to load budgets:",
            error
        );

        allBudgets = [];

        renderBudgets();

        showToast(
            error.message || "Unable to load budgets.",
            "error"
        );
    }
}


// ============================================================
// NORMALIZE BUDGET
// ============================================================

function normalizeBudget(budget) {

    if (!budget) {
        return null;
    }

    return {
        id:
            budget.id ??
            budget.budget_id,

        category:
            budget.category ??
            budget.name ??
            "Budget",

        amount:
            Number(
                budget.amount ??
                budget.limit ??
                budget.budget_amount ??
                0
            )
    };
}


// ============================================================
// GET EXPENSE AMOUNT
// ============================================================

function getExpenseAmount(expense) {

    if (!expense) {
        return 0;
    }

    if (typeof expense === "object") {

        return Number(
            expense.amount ??
            expense.value ??
            0
        );
    }

    return Number(expense) || 0;
}


// ============================================================
// GET EXPENSE CATEGORY
// ============================================================

function getExpenseCategory(expense) {

    if (!expense || typeof expense !== "object") {
        return "";
    }

    return String(
        expense.category ??
        ""
    ).trim().toLowerCase();
}


// ============================================================
// CALCULATE CATEGORY SPENDING
// ============================================================

function getCategorySpent(category) {

    const target =
        String(category || "")
            .trim()
            .toLowerCase();

    return allExpenses.reduce(
        (total, expense) => {

            const expenseCategory =
                getExpenseCategory(expense);

            if (
                expenseCategory === target
            ) {
                return total +
                    getExpenseAmount(expense);
            }

            return total;

        },
        0
    );
}


// ============================================================
// CATEGORY ICON
// ============================================================

function getCategoryIcon(category) {

    const value =
        String(category || "")
            .toLowerCase()
            .trim();

    if (
        value.includes("food") ||
        value.includes("restaurant") ||
        value.includes("lunch") ||
        value.includes("dinner")
    ) {
        return "utensils";
    }

    if (
        value.includes("transport") ||
        value.includes("fuel") ||
        value.includes("car") ||
        value.includes("travel")
    ) {
        return "car";
    }

    if (
        value.includes("rent") ||
        value.includes("house") ||
        value.includes("home")
    ) {
        return "house";
    }

    if (
        value.includes("shopping") ||
        value.includes("clothes")
    ) {
        return "shopping-bag";
    }

    if (
        value.includes("health") ||
        value.includes("medical")
    ) {
        return "heart-pulse";
    }

    if (
        value.includes("education") ||
        value.includes("school")
    ) {
        return "graduation-cap";
    }

    if (
        value.includes("entertainment") ||
        value.includes("movie")
    ) {
        return "film";
    }

    if (
        value.includes("bill") ||
        value.includes("utilities") ||
        value.includes("electricity")
    ) {
        return "receipt";
    }

    return "wallet-cards";
}


// ============================================================
// RENDER BUDGETS
// ============================================================

function renderBudgets() {

    const list =
        document.getElementById("budgetList");

    const count =
        document.getElementById("budgetCount");

    if (!list) {
        console.error(
            "budgetList element not found."
        );
        return;
    }

    const normalizedBudgets =
        allBudgets
            .map(normalizeBudget)
            .filter(Boolean);

    console.log(
        "Normalized budgets:",
        normalizedBudgets
    );

    if (count) {

        count.textContent =
            `${normalizedBudgets.length} ${
                normalizedBudgets.length === 1
                    ? "budget"
                    : "budgets"
            }`;
    }

    if (normalizedBudgets.length === 0) {

        list.innerHTML = `
            <div class="empty-state">

                <div class="empty-state-icon">
                    <i data-lucide="wallet-cards"></i>
                </div>

                <h3>No budgets yet</h3>

                <p>
                    Create your first budget to start
                    tracking your spending.
                </p>

            </div>
        `;

        updateSummary([]);

        refreshIcons();

        return;
    }


    list.innerHTML =
        normalizedBudgets
            .map(budget => {

                const spent =
                    getCategorySpent(
                        budget.category
                    );

                const limit =
                    Number(budget.amount) || 0;

                let percentage = 0;

                if (limit > 0) {

                    percentage =
                        (spent / limit) * 100;
                }

                const displayPercentage =
                    Math.min(
                        Math.round(percentage),
                        100
                    );

                let progressClass = "";

                if (percentage >= 100) {

                    progressClass = "danger";

                } else if (percentage >= 80) {

                    progressClass = "warning";
                }

                const remaining =
                    Math.max(
                        limit - spent,
                        0
                    );

                return `
                    <div
                        class="budget-card"
                        data-budget-id="${budget.id}"
                    >

                        <div class="budget-card-top">

                            <div class="budget-category">

                                <div class="category-icon">
                                    <i
                                        data-lucide="${getCategoryIcon(
                                            budget.category
                                        )}"
                                    ></i>
                                </div>

                                <div>
                                    <h3>
                                        ${escapeHTML(
                                            budget.category
                                        )}
                                    </h3>

                                    <p>
                                        Monthly budget
                                    </p>
                                </div>

                            </div>


                            <div class="budget-actions">

                                <button
                                    type="button"
                                    class="icon-btn edit-budget"
                                    data-id="${budget.id}"
                                    aria-label="Edit budget"
                                >
                                    <i data-lucide="pencil"></i>
                                </button>

                                <button
                                    type="button"
                                    class="icon-btn delete delete-budget"
                                    data-id="${budget.id}"
                                    aria-label="Delete budget"
                                >
                                    <i data-lucide="trash-2"></i>
                                </button>

                            </div>

                        </div>


                        <div class="budget-amounts">

                            <span class="spent-amount">
                                ${formatCurrency(spent)}
                            </span>

                            <span class="limit-amount">
                                of ${formatCurrency(limit)}
                            </span>

                        </div>


                        <div class="progress-track">

                            <div
                                class="progress-bar ${progressClass}"
                                style="width: ${displayPercentage}%"
                            ></div>

                        </div>


                        <div class="budget-footer">

                            <span>
                                ${displayPercentage}% used
                            </span>

                            <span>
                                ${formatCurrency(remaining)}
                                remaining
                            </span>

                        </div>

                    </div>
                `;

            })
            .join("");


    updateSummary(normalizedBudgets);

    refreshIcons();
}


// ============================================================
// UPDATE SUMMARY
// ============================================================


function updateSummary(budgets) {
    const totalBudgetElement =
        document.getElementById("totalBudget");

    const totalSpentElement =
        document.getElementById("totalSpent");

    const remainingElement =
        document.getElementById("remainingBudget");

    const totalBudget = budgets.reduce(
        (total, budget) =>
            total + (Number(budget.amount) || 0),
        0
    );

    const totalSpent = budgets.reduce(
        (total, budget) =>
            total + getCategorySpent(budget.category),
        0
    );

    // Keep the real difference instead of forcing negative
    // balances to zero.
    const remaining = totalBudget - totalSpent;

    if (totalBudgetElement) {
        totalBudgetElement.textContent =
            formatCurrency(totalBudget);
    }

    if (totalSpentElement) {
        totalSpentElement.textContent =
            formatCurrency(totalSpent);
    }

    if (remainingElement) {
        remainingElement.textContent =
            formatCurrency(remaining);

        remainingElement.classList.toggle(
            "negative-balance",
            remaining < 0
        );
    }
}

// ============================================================
// OPEN MODAL
// ============================================================

function openBudgetModal(budget = null) {

    const modal =
        document.getElementById("budgetModal");

    const title =
        document.getElementById("modalTitle");

    const category =
        document.getElementById("budgetCategory");

    const amount =
        document.getElementById("budgetAmount");

    const deleteButton =
        document.getElementById("deleteBudgetBtn");


    if (!modal || !title || !category || !amount) {
        return;
    }


    if (budget) {

        editingBudgetId = budget.id;

        title.textContent =
            "Edit Budget";

        category.value =
            budget.category || "";

        amount.value =
            budget.amount || "";

        if (deleteButton) {
            deleteButton.style.display =
                "block";
        }

    } else {

        editingBudgetId = null;

        title.textContent =
            "Add Budget";

        category.value = "";

        amount.value = "";

        if (deleteButton) {
            deleteButton.style.display =
                "none";
        }
    }


    modal.classList.add("show");

    setTimeout(() => {
        category.focus();
    }, 100);
}


// ============================================================
// CLOSE MODAL
// ============================================================

function closeBudgetModal() {

    const modal =
        document.getElementById("budgetModal");

    const form =
        document.getElementById("budgetForm");

    editingBudgetId = null;

    if (form) {
        form.reset();
    }

    if (modal) {
        modal.classList.remove("show");
    }
}


// ============================================================
// SAVE BUDGET
// ============================================================

async function saveBudget(event) {

    event.preventDefault();

    const categoryInput =
        document.getElementById("budgetCategory");

    const amountInput =
        document.getElementById("budgetAmount");

    const saveButton =
        document.getElementById("saveBudgetBtn");


    if (!categoryInput || !amountInput) {
        return;
    }


    const category =
        categoryInput.value.trim();

    const amount =
        Number(amountInput.value);


    if (category.length < 2) {

        showToast(
            "Category must be at least 2 characters.",
            "error"
        );

        return;
    }


    if (!amount || amount <= 0) {

        showToast(
            "Budget amount must be greater than 0.",
            "error"
        );

        return;
    }


    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";
    }


    try {

        const payload = {
            category: category,
            amount: amount
        };


        if (editingBudgetId !== null) {

            await apiRequest(
                `/budgets/${editingBudgetId}`,
                {
                    method: "PUT",
                    body: JSON.stringify(payload)
                }
            );

            showToast(
                "Budget updated successfully."
            );

        } else {

            await apiRequest(
                "/budgets",
                {
                    method: "POST",
                    body: JSON.stringify(payload)
                }
            );

            showToast(
                "Budget added successfully."
            );
        }


        closeBudgetModal();

        await loadBudgets();

    } catch (error) {

        console.error(
            "Failed to save budget:",
            error
        );

        showToast(
            error.message ||
            "Unable to save budget.",
            "error"
        );

    } finally {

        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = "Save Budget";
        }
    }
}


// ============================================================
// DELETE BUDGET
// ============================================================

async function deleteBudget(id) {

    if (!id) {
        return;
    }


    const confirmed =
        confirm(
            "Are you sure you want to delete this budget?"
        );


    if (!confirmed) {
        return;
    }


    try {

        await apiRequest(
            `/budgets/${id}`,
            {
                method: "DELETE"
            }
        );


        closeBudgetModal();

        showToast(
            "Budget deleted successfully."
        );


        await loadBudgets();

    } catch (error) {

        console.error(
            "Failed to delete budget:",
            error
        );

        showToast(
            error.message ||
            "Unable to delete budget.",
            "error"
        );
    }
}


// ============================================================
// EDIT / DELETE CLICK HANDLERS
// ============================================================

function setupBudgetActions() {

    const list =
        document.getElementById("budgetList");

    if (!list) {
        return;
    }


    list.addEventListener(
        "click",
        function (event) {

            const editButton =
                event.target.closest(
                    ".edit-budget"
                );

            const deleteButton =
                event.target.closest(
                    ".delete-budget"
                );


            if (editButton) {

                const id =
                    Number(
                        editButton.dataset.id
                    );

                const budget =
                    allBudgets
                        .map(normalizeBudget)
                        .find(
                            item =>
                                Number(item.id) === id
                        );


                if (budget) {
                    openBudgetModal(budget);
                }

                return;
            }


            if (deleteButton) {

                const id =
                    Number(
                        deleteButton.dataset.id
                    );

                deleteBudget(id);
            }

        }
    );
}


// ============================================================
// SEARCH
// ============================================================

function setupSearch() {

    const search =
        document.getElementById("budgetSearch");

    if (!search) {
        return;
    }


    search.addEventListener(
        "input",
        function () {

            const value =
                search.value
                    .trim()
                    .toLowerCase();


            if (!value) {

                renderBudgets();

                return;
            }


            const filtered =
                allBudgets.filter(
                    budget => {

                        const normalized =
                            normalizeBudget(
                                budget
                            );

                        return normalized.category
                            .toLowerCase()
                            .includes(value);
                    }
                );


            renderFilteredBudgets(
                filtered
            );
        }
    );
}


// ============================================================
// RENDER SEARCH RESULTS
// ============================================================

function renderFilteredBudgets(
    budgets
) {

    const list =
        document.getElementById("budgetList");

    const count =
        document.getElementById("budgetCount");


    if (!list) {
        return;
    }


    const normalizedBudgets =
        budgets
            .map(normalizeBudget)
            .filter(Boolean);


    if (count) {

        count.textContent =
            `${normalizedBudgets.length} ${
                normalizedBudgets.length === 1
                    ? "budget"
                    : "budgets"
            }`;
    }


    if (normalizedBudgets.length === 0) {

        list.innerHTML = `
            <div class="empty-state">

                <div class="empty-state-icon">
                    <i data-lucide="search-x"></i>
                </div>

                <h3>No budgets found</h3>

                <p>
                    Try another budget category.
                </p>

            </div>
        `;

        refreshIcons();

        return;
    }


    list.innerHTML =
        normalizedBudgets
            .map(budget => {

                const spent =
                    getCategorySpent(
                        budget.category
                    );

                const limit =
                    Number(budget.amount) || 0;

                const percentage =
                    limit > 0
                        ? (spent / limit) * 100
                        : 0;

                const displayPercentage =
                    Math.min(
                        Math.round(percentage),
                        100
                    );

                let progressClass = "";

                if (percentage >= 100) {
                    progressClass = "danger";
                } else if (percentage >= 80) {
                    progressClass = "warning";
                }

                const remaining =
                    Math.max(
                        limit - spent,
                        0
                    );


                return `
                    <div
                        class="budget-card"
                        data-budget-id="${budget.id}"
                    >

                        <div class="budget-card-top">

                            <div class="budget-category">

                                <div class="category-icon">
                                    <i
                                        data-lucide="${getCategoryIcon(
                                            budget.category
                                        )}"
                                    ></i>
                                </div>

                                <div>
                                    <h3>
                                        ${escapeHTML(
                                            budget.category
                                        )}
                                    </h3>

                                    <p>
                                        Monthly budget
                                    </p>
                                </div>

                            </div>

                            <div class="budget-actions">

                                <button
                                    type="button"
                                    class="icon-btn edit-budget"
                                    data-id="${budget.id}"
                                    aria-label="Edit budget"
                                >
                                    <i data-lucide="pencil"></i>
                                </button>

                                <button
                                    type="button"
                                    class="icon-btn delete delete-budget"
                                    data-id="${budget.id}"
                                    aria-label="Delete budget"
                                >
                                    <i data-lucide="trash-2"></i>
                                </button>

                            </div>

                        </div>


                        <div class="budget-amounts">

                            <span class="spent-amount">
                                ${formatCurrency(spent)}
                            </span>

                            <span class="limit-amount">
                                of ${formatCurrency(limit)}
                            </span>

                        </div>


                        <div class="progress-track">

                            <div
                                class="progress-bar ${progressClass}"
                                style="width: ${displayPercentage}%"
                            ></div>

                        </div>


                        <div class="budget-footer">

                            <span>
                                ${displayPercentage}% used
                            </span>

                            <span>
                                ${formatCurrency(remaining)}
                                remaining
                            </span>

                        </div>

                    </div>
                `;

            })
            .join("");


    refreshIcons();
}


// ============================================================
// MODAL SETUP
// ============================================================

function setupModal() {

    const modal =
        document.getElementById("budgetModal");

    const addButton =
        document.getElementById("addBudgetBtn");

    const closeButton =
        document.getElementById("closeBudgetModal");

    const cancelButton =
        document.getElementById("cancelBudgetBtn");

    const form =
        document.getElementById("budgetForm");

    const deleteButton =
        document.getElementById("deleteBudgetBtn");


    if (addButton) {

        addButton.addEventListener(
            "click",
            function () {
                openBudgetModal();
            }
        );
    }


    if (closeButton) {

        closeButton.addEventListener(
            "click",
            closeBudgetModal
        );
    }


    if (cancelButton) {

        cancelButton.addEventListener(
            "click",
            closeBudgetModal
        );
    }


    if (form) {

        form.addEventListener(
            "submit",
            saveBudget
        );
    }


    if (deleteButton) {

        deleteButton.addEventListener(
            "click",
            function () {

                if (editingBudgetId !== null) {

                    deleteBudget(
                        editingBudgetId
                    );
                }
            }
        );
    }


    if (modal) {

        modal.addEventListener(
            "click",
            function (event) {

                if (
                    event.target === modal
                ) {
                    closeBudgetModal();
                }

            }
        );
    }


    document.addEventListener(
        "keydown",
        function (event) {

            if (
                event.key === "Escape" &&
                modal &&
                modal.classList.contains("show")
            ) {
                closeBudgetModal();
            }

        }
    );
}


/* ==========================================
   TOP-RIGHT PROFILE AND NOTIFICATIONS
========================================== */

function setupBudgetTopbarMenus() {
    const profile = document.getElementById("topProfile");
    const notificationButton =
        document.getElementById("notificationButton");

    if (!profile || !notificationButton) {
        console.warn("Topbar profile or notification button not found.");
        return;
    }

    // Prevent duplicate menus if setup runs more than once.
    document.getElementById("budgetProfileMenu")?.remove();
    document.getElementById("budgetNotificationPanel")?.remove();

    profile.style.position = "relative";

    // Position the notification panel relative to the topbar.
    const topbar = notificationButton.closest(".topbar");

    if (topbar) {
        topbar.style.position = "relative";
    }

    const profileMenu = document.createElement("div");
    profileMenu.id = "budgetProfileMenu";
    profileMenu.className = "budget-topbar-menu";

    profileMenu.innerHTML = `
        <div class="budget-menu-heading">
            <strong id="budgetProfileName">Your account</strong>
            <span id="budgetProfileEmail"></span>
        </div>

        <button type="button" class="budget-menu-item"
            data-budget-menu-action="settings">
            <i data-lucide="user-round"></i>
            <span>Profile &amp; Settings</span>
        </button>

        <button type="button" class="budget-menu-item"
            data-budget-menu-action="transactions">
            <i data-lucide="arrow-left-right"></i>
            <span>Transactions</span>
        </button>

        <button type="button" class="budget-menu-item"
            data-budget-menu-action="dashboard">
            <i data-lucide="layout-dashboard"></i>
            <span>Dashboard</span>
        </button>

        <button type="button"
            class="budget-menu-item logout-item"
            data-budget-menu-action="logout">
            <i data-lucide="log-out"></i>
            <span>Log out</span>
        </button>
    `;

    profile.appendChild(profileMenu);

    const notificationPanel = document.createElement("div");
    notificationPanel.id = "budgetNotificationPanel";
    notificationPanel.className = "budget-topbar-menu";

    notificationPanel.innerHTML = `
        <div class="budget-menu-heading">
            <strong>Notifications</strong>
            <span id="budgetNotificationSummary">
                Your budget alerts
            </span>
        </div>
        <div class="budget-menu-content"
            id="budgetNotificationList"></div>
    `;

   const notificationAnchor =
    notificationButton.closest(".topbar") || notificationButton.parentElement;

        notificationAnchor.appendChild(notificationPanel);

        notificationPanel.style.position = "absolute";
        notificationPanel.style.top = "calc(100% + 8px)";
        notificationPanel.style.right = "20px";
        notificationPanel.style.left = "auto";
    function closeMenus() {
        profileMenu.classList.remove("show");
        notificationPanel.classList.remove("show");
        profile.setAttribute("aria-expanded", "false");
    }

    function toggleProfile(event) {
        event.stopPropagation();

        const shouldOpen = !profileMenu.classList.contains("show");
        closeMenus();

        if (shouldOpen) {
            profileMenu.classList.add("show");
            profile.setAttribute("aria-expanded", "true");
        }
    }

    function toggleNotifications(event) {
        event.stopPropagation();

        const shouldOpen =
            !notificationPanel.classList.contains("show");

        closeMenus();

        if (shouldOpen) {
            renderBudgetNotifications();
            notificationPanel.classList.add("show");
        }
    }

    profile.addEventListener("click", toggleProfile);

    profile.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleProfile(event);
        }
    });

    notificationButton.addEventListener(
        "click",
        toggleNotifications
    );

    profileMenu.addEventListener("click", event => {
        event.stopPropagation();

        const actionButton =
            event.target.closest("[data-budget-menu-action]");

        if (!actionButton) return;

        const action = actionButton.dataset.budgetMenuAction;

        if (action === "settings") {
            window.location.href = "settings.html";
        } else if (action === "transactions") {
            window.location.href = "transactions.html";
        } else if (action === "dashboard") {
            window.location.href = "dashboard.html";
        } else if (action === "logout") {
            logout();
        }
    });

    notificationPanel.addEventListener("click", event => {
        event.stopPropagation();
    });

    document.addEventListener("click", event => {
        if (
            !profile.contains(event.target) &&
            !notificationButton.contains(event.target)
        ) {
            closeMenus();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeMenus();
    });

    refreshBudgetProfileMenu();
    renderBudgetNotifications();

    if (window.lucide) {
        window.lucide.createIcons();
    }
}


/* Update the profile details using the existing page data. */
function refreshBudgetProfileMenu() {
    const nameElement =
        document.getElementById("budgetProfileName");

    const emailElement =
        document.getElementById("budgetProfileEmail");

    const name =
        localStorage.getItem("user_name") || "FundHaven User";

    const email =
        localStorage.getItem("user_email") || "";

    if (nameElement) nameElement.textContent = name;
    if (emailElement) emailElement.textContent = email;
}


/* Generate alerts from the budgets and expenses already loaded. */
function renderBudgetNotifications() {
    const list =
        document.getElementById("budgetNotificationList");

    const summary =
        document.getElementById("budgetNotificationSummary");

    if (!list) return;

    const budgets =
        Array.isArray(allBudgets) ? allBudgets : [];

    const expenses =
        Array.isArray(allExpenses) ? allExpenses : [];

    const alerts = [];

    budgets.forEach(budget => {
        const category = String(budget.category || "Budget");
        const limit = Number(budget.amount ?? budget.budget ?? 0);

        if (limit <= 0) return;

        const spent = expenses.reduce((total, expense) => {
            const expenseCategory =
                String(expense.category || "").trim().toLowerCase();

            return expenseCategory === category.trim().toLowerCase()
                ? total + (Number(expense.amount) || 0)
                : total;
        }, 0);

        const percentage = (spent / limit) * 100;

        if (percentage >= 100) {
            alerts.push({
                icon: "triangle-alert",
                title: `${category} budget exceeded`,
                message:
                    `You've spent ${formatCurrency(spent)} of ${formatCurrency(limit)}.`
            });
        } else if (percentage >= 80) {
            alerts.push({
                icon: "bell-ring",
                title: `${category} budget almost reached`,
                message:
                    `You've used ${percentage.toFixed(0)}% of this budget.`
            });
        }
    });

    if (summary) {
        summary.textContent = alerts.length
            ? `${alerts.length} budget alert${alerts.length === 1 ? "" : "s"}`
            : "Your budget alerts";
    }

    if (alerts.length === 0) {
        list.innerHTML = `
            <div class="budget-notification-empty">
                <i data-lucide="check-circle-2"></i>
                <div>You're all caught up. No budget warnings right now.</div>
            </div>
        `;
    } else {
        list.innerHTML = alerts.slice(0, 10).map(alert => `
            <div class="budget-notification-item">
                <i data-lucide="${alert.icon}"></i>
                <div>
                    <strong>${escapeHTML(alert.title)}</strong>
                    <span>${escapeHTML(alert.message)}</span>
                </div>
            </div>
        `).join("");
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// ============================================================
// INITIALIZE
// ============================================================

async function initializeBudgetsPage() {
    console.log("FundHaven budgets page loading...");

    if (!getToken()) {
        logout();
        return;
    }

    refreshIcons();

    // Set up all page buttons and menus.
    setupModal();
    setupBudgetActions();
    setupSearch();
    setupBudgetTopbarMenus(); // FIX: this was missing

    // Load the current user's information and financial data.
    await loadUser();
    await loadExpenses();
    await loadBudgets();

    // Refresh the profile menu and notification alerts.
    refreshBudgetProfileMenu();
    renderBudgetNotifications();
    refreshIcons();

    console.log(
        "FundHaven budgets page initialization complete."
    );
}

// ============================================================
// START
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    initializeBudgetsPage
);
// Preserve the active budget search when the preferred currency or rate changes.
window.addEventListener("budgetwise:currency-ready", () => {
    const term = document.getElementById("budgetSearch")?.value.trim().toLowerCase() || "";
    if (term) {
        renderFilteredBudgets(allBudgets.filter(budget =>
            String(budget.category || "").toLowerCase().includes(term)
        ));
    } else {
        renderBudgets();
    }
    renderBudgetNotifications();
});
