/* ============================================================
   FINOVA — BUDGETWISE AI
   Private spending observations + optional consented generative advice.
   Never sends monthly financial totals to the AI provider on page load.
   ============================================================ */
(() => {
    "use strict";

    const API_BASE = (
        window.BUDGETWISE_API_BASE_URL ||
        "http://127.0.0.1:8000/api/v1"
    );
    const get = id => document.getElementById(id);

    function selectedMonth() {
        const value = get("dashboardMonthInput")?.value || "";
        if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
        const today = new Date();
        return String(today.getFullYear()) + "-" +
            String(today.getMonth() + 1).padStart(2, "0");
    }

    function status(message, isError = false) {
        const element = get("bwAIStatus");
        if (!element) return;
        element.textContent = String(message || "");
        element.classList.toggle("bw-ai-error", Boolean(isError));
    }

    function renderLocal(data) {
        const host = get("bwLocalInsights");
        if (!host) return;
        host.replaceChildren();
        const heading = document.createElement("h3");
        heading.textContent = "Finova spending observations · " + data.month;
        const list = document.createElement("ul");
        for (const insight of (data.insights || [])) {
            const item = document.createElement("li");
            item.textContent = String(insight);
            list.appendChild(item);
        }
        host.append(heading, list);
    }

    async function api(path, options = {}) {
        const token = localStorage.getItem("access_token");
        if (!token) {
            window.location.replace("login.html");
            throw new Error("Please sign in to continue.");
        }

        let response;
        try {
            response = await fetch(API_BASE + path, {
                ...options,
                headers: {
                    "Accept": "application/json",
                    "Authorization": "Bearer " + token,
                    ...(options.headers || {})
                }
            });
        } catch {
            throw new Error(
                "Finova cannot reach the BudgetWise backend. " +
                "Check your internet connection and Render deployment."
            );
        }

        if (response.status === 401) {
            ["access_token", "user_email", "user_name", "user_id"]
                .forEach(key => localStorage.removeItem(key));
            window.location.replace("login.html");
            throw new Error("Your BudgetWise session has expired.");
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const detail = typeof data.detail === "string"
                ? data.detail
                : Array.isArray(data.detail)
                    ? data.detail.map(error => error.msg || "Invalid input").join(", ")
                    : "Request failed (HTTP " + response.status + ").";
            throw new Error(detail);
        }
        return data;
    }

    document.addEventListener("DOMContentLoaded", () => {
        const localButton = get("bwLocalInsightButton");
        const modelButton = get("bwAIAdviceButton");
        const consent = get("bwAIConsent");
        const adviceHost = get("bwGeneratedAdvice");
        const localHost = get("bwLocalInsights");

        if (!localButton || !modelButton || !consent ||
            !adviceHost || !localHost) return;

        let configured = false;
        let generating = false;
        let loadingLocal = false;
        let revision = 0;
        let interacted = false;

        const updateButton = () => {
            modelButton.disabled = !configured || !consent.checked || generating;
        };

        const clearResults = () => {
            revision++;
            localHost.replaceChildren();
            adviceHost.textContent = "";
            consent.checked = false;
            updateButton();
            status(configured
                ? "Finova is ready for the selected month. Choose an option."
                : "Finova's private spending insights are available. " +
                  "Generative advice requires backend OpenAI API configuration."
            );
        };

        // Configuration check sends NO financial data to OpenAI.
        // Being configured doesn't guarantee valid API credits or connectivity.
        async function checkConfiguration() {
            try {
                const result = await api("/ai/status");
                configured = result.generative_configured === true;
                updateButton();
                if (!interacted) {
                    status(configured
                        ? "Finova is ready. View private insights or opt in " +
                          "to a generative AI response."
                        : result.message ||
                          "Finova generative advice needs OPENAI_API_KEY " +
                          "on the Render backend.",
                        !configured);
                }
            } catch (error) {
                configured = false;
                updateButton();
                if (!interacted) {
                    status(
                        "Finova's generative configuration could not be checked: " +
                        error.message + " Private insights may still work.",
                        true
                    );
                }
            }
        }

        // Normal insights are calculated in BudgetWise, without an AI provider.
        localButton.addEventListener("click", async () => {
            if (loadingLocal) return;
            interacted = true;
            const requestRevision = revision;
            const month = selectedMonth();
            loadingLocal = true;
            localButton.disabled = true;
            status("Finova is reviewing your " + month + " spending totals privately...");

            try {
                const result = await api(
                    "/ai/insights?month=" + encodeURIComponent(month)
                );
                if (requestRevision !== revision || selectedMonth() !== month) return;
                if (result.source !== "local_rules") {
                    throw new Error("Unexpected private insights response.");
                }
                renderLocal(result);
                status(
                    "Finova's private spending insights are ready. " +
                    "No financial data was sent to OpenAI."
                );
            } catch (error) {
                if (requestRevision === revision) status(error.message, true);
            } finally {
                loadingLocal = false;
                localButton.disabled = false;
            }
        });

        consent.addEventListener("change", updateButton);
        modelButton.disabled = true;

        // Only an explicit button click with fresh consent can trigger a
        // provider request. The one-time checkbox is reset immediately.
        modelButton.addEventListener("click", async () => {
            interacted = true;
            if (!configured) {
                status(
                    "Finova generative advice is unavailable until " +
                    "OPENAI_API_KEY is configured on the backend.",
                    true
                );
                return;
            }
            if (!consent.checked || generating) {
                status("Tick the consent box before asking Finova for AI advice.", true);
                return;
            }

            const month = selectedMonth();
            const requestRevision = revision;
            generating = true;
            consent.checked = false;
            updateButton();
            adviceHost.textContent = "";
            status(
                "Finova is generating advice from the " + month +
                " monthly category totals. This may take a few moments..."
            );

            try {
                const result = await api("/ai/insights", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        month,
                        share_aggregates_with_ai: true
                    })
                });

                if (requestRevision !== revision || selectedMonth() !== month) return;
                if (result.source !== "ai_model" ||
                    typeof result.advice !== "string" ||
                    !result.advice.trim()) {
                    throw new Error("Finova did not return valid generative advice.");
                }
                // Plain text only: model output must never become executable HTML.
                adviceHost.textContent = result.advice.trim();
                status(
                    "Finova's AI-generated suggestions are ready. " +
                    "Review the NGN figures before making financial decisions."
                );
            } catch (error) {
                if (requestRevision === revision) {
                    status(
                        error.message +
                        " You can still view private Finova spending insights.",
                        true
                    );
                }
            } finally {
                generating = false;
                updateButton();
            }
        });

        // Old requests may finish after selecting another financial month.
        // Never show their advice for a different month.
        document.addEventListener("change", event => {
            if (event.target?.id === "dashboardMonthInput") {
                interacted = true;
                clearResults();
            }
        });

        void checkConfiguration();
    });
})();
