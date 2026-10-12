
const API_URL = "http://127.0.0.1:8000/api/v1";
let selectedReportMonth = new Date().toISOString().slice(0, 7);

document.addEventListener("DOMContentLoaded", initializeReports);

// ============================================================
// INITIALIZE
// ============================================================

async function initializeReports() {
    const token = localStorage.getItem("access_token");

    if (!token) {
        window.location.replace("login.html");
        return;
    }

    setupMobileMenu();
    setupRefreshButton();
    setupSearch();
    setupReportMonthPicker();
    setupReportsTopbarMenus();

    await loadReports();
    refreshIcons();
}

// ============================================================
// API REQUEST
// ============================================================

async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem("access_token");

    if (!token) {
        window.location.replace("login.html");
        throw new Error("Session expired.");
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            ...(options.headers || {}),
            "Authorization": `Bearer ${token}`
        }
    });

    if (response.status === 401) {
        ["access_token", "user_email", "user_name", "user_id"]
            .forEach(key => localStorage.removeItem(key));

        window.location.replace("login.html");
        throw new Error("Session expired.");
    }

    let data = {};

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        let message = "Request failed.";

        if (Array.isArray(data.detail)) {
            message = data.detail.map(error => error.msg).join(", ");
        } else if (data.detail) {
            message = data.detail;
        }

        throw new Error(message);
    }

    return data;
}

// ============================================================
// TOPBAR MENUS — SINGLE BELL AND SINGLE PROFILE
// ============================================================

function setupReportsTopbarMenus() {
    const profile = document.getElementById("topProfile");
    const notificationButton = document.getElementById("notificationButton");
    const actions = document.querySelector(".top-actions");

    if (!profile || !notificationButton || !actions) {
        console.warn("Reports topbar elements are missing.");
        return;
    }

    // Remove only old dropdown panels, never the actual icons.
    document.getElementById("reportsProfileMenu")?.remove();
    document.getElementById("reportsNotificationPanel")?.remove();

    actions.style.position = "relative";

    const profileMenu = document.createElement("div");
    profileMenu.id = "reportsProfileMenu";
    profileMenu.className = "reports-dropdown";

    profileMenu.innerHTML = `
        <div class="reports-dropdown-heading">
            <strong id="reportsProfileName">Your account</strong>
            <span id="reportsProfileEmail">BudgetWise account</span>
        </div>

        <a class="reports-dropdown-item" href="settings.html">
            <i data-lucide="user-round"></i>
            <span>Profile &amp; Settings</span>
        </a>

        <a class="reports-dropdown-item" href="transactions.html">
            <i data-lucide="arrow-left-right"></i>
            <span>Transactions</span>
        </a>

        <a class="reports-dropdown-item" href="dashboard.html">
            <i data-lucide="layout-dashboard"></i>
            <span>Dashboard</span>
        </a>

        <button type="button"
            class="reports-dropdown-item"
            data-reports-logout>
            <i data-lucide="log-out"></i>
            <span>Log out</span>
        </button>
    `;

    const notificationPanel = document.createElement("div");
    notificationPanel.id = "reportsNotificationPanel";
    notificationPanel.className = "reports-dropdown";

    notificationPanel.innerHTML = `
        <div class="reports-dropdown-heading">
            <strong>Notifications</strong>
            <span>Your financial updates</span>
        </div>

        <div id="reportsNotificationContent"
             class="reports-notification-message">
            Loading your financial updates...
        </div>

        <a class="reports-dropdown-item" href="budgets.html">
            <i data-lucide="wallet-cards"></i>
            <span>View budgets</span>
        </a>
    `;

    // Append dropdowns to the actions container, not to the buttons.
    actions.appendChild(profileMenu);
    actions.appendChild(notificationPanel);

    function closeMenus() {
        profileMenu.classList.remove("show");
        notificationPanel.classList.remove("show");

        profile.setAttribute("aria-expanded", "false");
        notificationButton.setAttribute("aria-expanded", "false");
    }

    profile.addEventListener("click", event => {
        event.stopPropagation();

        const shouldOpen = !profileMenu.classList.contains("show");
        closeMenus();

        if (shouldOpen) {
            profileMenu.classList.add("show");
            profile.setAttribute("aria-expanded", "true");
        }
    });

    notificationButton.addEventListener("click", async event => {
        event.stopPropagation();

        const shouldOpen = !notificationPanel.classList.contains("show");
        closeMenus();

        if (shouldOpen) {
            notificationPanel.classList.add("show");
            notificationButton.setAttribute("aria-expanded", "true");
            await loadReportsNotifications();
        }
    });

    profileMenu.addEventListener("click", event => {
        event.stopPropagation();
    });

    notificationPanel.addEventListener("click", event => {
        event.stopPropagation();
    });

    document.addEventListener("click", closeMenus);

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeMenus();
    });

    profileMenu.querySelector("[data-reports-logout]")
        .addEventListener("click", () => {
            [
                "access_token",
                "user_email",
                "user_name",
                "user_id"
            ].forEach(key => localStorage.removeItem(key));

            window.location.replace("login.html");
        });

    profileMenu.querySelector("#reportsProfileName").textContent =
        localStorage.getItem("user_name") || "Your account";

    profileMenu.querySelector("#reportsProfileEmail").textContent =
        localStorage.getItem("user_email") || "BudgetWise account";

    refreshIcons();
}

