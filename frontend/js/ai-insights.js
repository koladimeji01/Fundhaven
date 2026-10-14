/* ============================================================
   FINOVA — BUDGETWISE AI FINANCIAL ASSISTANT
   - Local insight GET never calls OpenAI
   - POST sends aggregated NGN totals only after explicit consent
   - OpenAI keys stay on Render, never in this public JavaScript
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
        const now = new Date();
        return String(now.getFullYear()) + "-" +
            String(now.getMonth() + 1).padStart(2, "0");
    }

    function status(message, isError = false) {
        const target = get("bwAIStatus");
        if (!target) return;
        target.textContent = String(message || "");
        target.classList.toggle("bw-ai-error", isError);
    }

    function clearResults() {
        get("bwLocalInsights")?.replaceChildren();
        if (get("bwGeneratedAdvice")) get("bwGeneratedAdvice").textContent = "";
        status("Finova is ready to review the selected month's spending.");
    }

    function renderLocal(data) {
        const container = get("bwLocalInsights");
        if (!container) return;
        container.replaceChildren();
        const heading = document.createElement("h3");
        heading.textContent = "Finova's spending observations · " + data.month;
        const list = document.createElement("ul");
        for (const advice of (Array.isArray(data.insights) ? data.insights : [])) {
            const item = document.createElement("li");
            item.textContent = String(advice); // Avoid injecting category-label HTML
            list.appendChild(item);
        }
        container.append(heading, list);
    }

    async function api(path, options = {}) {
        const token = localStorage.getItem("access_token");
        if (!token) {
            window.location.replace("login.html");
            throw new Error("Your session has expired. Please sign in again.");
        }

        const controller = new AbortController();
        // On free hosts the first request may wait for Render to wake up.
        const timeout = setTimeout(() => controller.abort(), 70000);
        let response;
        try {
            response = await fetch(API_BASE + path, {
                ...options,
                signal: controller.signal,
                headers: {
                    Accept: "application/json",
                    Authorization: "Bearer " + token,
                    ...(options.headers || {})
                }
            });
        } catch (error) {
            if (error?.name === "AbortError") {
                throw new Error("Finova's request timed out. Wait a moment and try again.");
            }
            throw new Error(
                "Finova cannot reach the BudgetWise backend. " +
                "Check your connection and whether Render is Live."
            );
        } finally {
            clearTimeout(timeout);
        }

        if (response.status === 401) {
            ["access_token", "user_email", "user_name", "user_id"]
                .forEach(key => localStorage.removeItem(key));
            window.location.replace("login.html");
            throw new Error("Your BudgetWise session expired. Please sign in again.");
        }

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            const detail = typeof result.detail === "string"
                ? result.detail
                : Array.isArray(result.detail)
                    ? result.detail.map(item => item.msg || "Invalid input").join(", ")
                    : "Finova request failed (HTTP " + response.status + ").";
            throw new Error(detail);
        }

        return result;
    }

    document.addEventListener("DOMContentLoaded", () => {
        const localButton = get("bwLocalInsightButton");
        const aiButton = get("bwAIAdviceButton");
        const consent = get("bwAIConsent");
        const adviceHost = get("bwGeneratedAdvice");
        if (!localButton || !aiButton || !consent || !adviceHost) return;

        let configured = null;  // unknown until authenticated /ai/status returns
        let localBusy = false;
        let modelBusy = false;
        let viewVersion = 0;

        function updateButton() {
            aiButton.disabled = modelBusy || !consent.checked || configured === false;
        }

        // This checks ONLY whether Render has an API key. It never calls
        // OpenAI and never sends financial data.
        async function checkConfiguration() {
            try {
                const result = await api("/ai/status");
                if (typeof result.generative_configured === "boolean") {
                    configured = result.generative_configured;
                    if (!configured) {
                        status(
                            "Finova's generated advice is not configured yet. " +
                            "Add OPENAI_API_KEY in Render → Environment. " +
                            "Private insights still work.",
                            true
                        );
                    } else {
                        status(
                            "Finova is ready. Tick the consent box to request " +
                            "generated advice, or view private insights."
                        );
                    }
                }
            } catch (error) {
                // Continue to support older backends without this endpoint.
                // A subsequent explicit user action can still try generation.
                configured = null;
                if (!String(error.message).includes("HTTP 404")) {
                    status(error.message, true);
                }
            } finally {
                updateButton();
            }
        }

        localButton.addEventListener("click", async () => {
            if (localBusy) return;
            const month = selectedMonth();
            const version = viewVersion;
            localBusy = true;
            localButton.disabled = true;
            status("Finova is reviewing your monthly spending totals privately...");

            try {
                const result = await api(
                    "/ai/insights?month=" + encodeURIComponent(month)
                );
                if (version !== viewVersion || selectedMonth() !== month) return;
                renderLocal(result);
                status(
                    "Finova's private insights are ready. " +
                    "No information was sent to OpenAI."
                );
            } catch (error) {
                if (version === viewVersion) status(error.message, true);
            } finally {
                localBusy = false;
                localButton.disabled = false;
            }
        });

        consent.addEventListener("change", updateButton);
        updateButton();

        aiButton.addEventListener("click", async () => {
            if (modelBusy || !consent.checked || configured === false) {
                status(
                    configured === false
                        ? "Finova needs OPENAI_API_KEY on Render before it can generate advice."
                        : "Tick the consent box to ask Finova for generated advice.",
                    true
                );
                return;
            }

            const month = selectedMonth();
            const version = viewVersion;
            modelBusy = true;
            aiButton.textContent = "Finova is thinking...";
            aiButton.setAttribute("aria-busy", "true");
            updateButton();
            adviceHost.textContent = "";
            status("Finova is generating suggestions from aggregated NGN totals...");

            try {
                const result = await api("/ai/insights", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        month,
                        share_aggregates_with_ai: true
                    })
                });

                if (version !== viewVersion || selectedMonth() !== month) return;
                if (result.source !== "ai_model" ||
                    typeof result.advice !== "string" ||
                    !result.advice.trim()) {
                    throw new Error("Finova did not return generated advice.");
                }

                // Rendering as text prevents provider output from injecting HTML.
                adviceHost.textContent = result.advice.trim();
                status(
                    "Finova's generated advice is ready. " +
                    "Figures refer to saved NGN amounts; check suggestions before acting."
                );
            } catch (error) {
                if (version === viewVersion) status(error.message, true);
            } finally {
                // One affirmative consent per generated request. Never persisted.
                consent.checked = false;
                modelBusy = false;
                aiButton.textContent = "Generate advice with Finova";
                aiButton.removeAttribute("aria-busy");
                updateButton();
            }
        });

        // Do not show responses from a previous month if the user switches
        // while a slow network or a free Render instance is finishing.
        document.addEventListener("change", event => {
            if (event.target?.id !== "dashboardMonthInput") return;
            viewVersion++;
            clearResults();
            consent.checked = false;
            updateButton();
        });

        void checkConfiguration();
    });
})();
