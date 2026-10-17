(function fundhavenTopbar() {
    "use strict";

    // One controller for the existing top-right controls on all six app pages.
    // Older page-specific click handlers are deliberately superseded in CAPTURE phase.
    const existingMenuIds = [
        "dashboardNotificationPanel", "dashboardProfileMenu",
        "transactionsActivityMenu", "transactionsProfileMenu",
        "budgetNotificationPanel", "budgetProfileMenu",
        "reportsNotificationPanel", "reportsProfileMenu",
        "goalsNotificationMenu", "goalsProfileMenu",
        "bwSettingsNotifications", "bwSettingsProfileMenu"
    ];
    const routes = [
        ["layout-dashboard", "Dashboard", "dashboard.html"],
        ["arrow-left-right", "Transactions", "transactions.html"],
        ["wallet-cards", "Budgets", "budgets.html"],
        ["chart-column", "Reports", "reports.html"],
        ["target", "Goals", "goals.html"],
        ["settings", "Profile & Settings", "settings.html"]
    ];

    let bellButton;
    let profileButton;
    let popup;
    let currentMenu = "";
    let profileDetails = null;
    let requestVersion = 0;

    const element = (id) => document.getElementById(id);
    const apiUrl = () => (window.BUDGETWISE_API_BASE_URL ||
        "http://127.0.0.1:8000/api/v1").replace(/\/+$/, "");

    function icon(name) {
        const image = document.createElement("i");
        image.setAttribute("data-lucide", name);
        image.setAttribute("aria-hidden", "true");
        return image;
    }

    function refreshIcons() {
        if (window.lucide && typeof window.lucide.createIcons === "function") {
            window.lucide.createIcons();
        }
    }

    function textElement(tag, value, className) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        node.textContent = String(value ?? "");
        return node;
    }

    function addStyles() {
        if (element("fhTopbarStyles")) return;
        const style = document.createElement("style");
        style.id = "fhTopbarStyles";
        style.textContent = `
            #fhTopbarMenu[hidden] {display:none!important}
            #fhTopbarMenu {
                position:fixed;z-index:100000;width:326px;
                max-width:calc(100vw - 24px);max-height:min(490px,calc(100vh - 88px));
                overflow:auto;overscroll-behavior:contain;box-sizing:border-box;
                background:#fff;color:#173d2a;border:1px solid #dce9df;
                border-radius:14px;box-shadow:0 22px 56px rgba(13,54,32,.18);
                font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
                font-size:13px;text-align:left;line-height:1.45;
            }
            #fhTopbarMenu * {box-sizing:border-box}
            #fhTopbarMenu .fh-head {
                padding:15px 16px 12px;border-bottom:1px solid #eaf0ec;
                display:flex;justify-content:space-between;align-items:center;gap:8px
            }
            #fhTopbarMenu .fh-head h2 {
                color:#163e2c;margin:0;font-size:14px;font-weight:750
            }
            #fhTopbarMenu .fh-subtitle {
                color:#778b7f;font-size:11px;margin-top:3px;word-break:break-word
            }
            #fhTopbarMenu .fh-content {padding:7px}
            #fhTopbarMenu .fh-item {
                display:flex;gap:11px;align-items:center;width:100%;min-height:41px;
                padding:10px;border:0;border-radius:9px;background:transparent;
                text-decoration:none;color:#294c36;text-align:left;font-size:13px;
                font-family:inherit;cursor:pointer
            }
            #fhTopbarMenu .fh-item:hover,#fhTopbarMenu .fh-item:focus-visible {
                background:#edf5ef;outline:2px solid transparent
            }
            #fhTopbarMenu .fh-item:focus-visible {outline-color:#38825d}
            #fhTopbarMenu .fh-item svg {width:17px;height:17px;min-width:17px;flex-shrink:0}
            #fhTopbarMenu .fh-notice {
                display:flex;align-items:flex-start;gap:10px;padding:11px 9px;
                border-bottom:1px solid #edf1ee
            }
            #fhTopbarMenu .fh-notice:last-child {border-bottom:none}
            #fhTopbarMenu .fh-notice svg {
                width:18px;height:18px;min-width:18px;color:#277249
            }
            #fhTopbarMenu .fh-notice strong {
                color:#244934;font-size:12px;display:block;margin:0 0 4px
            }
            #fhTopbarMenu .fh-notice span {display:block;font-size:12px;color:#64796a}
            #fhTopbarMenu .fh-empty {
                padding:15px 11px;font-size:12px;color:#687b6e;line-height:1.6
            }
            #fhTopbarMenu .fh-foot {
                border-top:1px solid #eaf0ec;padding:6px;display:flex;gap:3px
            }
            #fhTopbarMenu .fh-foot .fh-item {font-size:12px;justify-content:center}
            #fhTopbarMenu .fh-logout {color:#a62c2c}
            .fh-topbar-control {cursor:pointer}
            .fh-topbar-control:focus-visible {outline:2px solid #39835d;outline-offset:3px}
        `;
        document.head.appendChild(style);
    }

    function concealOldMenus() {
        for (const id of existingMenuIds) {
            const oldMenu = element(id);
            if (!oldMenu) continue;
            oldMenu.setAttribute("aria-hidden", "true");
            oldMenu.style.setProperty("display", "none", "important");
        }
    }

    function setAccessible(button, kind) {
        button.classList.add("fh-topbar-control");
        if (button.tagName !== "BUTTON" && button.tagName !== "A") {
            button.setAttribute("role", "button");
            button.setAttribute("tabindex", "0");
        }
        button.setAttribute("aria-label", kind === "notifications" ?
            "Open notifications" : "Open profile menu");
        button.setAttribute("aria-haspopup", "dialog");
        button.setAttribute("aria-controls", "fhTopbarMenu");
        button.setAttribute("aria-expanded", "false");
    }

    function positionPopup() {
        if (!currentMenu || !popup || popup.hidden) return;
        const anchor = currentMenu === "notifications" ? bellButton : profileButton;
        const box = anchor.getBoundingClientRect();
        const width = Math.min(326, window.innerWidth - 24);
        const left = Math.max(12, Math.min(box.right - width, window.innerWidth - width - 12));
        popup.style.width = width + "px";
        popup.style.left = left + "px";
        popup.style.top = Math.min(box.bottom + 9, window.innerHeight - 95) + "px";
    }

    function closePopup() {
        currentMenu = "";
        requestVersion += 1;
        if (popup) popup.hidden = true;
        bellButton?.setAttribute("aria-expanded", "false");
        profileButton?.setAttribute("aria-expanded", "false");
    }

    function header(title, subtitle) {
        const head = document.createElement("div");
        head.className = "fh-head";
        const heading = document.createElement("div");
        heading.append(
            textElement("h2", title),
            textElement("div", subtitle, "fh-subtitle")
        );
        head.appendChild(heading);
        return head;
    }

    function action(name, label, href) {
        const link = document.createElement("a");
        link.className = "fh-item";
        link.href = href;
        link.append(icon(name), textElement("span", label));
        return link;
    }

    function addFooter(container, links) {
        const footer = document.createElement("div");
        footer.className = "fh-foot";
        for (const [name, label, href] of links) footer.appendChild(action(name, label, href));
        container.appendChild(footer);
    }

    function menuName() {
        return profileDetails?.name ||
            localStorage.getItem("user_name") ||
            element("topUserName")?.textContent?.trim() ||
            element("userName")?.textContent?.trim() ||
            "FundHaven User";
    }

    function menuEmail() {
        return profileDetails?.email ||
            localStorage.getItem("user_email") || "Personal account";
    }

    function updateTopIdentity(user) {
        if (!user || typeof user.name !== "string" || !user.name.trim()) return;
        profileDetails = user;
        localStorage.setItem("user_name", user.name);
        if (user.email) localStorage.setItem("user_email", user.email);
        const nameLabel = element("topUserName") || element("userName");
        const avatar = element("topAvatar") || element("userAvatar");
        const initials = user.name.trim().split(/\s+/).slice(0, 2)
            .map(word => word[0] || "").join("").toUpperCase();
        if (nameLabel) nameLabel.textContent = user.name;
        if (avatar) avatar.textContent = initials;
    }

    function signOut() {
        for (const key of ["access_token", "user_email", "user_name", "user_id"]) {
            localStorage.removeItem(key);
        }
        window.location.replace("login.html");
    }

    async function authenticatedGet(path) {
        const token = localStorage.getItem("access_token");
        if (!token) {
            signOut();
            throw new Error("Please sign in to view your updates.");
        }
        const response = await fetch(apiUrl() + path, {
            headers: {"Authorization": `Bearer ${token}`, "Accept": "application/json"},
            cache: "no-store"
        });
        if (response.status === 401) {
            signOut();
            throw new Error("Your session expired. Please sign in again.");
        }
        if (!response.ok) throw new Error("Unable to load updates (HTTP " + response.status + ").");
        return response.json();
    }

    function showProfile() {
        popup.replaceChildren(header(menuName(), menuEmail()));
        const contents = document.createElement("nav");
        contents.className = "fh-content";
        contents.setAttribute("aria-label", "Account navigation");
        for (const [name, label, href] of routes) {
            contents.appendChild(action(name, label, href));
        }
        const logout = document.createElement("button");
        logout.className = "fh-item fh-logout";
        logout.type = "button";
        logout.append(icon("log-out"), textElement("span", "Log out"));
        logout.addEventListener("click", signOut);
        contents.appendChild(logout);
        popup.appendChild(contents);
        refreshIcons();
    }

    async function refreshProfile(expectedVersion) {
        try {
            const user = await authenticatedGet("/users/me");
            updateTopIdentity(user);
            if (currentMenu === "profile" && requestVersion === expectedVersion) {
                showProfile();
            }
        } catch (error) {
            if (currentMenu === "profile" && requestVersion === expectedVersion) {
                const message = textElement("div", error.message, "fh-empty");
                popup.appendChild(message);
            }
        }
    }

    function money(value) {
        if (window.BudgetWiseCurrency &&
            typeof window.BudgetWiseCurrency.format === "function") {
            return window.BudgetWiseCurrency.format(value);
        }
        return new Intl.NumberFormat("en-NG", {
            style: "currency", currency: "NGN", maximumFractionDigits: 0
        }).format(Number(value) || 0);
    }

    function notificationsFrom(dashboard, goals, expenses) {
        const alerts = [];
        const activity = [];
        for (const budget of (Array.isArray(dashboard?.budgets) ? dashboard.budgets : [])) {
            const spent = Number(budget.spent) || 0;
            const limit = Number(budget.budget) || 0;
            const percent = limit > 0 ? spent / limit * 100 : 0;
            if (percent >= 100) {
                alerts.push({
                    icon: "triangle-alert",
                    title: (budget.category || "Your") + " budget exceeded",
                    detail: money(spent) + " spent against " + money(limit),
                    link: "budgets.html"
                });
            } else if (percent >= 80) {
                alerts.push({
                    icon: "bell-ring",
                    title: (budget.category || "Your") + " budget is near its limit",
                    detail: Math.round(percent) + "% of your " + money(limit) + " budget used",
                    link: "budgets.html"
                });
            }
        }
        if (dashboard && Number(dashboard.balance) < 0 && Number(dashboard.income) >= 0) {
            alerts.push({
                icon: "trending-down",
                title: "Expenses are above this month's income",
                detail: "Current balance: " + money(dashboard.balance),
                link: "dashboard.html"
            });
        }
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        for (const goal of (Array.isArray(goals?.goals) ? goals.goals : [])) {
            if (goal.completed || !goal.target_date) continue;
            const target = new Date(String(goal.target_date).slice(0, 10) + "T00:00:00");
            const days = Math.round((target - today) / 86400000);
            if (!Number.isFinite(days) || days > 7) continue;
            alerts.push({
                icon: "target",
                title: String(goal.name || "Goal") + (days < 0 ? " is overdue" : " deadline approaching"),
                detail: days < 0 ? "Target was " + Math.abs(days) + " days ago" :
                    days === 0 ? "Target date is today" : "Target in " + days + " days",
                link: "goals.html"
            });
        }
        const records = Array.isArray(expenses?.expenses) ? expenses.expenses : [];
        const ordered = records.slice().sort((a, b) =>
            String(b.date || "").localeCompare(String(a.date || "")) ||
            Number(b.id || 0) - Number(a.id || 0)
        );
        for (const expense of ordered.slice(0, 3)) {
            activity.push({
                icon: "receipt",
                title: String(expense.category || "Expense") + " recorded",
                detail: money(expense.amount) +
                    (expense.date ? " · " + String(expense.date).slice(0, 10) : ""),
                link: "transactions.html"
            });
        }
        return {alerts, activity};
    }

    function noticeNode(data) {
        const entry = document.createElement("a");
        entry.className = "fh-notice";
        entry.href = data.link;
        entry.style.textDecoration = "none";
        const info = document.createElement("div");
        info.append(textElement("strong", data.title), textElement("span", data.detail));
        entry.append(icon(data.icon), info);
        return entry;
    }

    function renderNotifications(summary, failures) {
        const {alerts, activity} = summary;
        const dot = bellButton.querySelector(".notification-dot");
        if (dot) dot.style.display = alerts.length ? "block" : "none";
        const sub = failures > 0 ?
            "Some updates could not be loaded" :
            (alerts.length ? alerts.length + " financial alerts" : "You're up to date");
        popup.replaceChildren(header("Notifications", sub));
        const content = document.createElement("div");
        content.className = "fh-content";
        if (alerts.length) {
            content.appendChild(textElement("div", "FINANCIAL ALERTS", "fh-subtitle"));
            for (const item of alerts.slice(0, 8)) content.appendChild(noticeNode(item));
        }
        if (activity.length) {
            content.appendChild(textElement("div", "RECENT EXPENSE ACTIVITY", "fh-subtitle"));
            for (const item of activity) content.appendChild(noticeNode(item));
        }
        if (!alerts.length && !activity.length) {
            content.appendChild(textElement("div",
                failures ? "Unable to load all notifications. Choose Refresh to try again." :
                    "No budget alerts, goal deadlines or recent expenses to display.",
                "fh-empty"));
        }
        if (failures && (alerts.length || activity.length)) {
            content.appendChild(textElement("div",
                "Some account updates are unavailable. Refresh to try again.", "fh-empty"));
        }
        popup.appendChild(content);
        const footer = document.createElement("div");
        footer.className = "fh-foot";
        const refresh = document.createElement("button");
        refresh.className = "fh-item";
        refresh.type = "button";
        refresh.append(icon("refresh-cw"), textElement("span", "Refresh"));
        refresh.addEventListener("click", () => loadNotifications(requestVersion));
        footer.appendChild(refresh);
        footer.appendChild(action("settings", "Preferences", "settings.html"));
        popup.appendChild(footer);
        refreshIcons();
    }

    async function loadNotifications(expectedVersion) {
        if (currentMenu !== "notifications") return;
        popup.replaceChildren(header("Notifications", "Checking your latest financial activity..."),
            textElement("div", "Loading alerts and recent expenses...", "fh-empty"));
        const endpoints = ["/dashboard", "/goals", "/expenses"];
        const requests = await Promise.allSettled(endpoints.map(authenticatedGet));
        if (currentMenu !== "notifications" || requestVersion !== expectedVersion) return;
        const [dashboard, goals, expenses] = requests.map(r =>
            r.status === "fulfilled" ? r.value : null
        );
        const failures = requests.filter(r => r.status === "rejected").length;
        renderNotifications(notificationsFrom(dashboard, goals, expenses), failures);
    }

    function openPopup(kind) {
        if (currentMenu === kind) {
            closePopup();
            return;
        }
        concealOldMenus();
        currentMenu = kind;
        requestVersion += 1;
        const expectedVersion = requestVersion;
        bellButton.setAttribute("aria-expanded", String(kind === "notifications"));
        profileButton.setAttribute("aria-expanded", String(kind === "profile"));
        popup.setAttribute("aria-label", kind === "notifications" ?
            "Financial notifications" : "FundHaven account menu");
        popup.hidden = false;
        positionPopup();
        if (kind === "profile") {
            showProfile();
            void refreshProfile(expectedVersion);
        } else {
            void loadNotifications(expectedVersion);
        }
    }

    function init() {
        bellButton = element("notificationButton") || element("goalsNotificationButton") || element("notificationBtn");
        profileButton = element("topProfile") ||
            document.querySelector(".topbar .top-actions .top-user") ||
            document.querySelector(".topbar .topbar-right .top-user");
        if (!bellButton || !profileButton) return; // Public pages have no account toolbar.
        addStyles();
        setAccessible(bellButton, "notifications");
        setAccessible(profileButton, "profile");

        popup = document.createElement("div");
        popup.id = "fhTopbarMenu";
        popup.hidden = true;
        popup.setAttribute("role", "dialog");
        popup.setAttribute("aria-label", "FundHaven menu");
        document.body.appendChild(popup);
        concealOldMenus();

        // Catch clicks before page-local handlers which conflict or create duplicate panels.
        window.addEventListener("click", event => {
            if (bellButton.contains(event.target) || profileButton.contains(event.target)) {
                const kind = bellButton.contains(event.target) ? "notifications" : "profile";
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                openPopup(kind);
                return;
            }
            if (popup.contains(event.target)) return;
            closePopup();
        }, true);

        window.addEventListener("keydown", event => {
            if (event.key === "Escape" && currentMenu) {
                const focused = currentMenu === "notifications" ? bellButton : profileButton;
                closePopup();
                focused.focus();
                event.preventDefault();
                return;
            }
            if (!["Enter", " "].includes(event.key)) return;
            if (event.target !== bellButton && event.target !== profileButton) return;
            // Native buttons already dispatch click for Enter/Space.
            if (event.target.tagName === "BUTTON" || event.target.tagName === "A") return;
            event.preventDefault();
            event.stopImmediatePropagation();
            openPopup(event.target === bellButton ? "notifications" : "profile");
        }, true);

        window.addEventListener("resize", positionPopup);
        window.addEventListener("scroll", positionPopup, true);
        window.addEventListener("fundhaven:expenses-updated", () => {
            if (currentMenu === "notifications") void loadNotifications(requestVersion);
        });
        window.FundHavenTopbar = {
            close: closePopup,
            refresh: () => {
                if (currentMenu === "notifications") return loadNotifications(requestVersion);
                if (currentMenu === "profile") return refreshProfile(requestVersion);
                return Promise.resolve();
            }
        };
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