// ============================================================
// NOTIFICATIONS
// ============================================================

async function loadReportsNotifications() {
    const content = document.getElementById("reportsNotificationContent");

    if (!content) return;

    content.textContent = "Checking your budget alerts...";

    try {
        const [budgetsData, expensesData] = await Promise.all([
            apiRequest("/budgets"),
            apiRequest("/expenses")
        ]);

        const budgets = Array.isArray(budgetsData)
            ? budgetsData
            : budgetsData.budgets || [];

        const expenses = Array.isArray(expensesData)
            ? expensesData
            : expensesData.expenses || [];

        const alerts = [];

        budgets.forEach(budget => {
            const category = String(budget.category || "").toLowerCase();
            const limit = Number(
                budget.limit_amount ?? budget.amount ?? budget.budget_amount ?? 0
            );

            if (!limit || !category) return;

            const spent = expenses
                .filter(expense =>
                    String(expense.category || "").toLowerCase() === category
                )
                .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

            const percentage = (spent / limit) * 100;

            if (percentage >= 100) {
                alerts.push({
                    title: `${budget.category}: budget exceeded`,
                    message: `${percentage.toFixed(0)}% of your budget used.`,
                    icon: "circle-alert"
                });
            } else if (percentage >= 80) {
                alerts.push({
                    title: `${budget.category}: budget almost used`,
                    message: `${percentage.toFixed(0)}% of your budget used.`,
                    icon: "triangle-alert"
                });
            }
        });

        if (!alerts.length) {
            content.textContent =
                "No budget alerts right now. You're all caught up.";
            return;
        }

        content.innerHTML = alerts.map(alert => `
            <div class="reports-notification-entry">
                <i data-lucide="${alert.icon}"></i>
                <div>
                    <strong>${escapeHtml(alert.title)}</strong>
                    <span>${escapeHtml(alert.message)}</span>
                </div>
            </div>
        `).join("");

        refreshIcons();
    } catch (error) {
        console.error("Unable to load report notifications:", error);
        content.textContent =
            "We couldn't load budget alerts. You can still visit the Budgets page.";
    }
}

// ============================================================
// LOAD REPORTS
// ============================================================

async function loadReports() {
    try {
        showLoading();

        const [user, dashboard, expensesData] = await Promise.all([
            apiRequest("/users/me"),
            apiRequest(`/dashboard?month=${encodeURIComponent(selectedReportMonth)}`),
            apiRequest(`/expenses?month=${encodeURIComponent(selectedReportMonth)}`)
        ]);

        const expenses = Array.isArray(expensesData)
            ? expensesData
            : expensesData.expenses || [];

        updateUser(user);
        updateSummary(user, dashboard);
        updateIncomeHistoryNotice(dashboard);
        renderExpenseTrend(expenses);
        renderCategories(dashboard, expenses);
        renderHighestCategory(dashboard, expenses);
        renderExpenseTable(expenses);

        refreshIcons();
    } catch (error) {
        console.error("Reports error:", error);

        if (error.message !== "Session expired.") {
            showError(error.message);
        }
    }
}

// ============================================================
// MONTH PICKER AND HISTORICAL-INCOME NOTICE
// ============================================================

