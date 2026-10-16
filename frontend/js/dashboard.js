
/* ============================================================
   FUNDHAVEN DASHBOARD — COMPLETE REPLACEMENT
   Currency preferences + aligned recent transactions
   ============================================================ */

(() => {
    "use strict";

    const API_URL = (window.BUDGETWISE_API_BASE_URL || "http://127.0.0.1:8000/api/v1");

    const $ = (id) => document.getElementById(id);

    const COLORS = [
        "#246148",
        "#4f8df7",
        "#f59e0b",
        "#e85d75",
        "#8b5cf6",
        "#14b8a6",
        "#f97316",
        "#64748b"
    ];

    const FX_CACHE_KEY = "budgetwise_fx_ngn_v1";
    const PREFERENCES_KEY = "budgetwise_preferences";
    const FX_SUPPORTED = ["NGN", "USD", "GBP", "EUR"];
    const DAY_MS = 24 * 60 * 60 * 1000;

    const state = {
        user: {},
        expenses: [],
        budgets: [],
        dashboard: {},
        chartDays: 7,
        selectedMonth: new Date().toISOString().slice(0, 7),
        search: "",
        budgetError: false,
        preferences: {
            currency: "NGN",
            decimalPlaces: 0
        },
        displayCurrency: "NGN",
        fxRate: 1,
        fxDate: "",
        fxStale: false,
        fxUnavailable: false
    };

    // ========================================================
    // ICONS
    // ========================================================

    function icons() {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    // ========================================================
    // SAVED CURRENCY PREFERENCES
    // ========================================================

    function readPreferences() {
        let saved = {};

        try {
            saved = JSON.parse(
                localStorage.getItem(PREFERENCES_KEY) || "{}"
            ) || {};
        } catch (error) {
            console.warn(
                "Invalid FundHaven preferences:",
                error
            );
        }

        const requested = String(
            saved.currency || "NGN"
        ).toUpperCase();

        return {
            currency: FX_SUPPORTED.includes(requested)
                ? requested
                : "NGN",

            decimalPlaces: [0, 2].includes(
                Number(saved.decimalPlaces)
            )
                ? Number(saved.decimalPlaces)
                : 0
        };
    }

    // ========================================================
    // CURRENCY CONVERSION
    // ========================================================

    function ngnToDisplay(value) {
        return (Number(value) || 0) * state.fxRate;
    }

    function currency(value) {
        const decimalPlaces =
            state.preferences.decimalPlaces;

        const locale = {
            NGN: "en-NG",
            USD: "en-US",
            GBP: "en-GB",
            EUR: "en-IE"
        }[state.displayCurrency];

        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: state.displayCurrency,
            minimumFractionDigits: decimalPlaces,
            maximumFractionDigits: decimalPlaces
        }).format(ngnToDisplay(value));
    }

    function shortCurrency(value) {
        const n = ngnToDisplay(value);
        const abs = Math.abs(n);

        const mark =
            state.displayCurrency === "NGN" ? "₦" :
            state.displayCurrency === "USD" ? "$" :
            state.displayCurrency === "GBP" ? "£" : "€";

        const sign = n < 0 ? "−" : "";

        if (abs >= 1000000) {
            return `${sign}${mark}${(
                abs / 1000000
            ).toFixed(abs % 1000000 ? 1 : 0)}m`;
        }

        if (abs >= 1000) {
            return `${sign}${mark}${(
                abs / 1000
            ).toFixed(abs % 1000 ? 1 : 0)}k`;
        }

        const digits = state.displayCurrency === "NGN"
            ? 0
            : abs < 1 && abs > 0
                ? 2
                : 0;

        return `${sign}${mark}${abs.toFixed(digits)}`;
    }

    function validRate(value) {
        return Number.isFinite(Number(value)) &&
            Number(value) > 0;
    }

    // ========================================================
    // CACHED EXCHANGE RATES
    // ========================================================

    function getCachedRates() {
        try {
            const entry = JSON.parse(
                localStorage.getItem(FX_CACHE_KEY) || "null"
            );

            if (
                !entry ||
                !Number.isFinite(entry.savedAt)
            ) {
                return null;
            }

            if (
                entry.savedAt > Date.now() + 60000 ||
                Date.now() - entry.savedAt > 7 * DAY_MS
            ) {
                return null;
            }

            if (
                !["USD", "GBP", "EUR"].every(
                    code => validRate(entry.rates?.[code])
                )
            ) {
                return null;
            }

            return entry;

        } catch {
            return null;
        }
    }

    // ========================================================
    // FETCH EXCHANGE RATES
    // ========================================================

    async function getFreshRates() {
        const urls = [
            "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/ngn.min.json",
            "https://latest.currency-api.pages.dev/v1/currencies/ngn.min.json"
        ];

        let lastError;

        for (const url of urls) {
            const controller = new AbortController();

            const timeout = setTimeout(
                () => controller.abort(),
                4500
            );

            try {
                const response = await fetch(url, {
                    signal: controller.signal,
                    cache: "no-cache"
                });

                if (!response.ok) {
                    throw new Error(
                        `Exchange rate HTTP ${response.status}`
                    );
                }

                const result = await response.json();

                const rates = {
                    USD: Number(result?.ngn?.usd),
                    GBP: Number(result?.ngn?.gbp),
                    EUR: Number(result?.ngn?.eur)
                };

                if (!Object.values(rates).every(validRate)) {
                    throw new Error(
                        "Exchange rate response is incomplete."
                    );
                }

                return {
                    savedAt: Date.now(),
                    date: /^\d{4}-\d{2}-\d{2}$/.test(
                        result.date || ""
                    )
                        ? result.date
                        : "",
                    rates
                };

            } catch (error) {
                lastError = error;

                console.warn(
                    "Exchange-rate endpoint unavailable:",
                    url,
                    error
                );

            } finally {
                clearTimeout(timeout);
            }
        }

        throw lastError ||
            new Error("Exchange rates unavailable");
    }

    // ========================================================
    // LOAD CURRENCY PREFERENCE
    // ========================================================

    async function loadCurrencyPreference() {
        state.preferences = readPreferences();

        const wanted = state.preferences.currency;

        state.displayCurrency = "NGN";
        state.fxRate = 1;
        state.fxDate = "";
        state.fxStale = false;
        state.fxUnavailable = false;

        if (wanted === "NGN") {
            return;
        }

        const cached = getCachedRates();

        let entry = cached;

        const cacheAge = cached
            ? Date.now() - cached.savedAt
            : Infinity;

        if (cacheAge >= DAY_MS) {
            try {
                entry = await getFreshRates();

                localStorage.setItem(
                    FX_CACHE_KEY,
                    JSON.stringify(entry)
                );

            } catch (error) {
                entry = cached;

                if (!entry) {
                    state.fxUnavailable = true;

                    console.error(
                        "Cannot convert NGN; displaying original NGN amounts.",
                        error
                    );

                    return;
                }

                state.fxStale = true;
            }
        }

        if (
            !entry ||
            !validRate(entry.rates[wanted])
        ) {
            state.fxUnavailable = true;
            return;
        }

        state.displayCurrency = wanted;
        state.fxRate = Number(entry.rates[wanted]);
        state.fxDate = entry.date || "";

        renderCurrencyNote();
    }

    // ========================================================
    // CURRENCY INFORMATION
    // ========================================================

    function renderCurrencyNote() {
        let note = $("dashboardCurrencyNote");

        if (!note) {
            const anchor = document.querySelector(
                ".summary-grid"
            );

            if (!anchor) {
                return;
            }

            note = document.createElement("div");

            note.id = "dashboardCurrencyNote";

            note.style.cssText = `
                margin: 0 0 14px;
                padding: 11px 15px;
                border: 1px solid #dceae2;
                border-radius: 10px;
                background: #f0f7f2;
                color: #436d53;
                font-size: 12px;
                line-height: 1.5;
            `;

            anchor.parentNode.insertBefore(
                note,
                anchor
            );
        }

        if (state.preferences.currency === "NGN") {
            note.style.display = "none";
            return;
        }

        note.style.display = "block";

        if (state.fxUnavailable) {
            note.style.background = "#fff7ed";
            note.style.borderColor = "#f5dfc1";
            note.style.color = "#925a21";

            note.textContent =
                `Could not retrieve an exchange rate for ` +
                `${state.preferences.currency}. Amounts remain ` +
                `in NGN for accuracy; your currency preference is saved.`;

            return;
        }

        note.style.background = "#f0f7f2";
        note.style.borderColor = "#dceae2";
        note.style.color = "#436d53";

        const ngnPerUnit = new Intl.NumberFormat(
            "en-NG",
            {
                style: "currency",
                currency: "NGN",
                maximumFractionDigits: 2
            }
        ).format(1 / state.fxRate);

        const date = state.fxDate
            ? ` • rate dated ${state.fxDate}`
            : "";

        const warning = state.fxStale
            ? " • using a cached rate (may be outdated)"
            : "";

        note.textContent =
            `Showing approximate ${state.displayCurrency} values ` +
            `• 1 ${state.displayCurrency} ≈ ${ngnPerUnit}` +
            `${date}${warning}. Your saved records remain in NGN.`;
    }

    // ========================================================
    // UPDATE ALL DASHBOARD CURRENCY VALUES
    // ========================================================

    function renderCurrencyValues() {
        renderCurrencyNote();
        renderSummary();
        renderExpenseOverview();
        renderTransactions();
        renderCategories();
        renderBudgets();
        renderNotifications();

        icons();
    }

    // ========================================================
    // GENERAL HELPERS
    // ========================================================

    function safe(value) {
        return String(value ?? "").replace(
            /[&<>"']/g,
            c => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            })[c]
        );
    }

    function number(value) {
        const n = Number(value);

        return Number.isFinite(n) ? n : 0;
    }

    function list(value, fields = []) {
        if (Array.isArray(value)) {
            return value;
        }

        for (const field of [
            ...fields,
            "items",
            "results",
            "data"
        ]) {
            if (Array.isArray(value?.[field])) {
                return value[field];
            }

            if (
                value?.[field] &&
                typeof value[field] === "object"
            ) {
                const nested = list(
                    value[field],
                    fields
                );

                if (nested.length) {
                    return nested;
                }
            }
        }

        return [];
    }

    function amount(e) {
        return Math.max(
            0,
            number(
                e?.amount ??
                e?.value ??
                e?.total
            )
        );
    }

    function category(e) {
        return String(
            e?.category ??
            e?.category_name ??
            "Other"
        ).trim() || "Other";
    }

    function expenseDate(e) {
        return e?.created_at ||
            e?.expense_date ||
            e?.date ||
            e?.transaction_date ||
            "";
    }

    function dateKey(input) {
        if (!input) {
            return "";
        }

        const s = String(input);

        const iso = s.match(
            /^(\d{4}-\d{2}-\d{2})/
        );

        if (iso) {
            return iso[1];
        }

        const d = new Date(input);

        if (Number.isNaN(d.getTime())) {
            return "";
        }

        return `${d.getFullYear()}-${
            String(
                d.getMonth() + 1
            ).padStart(2, "0")
        }-${
            String(
                d.getDate()
            ).padStart(2, "0")
        }`;
    }

    function dateLabel(input) {
        const key = dateKey(input);

        if (!key) {
            return "";
        }

        const [y, m, d] = key
            .split("-")
            .map(Number);

        return new Date(
            y,
            m - 1,
            d
        ).toLocaleDateString("en-NG", {
            day: "numeric",
            month: "short"
        });
    }

    function iconFor(name) {
        const n = String(name).toLowerCase();

        if (/food|grocer/.test(n)) {
            return "utensils";
        }

        if (/transport|fuel|travel/.test(n)) {
            return "car";
        }

        if (/health|medical|sick/.test(n)) {
            return "heart-pulse";
        }

        if (/rent|house|home/.test(n)) {
            return "house";
        }

        if (/shopping|clothes/.test(n)) {
            return "shopping-bag";
        }

        if (/school|education/.test(n)) {
            return "graduation-cap";
        }

        if (/bill|electric|water/.test(n)) {
            return "receipt";
        }

        if (/entertain|movie/.test(n)) {
            return "clapperboard";
        }

        return "wallet";
    }

    // ========================================================
    // LOGOUT
    // ========================================================

    function signOut() {
        [
            "access_token",
            "user_email",
            "user_name",
            "user_id"
        ].forEach(k => localStorage.removeItem(k));

        location.replace("login.html");
    }

    // ========================================================
    // API REQUESTS
    // ========================================================

    async function request(path) {
        const token = localStorage.getItem(
            "access_token"
        );

        if (!token) {
            signOut();

            throw new Error(
                "Please sign in again."
            );
        }

        const response = await fetch(
            `${API_URL}${path}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json"
                }
            }
        );

        if (response.status === 401) {
            signOut();

            throw new Error(
                "Your session expired."
            );
        }

        const data = await response.json()
            .catch(() => null);

        if (!response.ok) {
            throw new Error(
                `${path}: ${
                    typeof data?.detail === "string"
                        ? data.detail
                        : `HTTP ${response.status}`
                }`
            );
        }

        return data;
    }

    async function dashboardRequest() {
        const filter = `?month=${encodeURIComponent(state.selectedMonth)}`;
        try {
            return await request(
                "/users/me/dashboard" + filter
            );

        } catch (firstError) {
            try {
                return await request(
                    "/dashboard" + filter
                );

            } catch (secondError) {
                console.warn(
                    "Dashboard summary unavailable:",
                    firstError,
                    secondError
                );

                return {};
            }
        }
    }

    function empty(
        title,
        description,
        icon = "inbox"
    ) {
        return `
            <div class="bw-empty">
                <i data-lucide="${icon}"></i>
                <strong>${safe(title)}</strong>
                <span>${safe(description)}</span>
            </div>
        `;
    }

    // ========================================================
    // SUMMARY CARDS
    // ========================================================

    function renderSummary() {
        const user = state.user;
        const d = state.dashboard;

        let missingIncome = $("dashboardMissingIncome");
        if (!missingIncome) {
            const anchor = document.querySelector(".summary-grid");
            if (anchor) {
                missingIncome = document.createElement("div");
                missingIncome.id = "dashboardMissingIncome";
                missingIncome.style.cssText =
                    "padding:11px 14px;margin:8px 0 12px;border-radius:10px;" +
                    "background:#fff7e9;color:#8b5c23;font-size:12px";
                anchor.parentNode.insertBefore(missingIncome, anchor);
            }
        }
        if (missingIncome) {
            missingIncome.style.display = d.income_recorded === false ? "block" : "none";
            missingIncome.textContent =
                "Income for this historical month has not been recorded. " +
                "Expense totals are accurate, but balance and savings need income history.";
        }

        const listSpent = state.expenses.reduce(
            (sum, e) => sum + amount(e),
            0
        );

        const spent = state.expenses.length
            ? listSpent
            : number(
                d.total_expenses ??
                d.total_spent
            );

        const income = number(
            d.income ??
            d.monthly_income ??
            user.income ??
            user.monthly_income ??
            d.monthly_income ??
            d.total_income
        );

        const balance = income - spent;

        const saved = income > 0
            ? Math.max(
                0,
                (balance / income) * 100
            )
            : 0;

        if ($("balance")) {
            $("balance").textContent =
                d.income_recorded === false ? "—" : currency(balance);
        }

        if ($("income")) {
            $("income").textContent =
                currency(income);
        }

        if ($("expenses")) {
            $("expenses").textContent =
                currency(spent);
        }

        if ($("savingsRate")) {
            $("savingsRate").textContent =
                d.income_recorded === false ? "—" : `${saved.toFixed(1)}%`;
        }
    }

    // ========================================================
    // USER INFORMATION
    // ========================================================

    function renderUser() {
        const user = state.user;

        const name = String(
            user.name ||
            user.full_name ||
            localStorage.getItem("user_name") ||
            "FundHaven User"
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
            .map(s => s[0]?.toUpperCase() || "")
            .join("");

        const set = (id, value) => {
            if ($(id)) {
                $(id).textContent = value;
            }
        };

        set(
            "welcomeName",
            name.trim().split(/\s+/)[0]
        );

        set("sidebarUserName", name);
        set("topUserName", name);

        set("sidebarAvatar", initials || "U");
        set("topAvatar", initials || "U");

        localStorage.setItem(
            "user_name",
            name
        );

        if (email) {
            localStorage.setItem(
                "user_email",
                email
            );
        }

        if (user.id) {
            localStorage.setItem(
                "user_id",
                String(user.id)
            );
        }

        renderProfileMenu(name, email);
    }

    // ========================================================
    // EXPENSE OVERVIEW BAR CHART
    // ========================================================

    function renderExpenseOverview() {
        const host = $("expenseChart");

        if (!host) {
            return;
        }

        const count = state.chartDays;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const [selectedYear, selectedNumber] = state.selectedMonth
            .split("-").map(Number);
        const lastDayOfSelectedMonth =
            new Date(selectedYear, selectedNumber, 0);
        lastDayOfSelectedMonth.setHours(0, 0, 0, 0);
        if (lastDayOfSelectedMonth < today) {
            today.setTime(lastDayOfSelectedMonth.getTime());
        }

        const dates = Array.from(
            { length: count },
            (_, i) => {
                const d = new Date(today);

                d.setDate(
                    today.getDate() - (
                        count - 1 - i
                    )
                );

                return {
                    key: dateKey(d),
                    date: d,
                    total: 0,
                    transactions: 0
                };
            }
        );

        const byDate = new Map(
            dates.map(day => [
                day.key,
                day
            ])
        );

        let undated = 0;

        for (const e of state.expenses) {
            const key = dateKey(
                expenseDate(e)
            );

            if (!key) {
                undated += amount(e);
                continue;
            }

            const day = byDate.get(key);

            if (day) {
                day.total += amount(e);
                day.transactions++;
            }
        }

        const total = dates.reduce(
            (sum, day) => sum + day.total,
            0
        );

        const max = Math.max(
            1,
            ...dates.map(day => day.total)
        );

        const highest = Math.max(
            ...dates.map(day => day.total)
        );

        const plotLeft = 76;
        const plotTop = 30;
        const plotWidth = 746;
        const plotHeight = 164;

        const barSlot = plotWidth / count;

        const barWidth = Math.min(
            count <= 7
                ? 52
                : count <= 14
                    ? 29
                    : 15,
            barSlot * 0.72
        );

        // GRID LINES

        const lines = Array.from(
            { length: 5 },
            (_, i) => {
                const value =
                    max * (4 - i) / 4;

                const y =
                    plotTop + plotHeight * i / 4;

                return `
                    <line
                        x1="${plotLeft}"
                        x2="${plotLeft + plotWidth}"
                        y1="${y}"
                        y2="${y}"
                        stroke="#e9efec"
                        stroke-dasharray="4 4"
                    />

                    <text
                        x="${plotLeft - 10}"
                        y="${y + 4}"
                        text-anchor="end"
                        font-size="11"
                        fill="#829188"
                    >
                        ${shortCurrency(value)}
                    </text>
                `;
            }
        ).join("");

        // BARS AND DATE LABELS

        const bars = dates.map((day, i) => {
            const x =
                plotLeft +
                barSlot * i +
                (barSlot - barWidth) / 2;

            const height = day.total > 0
                ? Math.max(
                    4,
                    plotHeight * day.total / max
                )
                : 3;

            const y =
                plotTop +
                plotHeight -
                height;

            const isToday =
                i === count - 1;

            const showLabel =
                count <= 14 ||
                i % 5 === 0 ||
                isToday;

            const tip =
                `${
                    day.date.toLocaleDateString(
                        "en-NG",
                        {
                            day: "numeric",
                            month: "long",
                            year: "numeric"
                        }
                    )
                }: ${currency(day.total)} ` +
                `(${day.transactions} transactions)`;

            return `
                <g>
                    <title>
                        ${safe(tip)}
                    </title>

                    <rect
                        x="${x.toFixed(1)}"
                        y="${y.toFixed(1)}"
                        width="${barWidth.toFixed(1)}"
                        height="${height.toFixed(1)}"
                        rx="${Math.min(6, barWidth / 3)}"
                        fill="${
                            day.total
                                ? isToday
                                    ? "#246148"
                                    : "#67a88a"
                                : "#e5eeea"
                        }"
                    />

                    ${
                        day.total > 0 && count <= 14
                            ? `
                                <text
                                    x="${
                                        (
                                            x + barWidth / 2
                                        ).toFixed(1)
                                    }"
                                    y="${
                                        Math.max(
                                            15,
                                            y - 7
                                        ).toFixed(1)
                                    }"
                                    text-anchor="middle"
                                    font-size="10"
                                    font-weight="600"
                                    fill="#315c49"
                                >
                                    ${shortCurrency(day.total)}
                                </text>
                            `
                            : ""
                    }

                    ${
                        showLabel
                            ? `
                                <text
                                    x="${
                                        (
                                            x + barWidth / 2
                                        ).toFixed(1)
                                    }"
                                    y="214"
                                    text-anchor="middle"
                                    font-size="10"
                                    fill="#687b70"
                                >
                                    ${
                                        day.date.toLocaleDateString(
                                            "en-NG",
                                            {
                                                day: "numeric",
                                                month: "short"
                                            }
                                        )
                                    }
                                </text>
                            `
                            : ""
                    }
                </g>
            `;
        }).join("");

        const ranges = [7, 14, 30]
            .map(n => `
                <button
                    type="button"
                    class="bw-range ${
                        n === count ? "active" : ""
                    }"
                    data-chart-days="${n}"
                >
                    ${n}D
                </button>
            `).join("");

        host.innerHTML = `
            <div class="bw-chart">

                <div class="bw-chart-header">

                    <div class="bw-chart-metrics">

                        <div>
                            <span>Period spending</span>
                            <strong>${currency(total)}</strong>
                        </div>

                        <div>
                            <span>Daily average</span>
                            <strong>${currency(total / count)}</strong>
                        </div>

                        <div>
                            <span>Highest day</span>
                            <strong>${currency(highest)}</strong>
                        </div>

                    </div>

                    <div
                        class="bw-ranges"
                        aria-label="Expense chart date range"
                    >
                        ${ranges}
                    </div>

                </div>

                <div class="bw-chart-canvas">

                    <svg
                        viewBox="0 0 840 226"
                        role="img"
                        aria-label="Bar chart of daily expenses over ${count} days"
                        preserveAspectRatio="xMidYMid meet"
                    >
                        ${lines}
                        ${bars}
                    </svg>

                </div>

                <div class="bw-chart-note">

                    <span>
                        <span class="bw-legend-point"></span>
                        Daily expenses
                    </span>

                    <span>
                        Hover over each bar for details
                    </span>

                </div>

                ${
                    undated
                        ? `
                            <div class="bw-chart-footnote">
                                ${currency(undated)}
                                in expenses have no recorded
                                date and are excluded from
                                this time-based chart.
                            </div>
                        `
                        : ""
                }

            </div>
        `;

        host.querySelectorAll(
            "[data-chart-days]"
        ).forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    state.chartDays = Number(
                        button.dataset.chartDays
                    );

                    renderExpenseOverview();
                }
            );
        });
    }

    // ========================================================
    // RECENT TRANSACTIONS — FIXED ALIGNMENT
    // ========================================================

    function renderTransactions() {
        const host = $("recentTransactions");

        if (!host) {
            return;
        }

        const filtered = state.expenses.filter(e => {
            const text =
                `${category(e)} ` +
                `${e.description || e.name || ""} ` +
                `${e.amount || ""}`;

            return text.toLowerCase().includes(
                state.search.toLowerCase()
            );
        });

        filtered.sort(
            (a, b) =>
                (
                    dateKey(expenseDate(b)) || ""
                ).localeCompare(
                    dateKey(expenseDate(a)) || ""
                )
        );

        if (!filtered.length) {
            host.innerHTML = empty(
                state.search
                    ? "No matching transactions"
                    : "No transactions yet",
                "Expenses will appear here when you add them.",
                "receipt"
            );

            icons();
            return;
        }

        host.innerHTML = filtered
            .slice(0, 5)
            .map(e => {
                const cat = category(e);

                const description =
                    e.description ||
                    e.name ||
                    cat;

                const date = expenseDate(e);

                return `
                    <div class="transaction-item">

                        <div class="transaction-icon">
                            <i
                                data-lucide="${iconFor(cat)}"
                            ></i>
                        </div>

                        <div class="transaction-details">

                            <strong>
                                ${safe(description)}
                            </strong>

                            <span>
                                ${safe(cat)}
                                ${
                                    date
                                        ? ` · ${safe(
                                            dateLabel(date)
                                        )}`
                                        : ""
                                }
                            </span>

                        </div>

                        <div class="transaction-amount">
                            −${currency(amount(e))}
                        </div>

                    </div>
                `;
            }).join("");

        icons();
    }

    // ========================================================
    // SPENDING BY CATEGORY — COLOURED PIE CHART
    // ========================================================

    function renderCategories() {
        const host = $("categories");

        if (!host) {
            return;
        }

        const totals = new Map();

        for (const e of state.expenses) {
            const cat = category(e);

            totals.set(
                cat,
                (totals.get(cat) || 0) + amount(e)
            );
        }

        const entries = [...totals]
            .filter(([, value]) => value > 0)
            .sort((a, b) => b[1] - a[1]);

        if (!entries.length) {
            host.innerHTML = empty(
                "No spending data",
                "Add expenses to see your category breakdown.",
                "chart-pie"
            );

            icons();
            return;
        }

        const total = entries.reduce(
            (sum, [, value]) => sum + value,
            0
        );

        let position = 0;

        const stops = entries.map(
            ([, value], i) => {
                const start = position;

                position += value / total * 100;

                return `${
                    COLORS[i % COLORS.length]
                } ${start.toFixed(2)}% ${
                    position.toFixed(2)
                }%`;
            }
        ).join(",");

        host.innerHTML = `
            <div class="bw-pie-layout">

                <div
                    class="bw-pie"
                    style="background:conic-gradient(${stops})"
                    role="img"
                    aria-label="Spending by category"
                >

                    <div class="bw-pie-center">
                        <span>Total spent</span>
                        <strong>
                            ${currency(total)}
                        </strong>
                    </div>

                </div>

                <div class="bw-pie-legend">

                    ${
                        entries.map(
                            ([name, value], i) => `
                                <div class="bw-pie-row">

                                    <i
                                        style="background:${
                                            COLORS[
                                                i % COLORS.length
                                            ]
                                        }"
                                    ></i>

                                    <span>
                                        ${safe(name)}

                                        <small>
                                            ${
                                                (
                                                    value / total * 100
                                                ).toFixed(1)
                                            }%
                                        </small>
                                    </span>

                                    <strong>
                                        ${currency(value)}
                                    </strong>

                                </div>
                            `
                        ).join("")
                    }

                </div>

            </div>
        `;
    }

    // ========================================================
    // BUDGET HELPERS
    // ========================================================

    function budgetName(b) {
        return String(
            b.category ??
            b.name ??
            b.title ??
            "Budget"
        );
    }

    function budgetLimit(b) {
        return number(
            b.amount ??
            b.limit ??
            b.budget_amount ??
            b.monthly_limit ??
            b.budget
        );
    }

    function budgetSpent(b) {
        const name = budgetName(b)
            .trim()
            .toLowerCase();

        const matching = state.expenses.filter(
            e =>
                category(e)
                    .trim()
                    .toLowerCase() === name
        );

        if (matching.length) {
            return matching.reduce(
                (sum, e) => sum + amount(e),
                0
            );
        }

        return number(
            b.spent ??
            b.total_spent ??
            b.amount_spent ??
            0
        );
    }

    // ========================================================
    // BUDGET PROGRESS
    // ========================================================

    function renderBudgets() {
        const host = $("budgets");

        if (!host) {
            return;
        }

        if (state.budgetError) {
            host.innerHTML = empty(
                "Budgets could not load",
                "Check that the backend is running and the /budgets API works.",
                "alert-circle"
            );

            icons();
            return;
        }

        if (!state.budgets.length) {
            host.innerHTML = empty(
                "No budgets yet",
                "Create a budget to start tracking your spending.",
                "wallet"
            );

            icons();
            return;
        }

        host.innerHTML = state.budgets.map(b => {
            const name = budgetName(b);
            const limit = budgetLimit(b);
            const spent = budgetSpent(b);

            const pct = limit > 0
                ? spent / limit * 100
                : 0;

            const over = pct >= 100;

            const warning =
                !over && pct >= 80;

            const color = over
                ? "#dc5764"
                : warning
                    ? "#e4a236"
                    : "#246148";

            const status = over
                ? "Exceeded"
                : warning
                    ? "Near limit"
                    : "On track";

            return `
                <div class="bw-budget-item">

                    <div class="bw-budget-head">

                        <div class="bw-budget-name">

                            <span class="bw-budget-icon">
                                <i
                                    data-lucide="${
                                        iconFor(name)
                                    }"
                                ></i>
                            </span>

                            <div>
                                <strong>
                                    ${safe(name)}
                                </strong>

                                <small>
                                    ${currency(spent)}
                                    of
                                    ${currency(limit)}
                                </small>
                            </div>

                        </div>

                        <span
                            class="bw-budget-status"
                            style="
                                color:${color};
                                background:${color}16
                            "
                        >
                            ${status}
                        </span>

                    </div>

                    <div class="bw-budget-progress">

                        <div
                            style="
                                width:${
                                    Math.min(
                                        100,
                                        pct
                                    ).toFixed(1)
                                }%;
                                background:${color}
                            "
                        ></div>

                    </div>

                    <div class="bw-budget-foot">

                        <span>
                            ${pct.toFixed(1)}% used
                        </span>

                        <span>
                            ${
                                over
                                    ? `${
                                        currency(
                                            spent - limit
                                        )
                                    } over limit`
                                    : `${
                                        currency(
                                            Math.max(
                                                0,
                                                limit - spent
                                            )
                                        )
                                    } remaining`
                            }
                        </span>

                    </div>

                </div>
            `;
        }).join("");

        icons();
    }

    // ========================================================
    // PROFILE MENU
    // ========================================================

    function renderProfileMenu(name, email) {
        const userControl = document.querySelector(
            ".top-user"
        );

        if (!userControl) {
            return;
        }

        let panel = $("dashboardProfileMenu");

        if (!panel) {
            panel = document.createElement("div");

            panel.id = "dashboardProfileMenu";
            panel.className = "bw-popup";

            userControl.appendChild(panel);

            userControl.style.position = "relative";
            userControl.style.cursor = "pointer";

            userControl.addEventListener(
                "click",
                event => {
                    event.stopPropagation();

                    $("dashboardNotificationPanel")
                        ?.classList.remove("show");

                    panel.classList.toggle("show");
                }
            );
        }

        panel.innerHTML = `
            <div class="bw-popup-header">

                <strong>
                    ${safe(name)}
                </strong>

                <small>
                    ${safe(email)}
                </small>

            </div>

            <a href="settings.html">
                <i data-lucide="user-round"></i>
                Profile &amp; Settings
            </a>

            <a href="transactions.html">
                <i data-lucide="arrow-left-right"></i>
                Transactions
            </a>

            <button
                type="button"
                id="bwLogout"
            >
                <i data-lucide="log-out"></i>
                Log out
            </button>
        `;

        $("bwLogout")?.addEventListener(
            "click",
            event => {
                event.stopPropagation();
                signOut();
            }
        );

        icons();
    }

    // ========================================================
    // BUDGET NOTIFICATION DATA
    // ========================================================

    function getNotifications() {
        const items = [];

        for (const b of state.budgets) {
            const limit = budgetLimit(b);
            const spent = budgetSpent(b);

            if (limit <= 0) {
                continue;
            }

            const pct = spent / limit * 100;

            if (pct >= 100) {
                items.push({
                    icon: "triangle-alert",
                    title:
                        `${budgetName(b)} budget exceeded`,
                    text:
                        `${currency(spent)} spent of ` +
                        `${currency(limit)}`
                });

            } else if (pct >= 80) {
                items.push({
                    icon: "bell-ring",
                    title:
                        `${budgetName(b)} budget almost reached`,
                    text:
                        `${pct.toFixed(1)}% of your budget used`
                });
            }
        }

        return items;
    }

    // ========================================================
    // NOTIFICATION MENU
    // ========================================================

    function renderNotifications() {
        const button = $("notificationButton");

        if (!button) {
            return;
        }

        let panel = $("dashboardNotificationPanel");

        if (!panel) {
            panel = document.createElement("div");

            panel.id = "dashboardNotificationPanel";
            panel.className = "bw-popup bw-notifications";

            button.style.position = "relative";

            button.appendChild(panel);

            button.addEventListener(
                "click",
                event => {
                    event.stopPropagation();

                    $("dashboardProfileMenu")
                        ?.classList.remove("show");

                    panel.classList.toggle("show");
                }
            );
        }

        const items = getNotifications();

        const dot = button.querySelector(
            ".notification-dot"
        );

        if (dot) {
            dot.style.display = items.length
                ? "block"
                : "none";
        }

        panel.innerHTML = `
            <div class="bw-popup-header">

                <strong>
                    Notifications
                </strong>

                <small>
                    ${items.length}
                    alert${items.length === 1 ? "" : "s"}
                </small>

            </div>

            ${
                items.length
                    ? items.map(n => `
                        <div class="bw-notification-row">

                            <i
                                data-lucide="${n.icon}"
                            ></i>

                            <div>
                                <strong>
                                    ${safe(n.title)}
                                </strong>

                                <small>
                                    ${safe(n.text)}
                                </small>
                            </div>

                        </div>
                    `).join("")

                    : `
                        <div class="bw-no-alerts">

                            <i
                                data-lucide="check-circle-2"
                            ></i>

                            You're all caught up.

                        </div>
                    `
            }
        `;

        icons();
    }

    // ========================================================
    // LOAD DASHBOARD DATA
    // ========================================================

    async function loadDashboard() {
        const results = await Promise.allSettled([
            request("/users/me"),
            dashboardRequest(),
            request(`/expenses?month=${encodeURIComponent(state.selectedMonth)}`),
            request("/budgets")
        ]);

        const value = (index, fallback) =>
            results[index].status === "fulfilled"
                ? results[index].value
                : fallback;

        results.forEach((result, i) => {
            if (result.status === "rejected") {
                console.warn(
                    [
                        "Profile",
                        "Dashboard",
                        "Expenses",
                        "Budgets"
                    ][i] + " request failed:",
                    result.reason
                );
            }
        });

        const rawUser = value(0, {});
        const rawDashboard = value(1, {});

        state.user =
            rawUser?.user ||
            rawUser?.profile ||
            rawUser?.data?.user ||
            rawUser?.data ||
            rawUser ||
            {};

        state.dashboard =
            rawDashboard?.dashboard ||
            rawDashboard?.data ||
            rawDashboard ||
            {};

        state.expenses = list(
            value(2, []),
            ["expenses", "transactions"]
        );

        state.budgets = list(
            value(3, []),
            ["budgets"]
        );

        state.budgetError =
            results[3].status === "rejected";

        renderUser();

        renderCurrencyValues();

        console.info(
            "FundHaven dashboard loaded:",
            {
                income:
                    state.user.income ??
                    state.dashboard.income,
                expenses: state.expenses.length,
                budgets: state.budgets.length
            }
        );

        if (
            results[0].status === "rejected" &&
            results[1].status === "rejected"
        ) {
            showError(
                "Profile and dashboard summary could not load. Check your backend API."
            );

        } else if (
            results[2].status === "rejected"
        ) {
            showError(
                "Expenses could not load. Please check your backend API."
            );
        }
    }

    // ========================================================
    // ERROR DISPLAY
    // ========================================================

    function showError(message) {
        let box = $("dashboardError");

        if (!box) {
            box = document.createElement("div");

            box.id = "dashboardError";

            const content =
                document.querySelector(".content") ||
                document.querySelector("main");

            content?.prepend(box);
        }

        box.textContent = message;

        box.style.cssText = `
            padding: 12px 16px;
            margin: 12px 0;
            background: #fff4ee;
            color: #a33e2d;
            border-radius: 8px;
            font-size: 13px;
        `;
    }

    // ========================================================
    // DYNAMIC DASHBOARD STYLES
    // ========================================================

    function addStyles() {
        if ($("bwDashboardDynamicStyles")) {
            return;
        }

        const style = document.createElement("style");

        style.id = "bwDashboardDynamicStyles";

        style.textContent = `

            /* ==========================================
               EXPENSE OVERVIEW CHART
            ========================================== */

            #expenseChart {
                display: block !important;
                padding: 8px 0 0 !important;
                min-height: 298px !important;
                height: auto !important;
            }

            .chart-card {
                min-height: 365px;
            }

            .bw-chart {
                width: 100%;
                padding: 0 2px;
                color: #213c2e;
            }

            .bw-chart-header {
                display: flex;
                justify-content: space-between;
                gap: 12px;
                align-items: flex-start;
                flex-wrap: wrap;
            }

            .bw-chart-metrics {
                display: flex;
                flex-wrap: wrap;
                gap: 12px 22px;
            }

            .bw-chart-metrics > div {
                display: flex;
                flex-direction: column;
                gap: 5px;
            }

            .bw-chart-metrics span {
                font-size: 10px;
                color: #84928b;
            }

            .bw-chart-metrics strong {
                font-size: 15px;
                color: #204431;
            }

            .bw-ranges {
                display: flex;
                background: #f0f5f2;
                padding: 3px;
                border-radius: 9px;
                gap: 2px;
            }

            .bw-range {
                border: 0;
                background: transparent;
                border-radius: 7px;
                padding: 6px 9px;
                cursor: pointer;
                font-size: 10px;
                font-weight: 600;
                font-family: inherit;
                color: #6c7e74;
            }

            .bw-range.active {
                background: #246148;
                color: #fff;
            }

            .bw-chart-canvas {
                width: 100%;
                overflow: hidden;
                margin: 8px 0 1px;
            }

            .bw-chart-canvas svg {
                width: 100%;
                height: auto;
                display: block;
            }

            .bw-chart-note {
                display: flex;
                flex-wrap: wrap;
                justify-content: space-between;
                color: #84918a;
                gap: 8px;
                font-size: 10px;
                padding: 0 6px;
            }

            .bw-legend-point {
                display: inline-block;
                background: #246148;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                margin-right: 6px;
            }

            .bw-chart-footnote {
                font-size: 10px;
                color: #966a3a;
                margin-top: 8px;
            }

            /* ==========================================
               RECENT TRANSACTIONS — ALIGNMENT FIX
            ========================================== */

            #recentTransactions {
                width: 100%;
                min-width: 0;
                display: flex;
                flex-direction: column;
            }

            #recentTransactions .transaction-item {
                display: grid !important;
                grid-template-columns:
                    42px minmax(0, 1fr) max-content !important;
                align-items: center !important;
                column-gap: 12px !important;
                width: 100%;
                min-width: 0;
                padding: 14px 2px !important;
                margin: 0 !important;
                border-bottom: 1px solid #edf1ee;
                background: transparent;
            }

            #recentTransactions .transaction-item:last-child {
                border-bottom: none;
            }

            /* TRANSACTION ICON */

            #recentTransactions .transaction-icon {
                width: 42px !important;
                height: 42px !important;
                min-width: 42px;
                border-radius: 12px;
                display: flex !important;
                justify-content: center;
                align-items: center;
                padding: 0 !important;
                margin: 0 !important;
                background: #ecf5ef;
                color: #246148;
            }

            #recentTransactions .transaction-icon svg {
                display: block;
                width: 19px !important;
                height: 19px !important;
            }

            /* DESCRIPTION AND CATEGORY */

            #recentTransactions .transaction-details {
                display: flex !important;
                flex-direction: column;
                gap: 4px;
                min-width: 0 !important;
                width: auto !important;
                margin: 0 !important;
                overflow: hidden;
            }

            #recentTransactions .transaction-details strong {
                display: block;
                min-width: 0;
                max-width: 100%;
                color: #193b2b;
                font-size: 13px;
                font-weight: 700;
                line-height: 1.35;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            #recentTransactions .transaction-details span {
                display: block;
                min-width: 0;
                color: #829488;
                font-size: 11px;
                line-height: 1.35;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            /* AMOUNT ALIGNED ON THE RIGHT */

            #recentTransactions .transaction-amount {
                width: auto !important;
                min-width: 0;
                margin: 0 !important;
                padding: 0 !important;
                flex: none !important;
                justify-self: end;
                align-self: center;
                color: #c25454;
                text-align: right;
                white-space: nowrap;
                font-weight: 750;
                font-size: 12px;
                line-height: 1.3;
                font-variant-numeric: tabular-nums;
            }

            /* SMALL SCREENS */

            @media (max-width: 480px) {

                #recentTransactions .transaction-item {
                    grid-template-columns:
                        38px minmax(0, 1fr) !important;
                    gap: 9px !important;
                    padding: 12px 0 !important;
                }

                #recentTransactions .transaction-icon {
                    width: 38px !important;
                    height: 38px !important;
                    min-width: 38px;
                }

                #recentTransactions .transaction-amount {
                    grid-column: 2;
                    justify-self: start;
                    font-size: 12px;
                }
            }

            /* ==========================================
               EMPTY STATES
            ========================================== */

            .bw-empty {
                min-height: 150px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-align: center;
                gap: 7px;
                color: #86958b;
                padding: 20px;
            }

            .bw-empty svg {
                width: 24px;
                height: 24px;
                color: #4b8469;
                margin-bottom: 3px;
            }

            .bw-empty strong {
                font-size: 13px;
                color: #294a38;
            }

            .bw-empty span {
                font-size: 11px;
            }

            /* ==========================================
               SPENDING BY CATEGORY PIE CHART
            ========================================== */

            .bw-pie-layout {
                display: grid;
                grid-template-columns:
                    minmax(150px, 0.9fr)
                    minmax(200px, 1.1fr);
                align-items: center;
                gap: 18px;
                padding: 12px 6px 18px;
            }

            .bw-pie {
                width: min(100%, 212px);
                aspect-ratio: 1;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: auto;
            }

            .bw-pie-center {
                width: 58%;
                aspect-ratio: 1;
                background: #fff;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-direction: column;
                gap: 5px;
                text-align: center;
                padding: 5px;
            }

            .bw-pie-center span {
                color: #8c9991;
                font-size: 10px;
            }

            .bw-pie-center strong {
                color: #153e2b;
                font-size: clamp(11px, 1.5vw, 17px);
                overflow-wrap: anywhere;
            }

            .bw-pie-legend {
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-height: 220px;
                overflow: auto;
            }

            .bw-pie-row {
                display: grid;
                grid-template-columns:
                    8px minmax(65px, 1fr) auto;
                gap: 8px;
                align-items: center;
                min-width: 0;
                font-size: 11px;
            }

            .bw-pie-row i {
                width: 8px;
                height: 8px;
                border-radius: 50%;
            }

            .bw-pie-row span {
                display: flex;
                flex-direction: column;
                gap: 3px;
                color: #264735;
                overflow-wrap: anywhere;
            }

            .bw-pie-row small {
                color: #87968c;
                font-size: 10px;
            }

            .bw-pie-row strong {
                text-align: right;
                font-size: 10px;
                white-space: nowrap;
            }

            /* ==========================================
               BUDGET PROGRESS
            ========================================== */

            .bw-budget-item {
                padding: 14px 0;
                border-bottom: 1px solid #edf1ef;
            }

            .bw-budget-item:last-child {
                border-bottom: none;
            }

            .bw-budget-head,
            .bw-budget-foot {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
            }

            .bw-budget-name {
                display: flex;
                gap: 10px;
                align-items: center;
                min-width: 0;
            }

            .bw-budget-name > div {
                display: flex;
                flex-direction: column;
                gap: 5px;
            }

            .bw-budget-name strong {
                font-size: 12px;
                color: #214231;
            }

            .bw-budget-name small,
            .bw-budget-foot {
                font-size: 10px;
                color: #89948c;
            }

            .bw-budget-icon {
                flex-shrink: 0;
                display: grid;
                place-items: center;
                width: 32px;
                height: 32px;
                background: #edf5f1;
                color: #246148;
                border-radius: 9px;
            }

            .bw-budget-icon svg {
                width: 16px;
                height: 16px;
            }

            .bw-budget-status {
                padding: 5px 8px;
                border-radius: 14px;
                white-space: nowrap;
                font-size: 10px;
                font-weight: 700;
            }

            .bw-budget-progress {
                background: #e8efea;
                height: 8px;
                border-radius: 8px;
                margin: 12px 0 7px;
                overflow: hidden;
            }

            .bw-budget-progress > div {
                height: 100%;
                border-radius: 8px;
                transition: width .3s ease;
            }

            /* ==========================================
               PROFILE AND NOTIFICATION MENUS
            ========================================== */

            .bw-popup {
                display: none;
                position: absolute;
                right: 0;
                top: calc(100% + 12px);
                z-index: 99;
                width: 255px;
                padding: 8px;
                border: 1px solid #e8eeea;
                background: white;
                box-shadow: 0 12px 32px #10241920;
                border-radius: 12px;
                color: #263e30;
            }

            .bw-popup.show {
                display: block;
            }

            .bw-popup-header {
                display: flex;
                flex-direction: column;
                gap: 4px;
                padding: 10px 11px;
                border-bottom: 1px solid #ebefec;
                margin-bottom: 4px;
            }

            .bw-popup-header strong {
                font-size: 12px;
            }

            .bw-popup-header small {
                font-size: 10px;
                color: #849187;
                overflow-wrap: anywhere;
            }

            .bw-popup a,
            .bw-popup button {
                display: flex;
                align-items: center;
                gap: 9px;
                border: 0;
                background: transparent;
                width: 100%;
                text-align: left;
                border-radius: 8px;
                padding: 10px;
                font-size: 12px;
                color: #2d4737;
                cursor: pointer;
                text-decoration: none;
            }

            .bw-popup a:hover,
            .bw-popup button:hover {
                background: #eef5f0;
            }

            .bw-popup a svg,
            .bw-popup button svg {
                width: 15px;
                height: 15px;
            }

            .bw-notifications {
                right: -10px;
                width: 280px;
                cursor: default;
            }

            .bw-notification-row {
                display: flex;
                gap: 9px;
                padding: 10px 8px;
                border-bottom: 1px solid #f0f3f1;
            }

            .bw-notification-row svg {
                width: 18px;
                height: 18px;
                flex-shrink: 0;
                color: #e4a236;
            }

            .bw-notification-row div {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .bw-notification-row strong {
                font-size: 11px;
            }

            .bw-notification-row small,
            .bw-no-alerts {
                font-size: 10px;
                color: #849187;
            }

            .bw-no-alerts {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px 8px;
            }

            .bw-no-alerts svg {
                width: 15px;
                height: 15px;
                color: #246148;
            }

            @media (max-width: 680px) {

                .bw-pie-layout {
                    grid-template-columns: 1fr;
                }

                .bw-chart-header {
                    gap: 15px;
                }

                .bw-chart-metrics {
                    gap: 12px;
                }

                .bw-chart-metrics strong {
                    font-size: 12px;
                }

                .bw-popup {
                    width: min(
                        280px,
                        calc(100vw - 30px)
                    );
                }
            }
        `;

        document.head.appendChild(style);
    }

    // ========================================================
    // MONTH PICKER — keep financial months independent
    // ========================================================

    function setupMonthPicker() {
        if ($("dashboardMonthPicker")) return;

        const anchor = document.querySelector(".summary-grid");
        if (!anchor) return;

        const wrapper = document.createElement("div");
        wrapper.id = "dashboardMonthPicker";
        wrapper.style.cssText =
            "display:flex;justify-content:space-between;align-items:center;" +
            "gap:12px;flex-wrap:wrap;margin:12px 0 14px;color:#173b2a";
        wrapper.innerHTML =
            '<label for="dashboardMonthInput" style="font-weight:700;font-size:13px">' +
            'Financial month</label>' +
            '<input id="dashboardMonthInput" type="month" ' +
            'style="padding:10px 13px;border:1px solid #dae7df;' +
            'border-radius:10px;background:#fff;color:#173b2a;font:inherit;' +
            'font-size:13px;max-width:100%">';
        anchor.parentNode.insertBefore(wrapper, anchor);

        const input = $("dashboardMonthInput");
        input.value = state.selectedMonth;
        input.addEventListener("change", async () => {
            if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.value)) return;
            state.selectedMonth = input.value;
            await loadDashboard();
        });
    }

    // ========================================================
    // INITIALIZE DASHBOARD
    // ========================================================

    document.addEventListener(
        "DOMContentLoaded",
        () => {
            if (!localStorage.getItem("access_token")) {
                signOut();
                return;
            }

            // Add dashboard dynamic styles
            addStyles();
            setupMonthPicker();

            // Search recent transactions
            $("searchInput")?.addEventListener(
                "input",
                event => {
                    state.search =
                        event.target.value.trim();

                    renderTransactions();
                }
            );

            // Mobile sidebar
            $("mobileMenu")?.addEventListener(
                "click",
                event => {
                    event.stopPropagation();

                    $("sidebar")?.classList.toggle(
                        "open"
                    );
                }
            );

            // Close dropdowns when clicking elsewhere
            document.addEventListener(
                "click",
                () => {
                    $("dashboardProfileMenu")
                        ?.classList.remove("show");

                    $("dashboardNotificationPanel")
                        ?.classList.remove("show");
                }
            );

            icons();

            // Load currency preference first
            const fxReady = loadCurrencyPreference();

            (async () => {
                await fxReady;
                await loadDashboard();
            })().catch(error => {
                console.error(
                    "Dashboard load failed:",
                    error
                );

                showError(
                    "Unable to load dashboard. Check your backend connection."
                );
            });

            // Update dashboard currency if Settings
            // changes in another browser tab
            window.addEventListener(
                "storage",
                async event => {
                    if (
                        event.key !== PREFERENCES_KEY
                    ) {
                        return;
                    }

                    await loadCurrencyPreference();

                    renderCurrencyValues();
                }
            );
        }
    );

})();
