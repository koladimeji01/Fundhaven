
/* ============================================================
   BUDGETWISE — GOALS PAGE
   Complete replacement: goals CRUD, search, sidebar,
   aligned top bar, notifications and profile dropdown.
   ============================================================ */

(() => {
    "use strict";

    const API_URL = "http://127.0.0.1:8000/api/v1";
    const $ = (id) => document.getElementById(id);

    let goals = [];
    let editingGoalId = null;
    let searchTerm = "";
    let saving = false;
    let userInfo = null;

    // ========================================================
    // HELPERS
    // ========================================================

    function refreshIcons() {
        if (window.lucide) window.lucide.createIcons();
    }

    function naira(value) {
        return new Intl.NumberFormat("en-NG", {
            style: "currency",
            currency: "NGN",
            maximumFractionDigits: 0
        }).format(Number(value) || 0);
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function dateKey(value) {
        if (!value) return "";

        const text = String(value);
        const match = text.match(/^(\d{4}-\d{2}-\d{2})/);

        if (match) return match[1];

        const parsed = new Date(value);

        if (Number.isNaN(parsed.getTime())) return "";

        return [
            parsed.getFullYear(),
            String(parsed.getMonth() + 1).padStart(2, "0"),
            String(parsed.getDate()).padStart(2, "0")
        ].join("-");
    }

    function dateFromKey(key) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;

        const [year, month, day] = key.split("-").map(Number);
        const date = new Date(year, month - 1, day);

        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formattedDate(value) {
        const date = dateFromKey(dateKey(value));

        return date
            ? date.toLocaleDateString("en-NG", {
                day: "numeric",
                month: "short",
                year: "numeric"
            })
            : "Not set";
    }

    function goalTarget(goal) {
        return Math.max(
            0,
            Number(goal.target_amount ?? goal.target ?? 0) || 0
        );
    }

    function goalSaved(goal) {
        return Math.max(
            0,
            Number(
                goal.current_amount ??
                goal.saved_amount ??
                goal.saved ??
                0
            ) || 0
        );
    }

    function isComplete(goal) {
        return goal.completed === true ||
            String(goal.status || "").toLowerCase() === "completed" ||
            (
                goalTarget(goal) > 0 &&
                goalSaved(goal) >= goalTarget(goal)
            );
    }

    function normalizeGoal(goal) {
        return {
            ...goal,
            id: goal.id ?? goal.goal_id,
            name: String(goal.name ?? goal.title ?? "Untitled goal"),
            target_amount: goalTarget(goal),
            current_amount: goalSaved(goal),
            target_date: dateKey(
                goal.target_date ??
                goal.deadline ??
                goal.due_date
            )
        };
    }

    function getGoalsArray(data) {
        if (Array.isArray(data)) return data;
        if (Array.isArray(data?.goals)) return data.goals;
        if (Array.isArray(data?.items)) return data.items;
        if (Array.isArray(data?.data)) return data.data;
        return [];
    }

    // ========================================================
    // AUTHENTICATED API
    // ========================================================

    function logout() {
        [
            "access_token",
            "user_email",
            "user_name",
            "user_id"
        ].forEach((key) => localStorage.removeItem(key));

        window.location.replace("login.html");
    }

    async function apiRequest(path, options = {}) {
        const token = localStorage.getItem("access_token");

        if (!token) {
            logout();
            throw new Error("Please sign in again.");
        }

        const response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                ...(options.headers || {})
            }
        });

        if (response.status === 401) {
            logout();
            throw new Error(
                "Your session expired. Please sign in again."
            );
        }

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            const detail = data?.detail;

            const message = Array.isArray(detail)
                ? detail.map(
                    (item) => item.msg || "Invalid input"
                ).join(", ")
                : typeof detail === "string"
                    ? detail
                    : data?.message ||
                      `Request failed (${response.status}).`;

            throw new Error(message);
        }

        return data;
    }

    // ========================================================
    // PROFILE DATA
    // ========================================================

    function updateUserDisplay(user = {}) {
        userInfo = user;

        const name = String(
            user.name ||
            user.full_name ||
            localStorage.getItem("user_name") ||
            "BudgetWise User"
        );

        const email = String(
            user.email ||
            localStorage.getItem("user_email") ||
            ""
        );

        const initials = name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join("") || "U";

        if ($("sidebarUserName")) {
            $("sidebarUserName").textContent = name;
        }

        if ($("topUserName")) {
            $("topUserName").textContent = name;
        }

        if ($("sidebarAvatar")) {
            $("sidebarAvatar").textContent = initials;
        }

        if ($("topAvatar")) {
            $("topAvatar").textContent = initials;
        }

        if (user.name) {
            localStorage.setItem("user_name", name);
        }

        if (user.email) {
            localStorage.setItem("user_email", email);
        }

        if (user.id != null) {
            localStorage.setItem("user_id", String(user.id));
        }
    }

    async function loadUser() {
        try {
            const result = await apiRequest("/users/me");

            updateUserDisplay(
                result?.user ||
                result?.profile ||
                result ||
                {}
            );
        } catch (error) {
            console.warn("Goals profile not loaded:", error);
            updateUserDisplay();
        }
    }

    // ========================================================
    // GOALS SUMMARY
    // ========================================================

    function renderSummary() {
        const completed = goals.filter(isComplete).length;

        const totalSaved = goals.reduce(
            (sum, goal) => sum + goalSaved(goal),
            0
        );

        if ($("totalGoals")) {
            $("totalGoals").textContent = goals.length;
        }

        if ($("activeGoals")) {
            $("activeGoals").textContent =
                goals.length - completed;
        }

        if ($("completedGoals")) {
            $("completedGoals").textContent = completed;
        }

        if ($("totalSaved")) {
            $("totalSaved").textContent = naira(totalSaved);
        }

        if ($("goalCount")) {
            $("goalCount").textContent =
                `${goals.length} goal${goals.length === 1 ? "" : "s"}`;
        }
    }

    // ========================================================
    // RENDER GOALS
    // ========================================================

    function renderGoals() {
        const list = $("goalsList");
        const emptyState = $("emptyState");

        if (!list) return;

        const matched = goals.filter((goal) =>
            goal.name.toLowerCase().includes(searchTerm)
        );

        if (emptyState) {
            emptyState.style.display =
                goals.length === 0 ? "block" : "none";
        }

        if (!matched.length) {
            list.innerHTML = goals.length
                ? `
                    <div class="bw-goal-message">
                        No goals match your search.
                    </div>
                `
                : "";

            return;
        }

        list.innerHTML = matched.map((goal) => {
            const saved = goalSaved(goal);
            const target = goalTarget(goal);

            const percent = target > 0
                ? (saved / target) * 100
                : 0;

            const complete = isComplete(goal);
            const remaining = Math.max(0, target - saved);
            const id = escapeHTML(goal.id);

            return `
                <div class="goal-item">

                    <div class="goal-top">

                        <div class="goal-info">

                            <div class="goal-name-row">

                                <div class="goal-icon">
                                    <i data-lucide="target"></i>
                                </div>

                                <div>
                                    <div class="goal-name">
                                        ${escapeHTML(goal.name)}
                                    </div>

                                    <div class="goal-date">
                                        Target:
                                        ${escapeHTML(
                                            formattedDate(goal.target_date)
                                        )}
                                    </div>
                                </div>

                            </div>

                        </div>

                        <div class="goal-actions">

                            <button
                                class="goal-action"
                                type="button"
                                data-goal-action="edit"
                                data-goal-id="${id}"
                                aria-label="Edit ${escapeHTML(goal.name)}"
                                title="Edit goal"
                            >
                                <i data-lucide="pencil"></i>
                            </button>

                            <button
                                class="goal-action delete"
                                type="button"
                                data-goal-action="delete"
                                data-goal-id="${id}"
                                aria-label="Delete ${escapeHTML(goal.name)}"
                                title="Delete goal"
                            >
                                <i data-lucide="trash-2"></i>
                            </button>

                        </div>

                    </div>

                    <div class="goal-progress-area">

                        <div class="goal-amount-row">

                            <span class="goal-amount">
                                ${naira(saved)} of ${naira(target)}
                            </span>

                            <span class="goal-percent">
                                ${Math.round(percent)}%
                            </span>

                        </div>

                        <div
                            class="progress-track"
                            role="progressbar"
                            aria-label="Progress for ${escapeHTML(goal.name)}"
                            aria-valuemin="0"
                            aria-valuemax="100"
                            aria-valuenow="${Math.min(
                                100,
                                Math.round(percent)
                            )}"
                        >
                            <div
                                class="progress-bar ${
                                    complete ? "complete" : ""
                                }"
                                style="width:${
                                    Math.min(100, percent).toFixed(2)
                                }%"
                            ></div>
                        </div>

                        <div class="goal-status">
                            ${
                                complete
                                    ? "Goal completed!"
                                    : `${naira(remaining)} remaining`
                            }
                        </div>

                    </div>

                </div>
            `;
        }).join("");

        refreshIcons();
    }

    function renderAll() {
        renderSummary();
        renderGoals();
        renderNotifications();
    }

    // ========================================================
    // LOAD GOALS
    // ========================================================

    async function loadGoals() {
        try {
            const data = await apiRequest("/goals");

            goals = getGoalsArray(data).map(normalizeGoal);

            renderAll();

        } catch (error) {
            console.error("Could not load goals:", error);

            showToast(
                `Could not load goals: ${error.message}`,
                true
            );
        }
    }

    // ========================================================
    // GOAL MODAL
    // ========================================================

    function showFormError(message) {
        const error = $("formError");

        if (!error) return;

        error.textContent = message;
        error.style.display = message ? "block" : "none";
    }

    function openGoalModal(goal = null) {
        editingGoalId = goal ? goal.id : null;

        $("goalForm")?.reset();
        showFormError("");

        if ($("modalTitle")) {
            $("modalTitle").textContent =
                goal ? "Edit Goal" : "Add Goal";
        }

        const submit = $("goalForm")
            ?.querySelector('button[type="submit"]');

        if (submit) {
            submit.textContent =
                goal ? "Save Changes" : "Save Goal";
        }

        if ($("goalName")) {
            $("goalName").value = goal?.name || "";
        }

        if ($("targetAmount")) {
            $("targetAmount").value =
                goal?.target_amount ?? "";
        }

        if ($("currentAmount")) {
            $("currentAmount").value =
                goal?.current_amount ?? 0;
        }

        if ($("targetDate")) {
            $("targetDate").value =
                goal?.target_date || "";
        }

        $("goalModal")?.classList.add("show");

        document.body.style.overflow = "hidden";

        $("goalName")?.focus();
    }

    function closeGoalModal() {
        if (saving) return;

        $("goalModal")?.classList.remove("show");

        document.body.style.overflow = "";

        editingGoalId = null;

        showFormError("");
    }

    // ========================================================
    // SAVE GOAL
    // ========================================================

    async function saveGoal(event) {
        event.preventDefault();

        if (saving) return;

        const name = $("goalName")?.value.trim() || "";
        const target = Number($("targetAmount")?.value);
        const current = Number($("currentAmount")?.value);
        const targetDate = $("targetDate")?.value || "";

        if (name.length < 2 || name.length > 80) {
            return showFormError(
                "Goal name must be between 2 and 80 characters."
            );
        }

        if (!Number.isFinite(target) || target <= 0) {
            return showFormError(
                "Target amount must be greater than zero."
            );
        }

        if (!Number.isFinite(current) || current < 0) {
            return showFormError(
                "Current saved amount cannot be negative."
            );
        }

        if (!dateKey(targetDate)) {
            return showFormError(
                "Please choose a valid target date."
            );
        }

        saving = true;
        showFormError("");

        const submit = $("goalForm")
            ?.querySelector('button[type="submit"]');

        const previousText = submit?.textContent || "Save Goal";

        if (submit) {
            submit.disabled = true;
            submit.textContent = "Saving...";
        }

        const wasEditing = editingGoalId != null;

        const endpoint = wasEditing
            ? `/goals/${encodeURIComponent(editingGoalId)}`
            : "/goals";

        try {
            await apiRequest(endpoint, {
                method: wasEditing ? "PUT" : "POST",

                body: JSON.stringify({
                    name,
                    target_amount: target,
                    current_amount: current,
                    target_date: targetDate
                })
            });

            saving = false;

            closeGoalModal();

            showToast(
                wasEditing
                    ? "Goal updated successfully."
                    : "Goal added successfully."
            );

            await loadGoals();

        } catch (error) {
            showFormError(error.message);

        } finally {
            saving = false;

            if (submit) {
                submit.disabled = false;
                submit.textContent = previousText;
            }
        }
    }

    // ========================================================
    // DELETE GOAL
    // ========================================================

    async function deleteGoal(goal) {
        const confirmed = window.confirm(
            `Delete the goal "${goal.name}"? This cannot be undone.`
        );

        if (!confirmed) return;

        try {
            await apiRequest(
                `/goals/${encodeURIComponent(goal.id)}`,
                { method: "DELETE" }
            );

            showToast("Goal deleted successfully.");

            await loadGoals();

        } catch (error) {
            showToast(
                `Delete failed: ${error.message}`,
                true
            );
        }
    }

    // ========================================================
    // GOAL BUTTONS AND SEARCH
    // ========================================================

    function setupGoalEvents() {
        $("addGoalBtn")?.addEventListener(
            "click",
            () => openGoalModal()
        );

        $("emptyAddGoalBtn")?.addEventListener(
            "click",
            () => openGoalModal()
        );

        $("closeModalBtn")?.addEventListener(
            "click",
            closeGoalModal
        );

        $("cancelModalBtn")?.addEventListener(
            "click",
            closeGoalModal
        );

        $("goalForm")?.addEventListener(
            "submit",
            saveGoal
        );

        $("goalModal")?.addEventListener(
            "click",
            (event) => {
                if (event.target === $("goalModal")) {
                    closeGoalModal();
                }
            }
        );

        $("goalsList")?.addEventListener(
            "click",
            (event) => {
                const button = event.target.closest(
                    "[data-goal-action]"
                );

                if (!button) return;

                const goal = goals.find(
                    (item) =>
                        String(item.id) === button.dataset.goalId
                );

                if (!goal) return;

                if (button.dataset.goalAction === "edit") {
                    openGoalModal(goal);
                }

                if (button.dataset.goalAction === "delete") {
                    void deleteGoal(goal);
                }
            }
        );

        $("searchInput")?.addEventListener(
            "input",
            (event) => {
                searchTerm = event.target.value
                    .trim()
                    .toLowerCase();

                renderGoals();
            }
        );

        $("mobileMenu")?.addEventListener(
            "click",
            (event) => {
                event.stopPropagation();

                $("sidebar")?.classList.toggle("open");
            }
        );

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                closeGoalModal();
                closeTopMenus();
            }
        });
    }

    // ========================================================
    // TOAST NOTIFICATIONS
    // ========================================================

    let toastTimer;

    function showToast(message, isError = false) {
        const toast = $("toast");

        if (!toast) return;

        toast.textContent = message;

        toast.classList.toggle("error", isError);
        toast.classList.add("show");

        clearTimeout(toastTimer);

        toastTimer = setTimeout(
            () => toast.classList.remove("show"),
            3500
        );
    }

    // ========================================================
    // TOP BAR STATE
    // ========================================================

    let notificationMenu;
    let profileMenu;
    let bellButton;
    let profileButton;

    // ========================================================
    // TOP BAR STYLES — MATCH REPORTS PAGE
    // ========================================================

    function addTopbarStyles() {
        if ($("bwGoalsTopbarStyles")) return;

        const style = document.createElement("style");

        style.id = "bwGoalsTopbarStyles";

        style.textContent = `
            .topbar {
                display: flex;
                align-items: center;
                gap: 16px;
                height: 72px;
                padding: 0 30px;
                overflow: visible;
                background: #fff;
                border-bottom: 1px solid #e4e9e6;
            }

            .topbar .search {
                flex: 0 1 290px;
                width: 290px;
                max-width: 290px;
                min-width: 140px;
                margin-right: auto;
            }

            .topbar .top-actions {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 16px;
                margin-left: auto;
            }

            .topbar .bw-top-wrap {
                position: relative;
                display: flex;
                align-items: center;
            }

            .topbar .icon-button {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 40px;
                height: 40px;
                border: 0;
                border-radius: 10px;
                background: transparent;
                color: #52635a;
                cursor: pointer;
            }

            .topbar .icon-button:hover,
            .topbar .top-user:hover {
                background: #f2f6f3;
            }

            .topbar .top-user {
                display: flex;
                align-items: center;
                gap: 9px;
                min-height: 42px;
                padding: 4px 8px;
                margin: 0;
                border: 0;
                border-radius: 10px;
                background: transparent;
                cursor: pointer;
                color: #33463c;
            }

            .topbar .top-user-name {
                max-width: 150px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .topbar .top-avatar {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 34px;
                height: 34px;
                min-width: 34px;
                border-radius: 50%;
                background: #e3eee7;
                color: #123d2c;
                font-size: 12px;
                font-weight: 700;
            }

            .topbar .bw-chevron {
                width: 15px;
                height: 15px;
                flex-shrink: 0;
            }

            .topbar .notification-dot {
                display: none;
            }

            .topbar .bw-goal-dropdown {
                display: none;
                position: absolute;
                right: 0;
                top: calc(100% + 10px);
                z-index: 1500;
                width: 300px;
                max-width: calc(100vw - 28px);
                max-height: min(420px, calc(100vh - 100px));
                overflow-y: auto;
                padding: 8px;
                border: 1px solid #e4ebe7;
                border-radius: 12px;
                background: #fff;
                color: #243e30;
                box-shadow: 0 12px 30px rgba(18,61,44,.14);
            }

            .topbar .bw-goal-dropdown.show {
                display: block;
            }

            .bw-goal-menu-head {
                display: flex;
                flex-direction: column;
                gap: 4px;
                padding: 11px 12px;
                border-bottom: 1px solid #edf1ef;
                margin-bottom: 5px;
            }

            .bw-goal-menu-head strong {
                font-size: 13px;
            }

            .bw-goal-menu-head small {
                font-size: 11px;
                color: #7e9185;
                overflow-wrap: anywhere;
            }

            .bw-goal-dropdown a,
            .bw-goal-dropdown button.bw-goal-menu-item {
                width: 100%;
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 11px 12px;
                background: transparent;
                border: 0;
                border-radius: 8px;
                font: inherit;
                font-size: 12px;
                color: #264735;
                text-align: left;
                text-decoration: none;
                cursor: pointer;
            }

            .bw-goal-dropdown a:hover,
            .bw-goal-dropdown button.bw-goal-menu-item:hover {
                background: #f0f6f2;
            }

            .bw-goal-dropdown a svg,
            .bw-goal-dropdown button svg {
                width: 16px;
                height: 16px;
                flex-shrink: 0;
            }

            .bw-goal-alert {
                display: flex;
                align-items: flex-start;
                gap: 10px;
                padding: 12px 10px;
                border-bottom: 1px solid #edf1ef;
            }

            .bw-goal-alert:last-child {
                border-bottom: 0;
            }

            .bw-goal-alert svg {
                width: 18px;
                height: 18px;
                flex-shrink: 0;
                color: #bc842c;
            }

            .bw-goal-alert strong {
                display: block;
                font-size: 12px;
            }

            .bw-goal-alert p {
                font-size: 11px;
                line-height: 1.5;
                color: #74877b;
                margin: 5px 0 0;
            }

            .bw-goal-message {
                padding: 22px;
                text-align: center;
                color: #809088;
                font-size: 13px;
            }

            @media (max-width: 800px) {
                .topbar {
                    padding: 0 18px;
                    gap: 12px;
                }

                .topbar .icon-button.mobile-menu {
                    display: flex;
                }

                .topbar .search {
                    min-width: 0;
                }
            }

            @media (max-width: 600px) {
                .topbar {
                    height: 64px;
                    padding: 0 15px;
                }

                .topbar .search {
                    display: none;
                }

                .topbar .top-user-name {
                    display: none;
                }

                .topbar .top-actions {
                    gap: 8px;
                }
            }
        `;

        document.head.appendChild(style);
    }

    // ========================================================
    // CLOSE TOP BAR MENUS
    // ========================================================

    function closeTopMenus() {
        notificationMenu?.classList.remove("show");
        profileMenu?.classList.remove("show");

        bellButton?.setAttribute(
            "aria-expanded",
            "false"
        );

        profileButton?.setAttribute(
            "aria-expanded",
            "false"
        );
    }

    // ========================================================
    // PROFILE DROPDOWN
    // ========================================================

    function renderProfileMenu() {
        if (!profileMenu) return;

        const name =
            $("topUserName")?.textContent.trim() ||
            "BudgetWise User";

        const email =
            userInfo?.email ||
            localStorage.getItem("user_email") ||
            "Personal Account";

        profileMenu.innerHTML = `
            <div class="bw-goal-menu-head">
                <strong>${escapeHTML(name)}</strong>
                <small>${escapeHTML(email)}</small>
            </div>

            <a href="dashboard.html">
                <i data-lucide="layout-dashboard"></i>
                Dashboard
            </a>

            <a href="transactions.html">
                <i data-lucide="arrow-left-right"></i>
                Transactions
            </a>

            <a href="settings.html">
                <i data-lucide="settings"></i>
                Profile &amp; Settings
            </a>

            <button
                type="button"
                class="bw-goal-menu-item"
                id="goalLogoutButton"
            >
                <i data-lucide="log-out"></i>
                Log out
            </button>
        `;

        $("goalLogoutButton")?.addEventListener(
            "click",
            logout
        );

        refreshIcons();
    }

    // ========================================================
    // GOAL NOTIFICATIONS
    // ========================================================

    function notificationItems() {
        const alerts = [];

        const now = new Date();

        const today = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
        );

        for (const goal of goals) {
            if (isComplete(goal)) continue;

            const due = dateFromKey(goal.target_date);

            if (!due) continue;

            const days = Math.round(
                (due.getTime() - today.getTime()) / 86400000
            );

            if (days < 0) {
                alerts.push({
                    icon: "alert-triangle",
                    title: `${goal.name} is overdue`,
                    message:
                        `Your target date passed ` +
                        `${Math.abs(days)} day(s) ago.`
                });

            } else if (days <= 30) {
                alerts.push({
                    icon: "calendar-clock",
                    title: `${goal.name}: target date approaching`,
                    message:
                        days === 0
                            ? "Your goal is due today."
                            : `Due in ${days} day(s).`
                });
            }
        }

        return alerts;
    }

    function renderNotifications() {
        if (!notificationMenu) return;

        const alerts = notificationItems();

        const dot = bellButton?.querySelector(
            ".notification-dot"
        );

        if (dot) {
            dot.style.display =
                alerts.length ? "block" : "none";
        }

        notificationMenu.innerHTML = `
            <div class="bw-goal-menu-head">

                <strong>Notifications</strong>

                <small>
                    ${
                        alerts.length
                            ? `${alerts.length} goal reminder(s)`
                            : "Your BudgetWise updates"
                    }
                </small>

            </div>

            ${
                alerts.length
                    ? alerts.map((alert) => `
                        <div class="bw-goal-alert">

                            <i data-lucide="${alert.icon}"></i>

                            <div>
                                <strong>
                                    ${escapeHTML(alert.title)}
                                </strong>

                                <p>
                                    ${escapeHTML(alert.message)}
                                </p>
                            </div>

                        </div>
                    `).join("")
                    : `
                        <div class="bw-goal-alert">

                            <i data-lucide="check-circle-2"></i>

                            <div>
                                <strong>
                                    You're all caught up
                                </strong>

                                <p>
                                    No approaching or overdue
                                    goal deadlines right now.
                                </p>
                            </div>

                        </div>
                    `
            }
        `;

        refreshIcons();
    }

    // ========================================================
    // TOP BAR INITIALIZATION
    // ========================================================

    function setupTopbar() {
        const topbar = document.querySelector(".topbar");

        const actions = topbar?.querySelector(
            ".top-actions"
        );

        const search = topbar?.querySelector(
            ".search"
        );

        bellButton = actions?.querySelector(
            ".icon-button:not(.mobile-menu)"
        );

        profileButton = actions?.querySelector(
            ".top-user"
        );

        if (
            !topbar ||
            !actions ||
            !bellButton ||
            !profileButton
        ) {
            console.warn(
                "Goals top bar elements were not found."
            );

            return;
        }

        addTopbarStyles();

        // Move mobile menu beside search
        const mobileMenu = $("mobileMenu");

        if (
            mobileMenu &&
            search &&
            mobileMenu.parentElement === actions
        ) {
            topbar.insertBefore(mobileMenu, search);
        }

        function wrap(element) {
            const div = document.createElement("div");

            div.className = "bw-top-wrap";

            element.parentNode.insertBefore(div, element);

            div.appendChild(element);

            return div;
        }

        const notificationWrap = wrap(bellButton);
        const profileWrap = wrap(profileButton);

        // ====================================================
        // BELL BUTTON
        // ====================================================

        bellButton.id = "goalsNotificationButton";

        bellButton.setAttribute(
            "aria-label",
            "Open notifications"
        );

        bellButton.setAttribute(
            "aria-expanded",
            "false"
        );

        bellButton.setAttribute(
            "aria-controls",
            "goalsNotificationMenu"
        );

        // ====================================================
        // PROFILE BUTTON
        // ====================================================

        const avatar = $("topAvatar");

        if (avatar) {
            profileButton.insertBefore(
                avatar,
                profileButton.firstChild
            );
        }

        if (!profileButton.querySelector(".bw-chevron")) {
            const chevron = document.createElement("i");

            chevron.dataset.lucide = "chevron-down";
            chevron.className = "bw-chevron";

            chevron.setAttribute(
                "aria-hidden",
                "true"
            );

            profileButton.appendChild(chevron);
        }

        profileButton.setAttribute(
            "role",
            "button"
        );

        profileButton.setAttribute(
            "tabindex",
            "0"
        );

        profileButton.setAttribute(
            "aria-label",
            "Open profile menu"
        );

        profileButton.setAttribute(
            "aria-expanded",
            "false"
        );

        profileButton.setAttribute(
            "aria-controls",
            "goalsProfileMenu"
        );

        // ====================================================
        // CREATE NOTIFICATION DROPDOWN
        // ====================================================

        notificationMenu = document.createElement("div");

        notificationMenu.id = "goalsNotificationMenu";
        notificationMenu.className = "bw-goal-dropdown";

        notificationMenu.setAttribute(
            "role",
            "region"
        );

        notificationMenu.setAttribute(
            "aria-label",
            "Goal notifications"
        );

        notificationWrap.appendChild(notificationMenu);

        // ====================================================
        // CREATE PROFILE DROPDOWN
        // ====================================================

        profileMenu = document.createElement("div");

        profileMenu.id = "goalsProfileMenu";
        profileMenu.className = "bw-goal-dropdown";

        profileWrap.appendChild(profileMenu);

        // ====================================================
        // NOTIFICATION CLICK
        // ====================================================

        bellButton.addEventListener("click", (event) => {
            event.stopPropagation();

            const shouldOpen =
                !notificationMenu.classList.contains("show");

            closeTopMenus();

            if (shouldOpen) {
                renderNotifications();

                notificationMenu.classList.add("show");

                bellButton.setAttribute(
                    "aria-expanded",
                    "true"
                );
            }
        });

        // ====================================================
        // PROFILE CLICK
        // ====================================================

        function toggleProfile(event) {
            event.stopPropagation();

            const shouldOpen =
                !profileMenu.classList.contains("show");

            closeTopMenus();

            if (shouldOpen) {
                renderProfileMenu();

                profileMenu.classList.add("show");

                profileButton.setAttribute(
                    "aria-expanded",
                    "true"
                );
            }
        }

        profileButton.addEventListener(
            "click",
            toggleProfile
        );

        profileButton.addEventListener(
            "keydown",
            (event) => {
                if (
                    event.key === "Enter" ||
                    event.key === " "
                ) {
                    event.preventDefault();
                    toggleProfile(event);
                }
            }
        );

        notificationMenu.addEventListener(
            "click",
            (event) => event.stopPropagation()
        );

        profileMenu.addEventListener(
            "click",
            (event) => event.stopPropagation()
        );

        document.addEventListener(
            "click",
            closeTopMenus
        );

        renderNotifications();
        refreshIcons();
    }

    // ========================================================
    // INITIALIZE GOALS PAGE
    // ========================================================

    document.addEventListener(
        "DOMContentLoaded",
        () => {
            const token = localStorage.getItem(
                "access_token"
            );

            if (!token) {
                logout();
                return;
            }

            // Set up controls immediately
            setupGoalEvents();
            setupTopbar();
            updateUserDisplay();

            refreshIcons();

            // Load from the backend independently.
            // No need to delay the page's initial display.
            void loadUser();
            void loadGoals();
        }
    );

})();