function setupReportMonthPicker() {
    if (document.getElementById("reportsMonthInput")) return;
    const refresh = document.getElementById("refreshReports");
    if (!refresh) return;

    const label = document.createElement("label");
    label.style.cssText =
        "display:inline-flex;align-items:center;gap:9px;" +
        "font-size:13px;font-weight:700;color:#173b2a;flex-wrap:wrap";
    label.textContent = "Financial month ";

    const input = document.createElement("input");
    input.type = "month";
    input.id = "reportsMonthInput";
    input.value = selectedReportMonth;
    input.style.cssText =
        "border:1px solid #dce9df;border-radius:10px;padding:10px 12px;" +
        "background:#fff;color:#173b2a;font:inherit;font-size:13px;" +
        "max-width:100%";
    label.appendChild(input);
    refresh.parentNode.insertBefore(label, refresh);

    input.addEventListener("change", async () => {
        if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(input.value)) return;
        selectedReportMonth = input.value;
        await loadReports();
    });
}

function updateIncomeHistoryNotice(dashboard) {
    let note = document.getElementById("reportsIncomeHistoryNotice");
    if (!note) {
        const anchor = document.querySelector(".reports-summary");
        if (!anchor) return;
        note = document.createElement("div");
        note.id = "reportsIncomeHistoryNotice";
        note.style.cssText =
            "margin:10px 0;padding:11px 14px;border-radius:10px;" +
            "background:#fff7e9;color:#8b5c23;font-size:12px";
        anchor.parentNode.insertBefore(note, anchor);
    }
    note.style.display = dashboard.income_recorded === false ? "block" : "none";
    note.textContent =
        "No verified income record is available for this month. " +
        "Expenses are shown accurately, but balance and savings " +
        "calculations require historical income data.";
}

// ============================================================
// USER INFORMATION
// ============================================================

function updateUser(user) {
    const name = user.name || user.full_name || "User";
    const firstLetter = name.charAt(0).toUpperCase();

    const sidebarName = document.getElementById("sidebarUserName");
    const topName = document.getElementById("topUserName");
    const sidebarEmail = document.getElementById("sidebarUserEmail");
    const sidebarAvatar = document.getElementById("sidebarAvatar");
    const topAvatar = document.getElementById("topAvatar");

    if (sidebarName) sidebarName.textContent = name;
    if (topName) topName.textContent = name;
    if (sidebarEmail) sidebarEmail.textContent = user.email || "BudgetWise User";
    if (sidebarAvatar) sidebarAvatar.textContent = firstLetter;
    if (topAvatar) topAvatar.textContent = firstLetter;

    const menuName = document.getElementById("reportsProfileName");
    const menuEmail = document.getElementById("reportsProfileEmail");

    if (menuName) menuName.textContent = name;
    if (menuEmail) menuEmail.textContent = user.email || "BudgetWise account";
}

// ============================================================
// SUMMARY CARDS
// ============================================================

function updateSummary(user, dashboard) {
    const income = Number(dashboard.income ?? user.income ?? 0);
    const expenses = Number(dashboard.total_expenses ?? 0);
    const balance = Number(dashboard.balance ?? income - expenses);
    const savingsRate = Number(
        dashboard.savings_rate ??
        (income > 0 ? (balance / income) * 100 : 0)
    );

    const incomeElement = document.getElementById("reportIncome");
    const expensesElement = document.getElementById("reportExpenses");
    const balanceElement = document.getElementById("reportBalance");
    const savingsElement = document.getElementById("reportSavings");

    if (incomeElement) incomeElement.textContent = formatCurrency(income);
    if (expensesElement) expensesElement.textContent = formatCurrency(expenses);
    if (balanceElement) balanceElement.textContent = formatCurrency(balance);
    if (savingsElement) savingsElement.textContent = `${savingsRate.toFixed(1)}%`;
}

// ============================================================
// EXPENSE TREND
// ============================================================


