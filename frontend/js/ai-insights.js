/* BudgetWise AI Insights dashboard module.
 * Runs independently of the existing dashboard.js.
 * Never sends financial information to OpenAI on page load.
 */
(() => {
    "use strict";

    const API_BASE = "http://127.0.0.1:8000/api/v1";
    const get = id => document.getElementById(id);

    function selectedMonth() {
        const value = get("dashboardMonthInput")?.value || "";
        if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
        const now = new Date();
        return String(now.getFullYear()) + "-" +
            String(now.getMonth() + 1).padStart(2, "0");
    }

    function status(text, isError = false) {
        const el = get("bwAIStatus");
        if (!el) return;
        el.textContent = text;
        el.classList.toggle("bw-ai-error", isError);
    }

    function clearResults() {
        const local = get("bwLocalInsights");
        const external = get("bwGeneratedAdvice");
        if (local) local.replaceChildren();
        if (external) external.textContent = "";
        status("Choose an option to review the selected month's finances.");
    }

    function renderLocal(data) {
        const host = get("bwLocalInsights");
        if (!host) return;
        host.replaceChildren();
        const heading = document.createElement("h3");
        heading.textContent = "Spending observations · " + data.month;
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
            throw new Error("Please sign in again.");
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
            throw new Error("Cannot reach BudgetWise API. Check that FastAPI is running.");
        }

        if (response.status === 401) {
            ["access_token", "user_email", "user_name", "user_id"]
                .forEach(key => localStorage.removeItem(key));
            window.location.replace("login.html");
            throw new Error("Your session has expired.");
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const detail = typeof data.detail === "string"
                ? data.detail
                : "Request failed (HTTP " + response.status + ").";
            throw new Error(detail);
        }
        return data;
    }

    document.addEventListener("DOMContentLoaded", () => {
        const localButton = get("bwLocalInsightButton");
        const modelButton = get("bwAIAdviceButton");
        const consent = get("bwAIConsent");
        if (!localButton || !modelButton || !consent) return;

        localButton.addEventListener("click", async () => {
            localButton.disabled = true;
            status("Reviewing monthly totals locally...");
            try {
                const month = encodeURIComponent(selectedMonth());
                const result = await api("/ai/insights?month=" + month);
                renderLocal(result);
                status("Local insights are ready. No information was sent to an AI provider.");
            } catch (error) {
                status(error.message, true);
            } finally {
                localButton.disabled = false;
            }
        });

        consent.addEventListener("change", () => {
            modelButton.disabled = !consent.checked;
        });
        modelButton.disabled = true;

        modelButton.addEventListener("click", async () => {
            if (!consent.checked) {
                status("Tick the consent box before using AI advice.", true);
                return;
            }

            modelButton.disabled = true;
            const adviceHost = get("bwGeneratedAdvice");
            adviceHost.textContent = "";
            status("Asking AI to review the selected month's category totals...");
            try {
                const result = await api("/ai/insights", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        month: selectedMonth(),
                        share_aggregates_with_ai: true
                    })
                });
                adviceHost.textContent = result.advice || "No advice returned.";
                status("AI-generated suggestions are ready. Check figures before acting.");
            } catch (error) {
                status(error.message, true);
            } finally {
                // One explicit consent per request. Opt-in is never stored.
                consent.checked = false;
                modelButton.disabled = true;
            }
        });

        // Prevent displaying stale coaching after month changes.
        document.addEventListener("change", event => {
            if (event.target?.id === "dashboardMonthInput") {
                clearResults();
                consent.checked = false;
                modelButton.disabled = true;
            }
        });
    });
})();