function renderExpenseTrend(expenses) {
    const container = document.getElementById("expenseTrend");

    if (!container) return;

    const records = Array.isArray(expenses) ? expenses : [];

    // ========================================================
    // FORMATTERS
    // ========================================================

    const formatNaira = (value) => {
        return new Intl.NumberFormat("en-NG", {
            style: "currency",
            currency: "NGN",
            maximumFractionDigits: 0
        }).format(Number(value) || 0);
    };

    const compactNaira = (value) => {
        const amount = Number(value) || 0;

        if (amount >= 1000000) {
            return `₦${(amount / 1000000).toFixed(1)}m`;
        }

        if (amount >= 1000) {
            return `₦${Math.round(amount / 1000)}k`;
        }

        return `₦${Math.round(amount)}`;
    };

    const localDateKey = (date) => {
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0")
        ].join("-");
    };

    const getDateKey = (value) => {
        if (!value) return "";

        if (value instanceof Date) {
            return Number.isNaN(value.getTime())
                ? ""
                : localDateKey(value);
        }

        const text = String(value);
        const match = text.match(/^(\d{4}-\d{2}-\d{2})/);

        if (match) return match[1];

        const parsed = new Date(text);

        return Number.isNaN(parsed.getTime())
            ? ""
            : localDateKey(parsed);
    };

    const keyToDate = (key) => {
        const [year, month, day] = key.split("-").map(Number);
        return new Date(year, month - 1, day);
    };

    // ========================================================
    // EMPTY STATE
    // ========================================================

    if (!records.length) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <i data-lucide="chart-area"></i>
                </div>
                <h3>No expense data yet</h3>
                <p>Add an expense to see your spending trend.</p>
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();
        return;
    }

    // ========================================================
    // DAILY EXPENSE TOTALS
    // ========================================================

    const totals = new Map();
    const counts = new Map();

    for (const expense of records) {
        const key = getDateKey(
            expense.date ??
            expense.expense_date ??
            expense.created_at ??
            expense.createdAt
        );

        if (!key) continue;

        const value = Math.max(0, Number(expense.amount) || 0);

        totals.set(key, (totals.get(key) || 0) + value);
        counts.set(key, (counts.get(key) || 0) + 1);
    }

    if (!totals.size) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <i data-lucide="calendar-x"></i>
                </div>
                <h3>Expense dates unavailable</h3>
                <p>Transactions need dates to display a daily chart.</p>
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();
        return;
    }

    // ========================================================
    // DATE RANGE
    // ========================================================

    const days = [7, 14, 30].includes(window.bwReportsTrendDays)
        ? window.bwReportsTrendDays
        : 7;

    const todayKey = localDateKey(new Date());
    const lastRecordedKey = [...totals.keys()].sort().at(-1);

    const endKey = lastRecordedKey > todayKey
        ? lastRecordedKey
        : todayKey;

    const endDate = keyToDate(endKey);

    const series = Array.from({ length: days }, (_, index) => {
        const date = new Date(endDate);

        date.setDate(endDate.getDate() - (days - 1 - index));

        const key = localDateKey(date);

        return {
            date,
            key,
            amount: totals.get(key) || 0,
            count: counts.get(key) || 0
        };
    });

    // ========================================================
    // FINANCIAL STATISTICS
    // ========================================================

    const total = series.reduce(
        (sum, item) => sum + item.amount,
        0
    );

    const highest = Math.max(
        0,
        ...series.map(item => item.amount)
    );

    const average = total / days;

    // ========================================================
    // SVG DIMENSIONS
    // ========================================================

    const width = 760;
    const height = 260;

    const left = 68;
    const right = 28;
    const top = 34;
    const bottom = 208;

    const plotWidth = width - left - right;
    const plotHeight = bottom - top;

    const roughStep = Math.max(highest * 1.12 / 4, 1);

    const magnitude = Math.pow(
        10,
        Math.floor(Math.log10(roughStep))
    );

    const step = [1, 2, 2.5, 5, 10]
        .map(value => value * magnitude)
        .find(value => value >= roughStep) || magnitude * 10;

    const maxValue = highest > 0 ? step * 4 : 1000;

    // ========================================================
    // CHART COORDINATES
    // ========================================================

    const points = series.map((item, index) => {
        const x = left + (index / (days - 1)) * plotWidth;

        const y = bottom -
            (item.amount / maxValue) * plotHeight;

        return {
            ...item,
            x,
            y
        };
    });

    // ========================================================
    // CREATE SMOOTH CURVED LINE
    // ========================================================

    let linePath = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
        const previous = points[i - 1];
        const current = points[i];

        const distance = current.x - previous.x;

        const control1X = previous.x + distance * 0.45;
        const control2X = current.x - distance * 0.45;

        linePath += `
            C ${control1X} ${previous.y},
              ${control2X} ${current.y},
              ${current.x} ${current.y}
        `;
    }

    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];

    const areaPath = `
        ${linePath}
        L ${lastPoint.x} ${bottom}
        L ${firstPoint.x} ${bottom}
        Z
    `;

    // ========================================================
    // CHART GRID
    // ========================================================

    const grid = Array.from({ length: 5 }, (_, index) => {
        const y = top + (index / 4) * plotHeight;

        const value = maxValue * (4 - index) / 4;

        return `
            <line
                x1="${left}"
                y1="${y}"
                x2="${width - right}"
                y2="${y}"
                stroke="#e6eee8"
                stroke-dasharray="4 5"
            />

            <text
                x="${left - 11}"
                y="${y + 4}"
                text-anchor="end"
                fill="#829488"
                font-size="11"
            >
                ${compactNaira(value)}
            </text>
        `;
    }).join("");

    // ========================================================
    // DATE LABELS
    // ========================================================

    const labels = points.map((point, index) => {
        const visible = days === 7 ||
            (days === 14
                ? index % 2 === 0 || index === days - 1
                : index % 5 === 0 || index === days - 1);

        if (!visible) return "";

        const date = point.date.toLocaleDateString("en-NG", {
            day: "numeric",
            month: "short"
        });

        return `
            <text
                x="${point.x}"
                y="235"
                text-anchor="middle"
                fill="#839389"
                font-size="11"
            >
                ${date}
            </text>
        `;
    }).join("");

    // ========================================================
    // POINT MARKERS
    // ========================================================

    const markers = points.map((point, index) => {
        if (point.amount === 0) return "";

        if (days > 14 && index !== days - 1) return "";

        return `
            <circle
                cx="${point.x}"
                cy="${point.y}"
                r="4.5"
                fill="#24875f"
                stroke="#ffffff"
                stroke-width="2"
            />
        `;
    }).join("");

    // ========================================================
    // INTERACTIVE HOVER TARGETS
    // ========================================================

    const hitWidth = plotWidth / (days - 1);

    const targets = points.map((point, index) => `
        <rect
            class="bw-area-hit"
            data-point-index="${index}"
            x="${Math.max(left, point.x - hitWidth / 2)}"
            y="${top}"
            width="${Math.min(
                hitWidth,
                width - right - Math.max(
                    left,
                    point.x - hitWidth / 2
                )
            )}"
            height="${plotHeight}"
            fill="transparent"
            tabindex="0"
            aria-label="${point.date.toLocaleDateString(
                "en-NG",
                { day: "numeric", month: "long", year: "numeric" }
            )}: ${formatNaira(point.amount)}"
        />
    `).join("");

    // ========================================================
    // STYLES
    // ========================================================

    if (!document.getElementById("bwAreaTrendStyles")) {
        const style = document.createElement("style");

        style.id = "bwAreaTrendStyles";

        style.textContent = `
            #expenseTrend {
                width: 100%;
                height: auto !important;
                min-height: 310px;
            }

            #expenseTrend .bw-area-chart {
                position: relative;
                width: 100%;
                padding: 8px 0 0;
            }

            #expenseTrend .bw-area-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                flex-wrap: wrap;
                gap: 15px;
                margin-bottom: 14px;
            }

            #expenseTrend .bw-area-stats {
                display: flex;
                gap: 24px;
                flex-wrap: wrap;
            }

            #expenseTrend .bw-area-stat {
                display: flex;
                flex-direction: column;
                gap: 5px;
            }

            #expenseTrend .bw-area-stat span {
                font-size: 11px;
                color: #829389;
            }

            #expenseTrend .bw-area-stat strong {
                font-size: 16px;
                font-weight: 700;
                color: #194b34;
            }

            #expenseTrend .bw-area-ranges {
                display: flex;
                gap: 3px;
                padding: 3px;
                border-radius: 10px;
                background: #edf5ef;
            }

            #expenseTrend .bw-area-range {
                border: none;
                border-radius: 7px;
                background: transparent;
                padding: 7px 11px;
                font-family: inherit;
                font-weight: 600;
                font-size: 11px;
                color: #6c8576;
                cursor: pointer;
            }

            #expenseTrend .bw-area-range.active {
                background: #216447;
                color: #ffffff;
            }

            #expenseTrend .bw-area-graph {
                position: relative;
                width: 100%;
            }

            #expenseTrend .bw-area-graph svg {
                display: block;
                width: 100%;
                height: auto;
                overflow: visible;
            }

            #expenseTrend .bw-area-hit {
                cursor: crosshair;
                outline: none;
            }

            #expenseTrend .bw-area-hit:focus-visible {
                stroke: #216447;
                stroke-width: 1;
                stroke-dasharray: 4 4;
            }

            #expenseTrend .bw-area-tooltip {
                display: none;
                position: absolute;
                top: 8px;
                left: 50%;
                z-index: 5;
                transform: translateX(-50%);
                padding: 11px 14px;
                background: #153f2e;
                color: #ffffff;
                border-radius: 10px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.13);
                pointer-events: none;
                text-align: center;
                min-width: 130px;
            }

            #expenseTrend .bw-area-tooltip.show {
                display: flex;
                flex-direction: column;
                gap: 5px;
            }

            #expenseTrend .bw-area-tooltip small {
                font-size: 10px;
                opacity: 0.75;
            }

            #expenseTrend .bw-area-tooltip strong {
                font-size: 14px;
                white-space: nowrap;
            }

            #expenseTrend .bw-area-tooltip span {
                font-size: 10px;
                opacity: 0.85;
            }

            #expenseTrend .bw-area-footer {
                display: flex;
                justify-content: space-between;
                gap: 10px;
                flex-wrap: wrap;
                padding: 0 8px;
                color: #819389;
                font-size: 11px;
            }

            #expenseTrend .bw-area-legend {
                display: inline-block;
                width: 9px;
                height: 9px;
                border-radius: 50%;
                background: #24875f;
                margin-right: 6px;
            }

            @media (max-width: 650px) {
                #expenseTrend .bw-area-stats {
                    gap: 12px;
                }

                #expenseTrend .bw-area-stat strong {
                    font-size: 13px;
                }
            }
        `;

        document.head.appendChild(style);
    }

    // ========================================================
    // RENDER CHART
    // ========================================================

    container.innerHTML = `
        <div class="bw-area-chart">

            <div class="bw-area-header">

                <div class="bw-area-stats">

                    <div class="bw-area-stat">
                        <span>Total spending</span>
                        <strong>${formatNaira(total)}</strong>
                    </div>

                    <div class="bw-area-stat">
                        <span>Daily average</span>
                        <strong>${formatNaira(average)}</strong>
                    </div>

                    <div class="bw-area-stat">
                        <span>Highest day</span>
                        <strong>${formatNaira(highest)}</strong>
                    </div>

                </div>

                <div class="bw-area-ranges">
                    ${[7, 14, 30].map(count => `
                        <button
                            type="button"
                            class="bw-area-range ${
                                count === days ? "active" : ""
                            }"
                            data-area-days="${count}"
                        >
                            ${count}D
                        </button>
                    `).join("")}
                </div>

            </div>

            <div class="bw-area-graph">

                <svg
                    viewBox="0 0 760 260"
                    role="img"
                    aria-label="Smooth area chart of daily expenses"
                >

                    <defs>
                        <linearGradient
                            id="bwExpenseGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stop-color="#259467"
                                stop-opacity="0.32"
                            />

                            <stop
                                offset="100%"
                                stop-color="#259467"
                                stop-opacity="0.01"
                            />
                        </linearGradient>
                    </defs>

                    ${grid}

                    <path
                        d="${areaPath}"
                        fill="url(#bwExpenseGradient)"
                    />

                    <path
                        d="${linePath}"
                        fill="none"
                        stroke="#24875f"
                        stroke-width="3.5"
                        stroke-linejoin="round"
                        stroke-linecap="round"
                    />

                    ${markers}

                    <line
                        id="bwAreaGuide"
                        x1="0"
                        y1="${top}"
                        x2="0"
                        y2="${bottom}"
                        stroke="#24875f"
                        stroke-width="1"
                        stroke-dasharray="4 4"
                        opacity="0"
                    />

                    <circle
                        id="bwAreaActivePoint"
                        cx="0"
                        cy="0"
                        r="6"
                        fill="#24875f"
                        stroke="#ffffff"
                        stroke-width="3"
                        opacity="0"
                    />

                    ${labels}
                    ${targets}

                </svg>

                <div
                    class="bw-area-tooltip"
                    id="bwAreaTooltip"
                >
                    <small id="bwAreaTooltipDate"></small>
                    <strong id="bwAreaTooltipAmount"></strong>
                    <span id="bwAreaTooltipCount"></span>
                </div>

            </div>

            <div class="bw-area-footer">
                <span>
                    <i class="bw-area-legend"></i>
                    Daily spending
                </span>

                <span>
                    Hover over the line for details
                </span>
            </div>

        </div>
    `;

    // ========================================================
    // HOVER INTERACTION
    // ========================================================

    const graph = container.querySelector(".bw-area-graph");
    const tooltip = container.querySelector("#bwAreaTooltip");

    const guide = container.querySelector("#bwAreaGuide");

    const activePoint = container.querySelector(
        "#bwAreaActivePoint"
    );

    const showPoint = (index) => {
        const point = points[index];

        if (!point) return;

        const bounds = graph.getBoundingClientRect();

        const x = (point.x / width) * bounds.width;

        const tooltipX = Math.min(
            Math.max(x, 75),
            Math.max(75, bounds.width - 75)
        );

        tooltip.style.left = `${tooltipX}px`;

        container.querySelector(
            "#bwAreaTooltipDate"
        ).textContent = point.date.toLocaleDateString(
            "en-NG",
            {
                weekday: "short",
                day: "numeric",
                month: "short"
            }
        );

        container.querySelector(
            "#bwAreaTooltipAmount"
        ).textContent = formatNaira(point.amount);

        container.querySelector(
            "#bwAreaTooltipCount"
        ).textContent =
            `${point.count} transaction(s)`;

        guide.setAttribute("x1", point.x);
        guide.setAttribute("x2", point.x);
        guide.setAttribute("opacity", "0.7");

        activePoint.setAttribute("cx", point.x);
        activePoint.setAttribute("cy", point.y);
        activePoint.setAttribute("opacity", "1");

        tooltip.classList.add("show");
    };

    const hidePoint = () => {
        tooltip.classList.remove("show");
        guide.setAttribute("opacity", "0");
        activePoint.setAttribute("opacity", "0");
    };

    container.querySelectorAll(".bw-area-hit").forEach(hit => {
        const index = Number(hit.dataset.pointIndex);

        hit.addEventListener("pointerenter", () => {
            showPoint(index);
        });

        hit.addEventListener("pointerleave", hidePoint);

        hit.addEventListener("click", () => {
            showPoint(index);
        });

        hit.addEventListener("focus", () => {
            showPoint(index);
        });

        hit.addEventListener("blur", hidePoint);
    });

    // ========================================================
    // SWITCH BETWEEN 7, 14 AND 30 DAYS
    // ========================================================

    container.querySelectorAll("[data-area-days]")
        .forEach(button => {
            button.addEventListener("click", () => {
                window.bwReportsTrendDays = Number(
                    button.dataset.areaDays
                );

                renderExpenseTrend(records);
            });
        });
}


// ============================================================
// CATEGORY REPORT
// ============================================================

function renderCategories(dashboard, expenses) {
    const container = document.getElementById("categoryReport");
    if (!container) return;

    container.innerHTML = "";

    let categories = dashboard?.spending_by_category;

    if (!categories || typeof categories !== "object") {
        categories = {};

        expenses.forEach(expense => {
            const category = expense.category || "Other";
            categories[category] =
                (categories[category] || 0) + Number(expense.amount || 0);
        });
    }

    const sorted = Object.entries(categories)
        .map(([category, amount]) => [category, Number(amount) || 0])
        .sort((a, b) => b[1] - a[1]);

    if (!sorted.length) {
        container.innerHTML = emptyState(
            "pie-chart",
            "No category data yet",
            "Add expenses to see your category breakdown."
        );
        refreshIcons();
        return;
    }

    const total = sorted.reduce((sum, [, amount]) => sum + amount, 0);
    const list = document.createElement("div");
    list.className = "category-report-list";

    sorted.slice(0, 6).forEach(([category, amount]) => {
        const percentage = total > 0 ? amount / total * 100 : 0;
        const item = document.createElement("div");
        item.className = "category-item";

        item.innerHTML = `
            <div class="category-header">
                <span class="category-name">${escapeHtml(category)}</span>
                <span class="category-amount">${formatCurrency(amount)}</span>
            </div>
            <div class="category-track">
                <div class="category-fill" style="width:${percentage}%"></div>
            </div>
            <div class="category-percentage">${percentage.toFixed(1)}%</div>
        `;

        list.appendChild(item);
    });

    container.appendChild(list);
}

// ============================================================
// HIGHEST SPENDING CATEGORY
// ============================================================

function renderHighestCategory(dashboard, expenses) {
    const container = document.getElementById("highestCategory");
    if (!container) return;

    let highest = dashboard?.highest_spending_category;

    if (!highest?.category) {
        const categories = {};

        expenses.forEach(expense => {
            const category = expense.category || "Other";
            categories[category] =
                (categories[category] || 0) + Number(expense.amount || 0);
        });

        const entries = Object.entries(categories).sort((a, b) => b[1] - a[1]);

        highest = entries.length
            ? { category: entries[0][0], amount: entries[0][1] }
            : null;
    }

    if (!highest) {
        container.innerHTML = emptyState(
            "circle-dollar-sign",
            "No spending data",
            "Your highest spending category will appear here."
        );
        refreshIcons();
        return;
    }

    container.innerHTML = `
        <div class="highest-category-content">
            <div class="highest-category-icon">
                <i data-lucide="flame"></i>
            </div>
            <div class="highest-category-label">HIGHEST SPENDING CATEGORY</div>
            <div class="highest-category-name">${escapeHtml(highest.category || "Other")}</div>
            <div class="highest-category-amount">${formatCurrency(Number(highest.amount || 0))}</div>
            <div class="highest-category-note">
                This is your largest recorded spending category.
            </div>
        </div>
    `;

    refreshIcons();
}

// ============================================================
// EXPENSE TABLE
// ============================================================

function renderExpenseTable(expenses) {
    const container = document.getElementById("expenseTableContainer");
    if (!container) return;

    container.innerHTML = "";

    if (!expenses.length) {
        container.innerHTML = `
            <div class="expense-table-empty">
                <div class="empty-icon"><i data-lucide="receipt-text"></i></div>
                <h3>No expenses yet</h3>
                <p>Your expense records will appear here.</p>
            </div>
        `;
        refreshIcons();
        return;
    }

    const sortedExpenses = [...expenses]
        .sort((a, b) =>
            new Date(b.date || b.created_at || 0) -
            new Date(a.date || a.created_at || 0)
        )
        .slice(0, 10);

    const table = document.createElement("table");
    table.className = "expense-table";

    table.innerHTML = `
        <thead>
            <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Amount</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");

    sortedExpenses.forEach(expense => {
        const row = document.createElement("tr");
        const date = getExpenseDate(expense);

        row.innerHTML = `
            <td>${date ? formatFullDate(date) : "—"}</td>
            <td>${escapeHtml(expense.category || "Other")}</td>
            <td>${escapeHtml(expense.description || "Expense")}</td>
            <td><strong>${formatCurrency(Number(expense.amount || 0))}</strong></td>
        `;

        tbody.appendChild(row);
    });

    container.appendChild(table);
}

// ============================================================
// MOBILE MENU
// ============================================================

function setupMobileMenu() {
    const button = document.getElementById("mobileMenu");
    const sidebar = document.getElementById("sidebar");

    if (!button || !sidebar) return;

    button.addEventListener("click", () => {
        sidebar.classList.toggle("open");
    });
}

// ============================================================
// REFRESH BUTTON
// ============================================================

function setupRefreshButton() {
    const button = document.getElementById("refreshReports");
    if (!button) return;

    button.addEventListener("click", async () => {
        if (button.disabled) return;

        button.disabled = true;
        button.innerHTML = `
            <i data-lucide="loader-2"></i>
            <span>Refreshing...</span>
        `;
        refreshIcons();

        try {
            await loadReports();
        } finally {
            button.disabled = false;
            button.innerHTML = `
                <i data-lucide="refresh-cw"></i>
                <span>Refresh</span>
            `;
            refreshIcons();
        }
    });
}

// ============================================================
// SEARCH
// ============================================================

function setupSearch() {
    const searchInput = document.getElementById("searchInput");
    if (!searchInput) return;

    searchInput.addEventListener("input", function () {
        const search = this.value.toLowerCase().trim();

        document.querySelectorAll(".expense-table tbody tr").forEach(row => {
            row.style.display = row.textContent.toLowerCase().includes(search)
                ? ""
                : "none";
        });
    });
}

// ============================================================
// UTILITIES
// ============================================================

function formatCurrency(amount) {
    return new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: "NGN",
        maximumFractionDigits: 2
    }).format(Number(amount) || 0);
}

function formatCompactCurrency(amount) {
    const value = Number(amount) || 0;

    if (value >= 1000000) return `₦${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `₦${(value / 1000).toFixed(1)}K`;

    return `₦${Math.round(value)}`;
}

function getExpenseDate(expense) {
    const raw = expense.date || expense.created_at || expense.createdAt;
    if (!raw) return null;

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;

    return date.toISOString().split("T")[0];
}

function formatShortDate(dateString) {
    return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-NG", {
        day: "numeric",
        month: "short"
    });
}

function formatFullDate(dateString) {
    return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-NG", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function emptyState(icon, title, message) {
    return `
        <div class="empty-state">
            <div class="empty-icon"><i data-lucide="${icon}"></i></div>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

function showLoading() {
    const html = emptyState(
        "loader-2",
        "Loading report",
        "Please wait while your financial data is loaded."
    );

    [
        "expenseTrend",
        "categoryReport",
        "highestCategory",
        "expenseTableContainer"
    ].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.innerHTML = html;
    });

    refreshIcons();
}

function showError(message) {
    const trend = document.getElementById("expenseTrend");
    if (!trend) return;

    trend.innerHTML = emptyState(
        "circle-alert",
        "Unable to load reports",
        message
    );

    refreshIcons();
}

function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
    }
}
