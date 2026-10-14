/* ============================================================
   BUDGETWISE SHARED DISPLAY CURRENCY
   Money in BudgetWise is STORED and ENTERED in NGN.
   This helper converts NGN for display only using the same
   preference and exchange-rate cache as the Dashboard.
   ============================================================ */
(() => {
    "use strict";

    const PREFERENCES_KEY = "budgetwise_preferences";
    const FX_CACHE_KEY = "budgetwise_fx_ngn_v1";
    const CODES = ["NGN", "USD", "GBP", "EUR"];
    const DAY_MS = 86400000;
    const MAX_CACHE_AGE = 7 * DAY_MS;
    const URLS = [
        "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/ngn.min.json",
        "https://latest.currency-api.pages.dev/v1/currencies/ngn.min.json"
    ];
    const SYMBOL = {NGN: "₦", USD: "$", GBP: "£", EUR: "€"};
    const LOCALE = {NGN: "en-NG", USD: "en-US", GBP: "en-GB", EUR: "en-IE"};

    const state = {
        preferred: "NGN",
        displayed: "NGN",
        decimalPlaces: 0,
        rate: 1,
        date: "",
        stale: false,
        unavailable: false,
        loading: false
    };

    function validRate(value) {
        return Number.isFinite(Number(value)) && Number(value) > 0;
    }

    function readPreferences() {
        let saved = {};
        try {
            saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || "{}") || {};
        } catch {
            saved = {};
        }
        const wanted = String(saved.currency || "NGN").toUpperCase();
        return {
            currency: CODES.includes(wanted) ? wanted : "NGN",
            decimalPlaces: [0, 2].includes(Number(saved.decimalPlaces))
                ? Number(saved.decimalPlaces) : 0
        };
    }

    function cachedRates() {
        try {
            const data = JSON.parse(localStorage.getItem(FX_CACHE_KEY) || "null");
            if (!data || !Number.isFinite(data.savedAt) ||
                data.savedAt > Date.now() + 60000 ||
                Date.now() - data.savedAt > MAX_CACHE_AGE ||
                !["USD", "GBP", "EUR"].every(code => validRate(data.rates?.[code]))) {
                return null;
            }
            return data;
        } catch {
            return null;
        }
    }

    function applyCache() {
        const settings = readPreferences();
        state.preferred = settings.currency;
        state.decimalPlaces = settings.decimalPlaces;
        state.displayed = "NGN";
        state.rate = 1;
        state.date = "";
        state.stale = false;
        state.unavailable = false;

        if (state.preferred !== "NGN") {
            const rates = cachedRates();
            if (rates && validRate(rates.rates[state.preferred])) {
                state.displayed = state.preferred;
                state.rate = Number(rates.rates[state.preferred]);
                state.date = rates.date || "";
                state.stale = Date.now() - rates.savedAt >= DAY_MS;
            } else {
                state.unavailable = true;
            }
        }
    }

    function format(value) {
        const converted = (Number(value) || 0) * state.rate;
        return new Intl.NumberFormat(LOCALE[state.displayed], {
            style: "currency",
            currency: state.displayed,
            minimumFractionDigits: state.decimalPlaces,
            maximumFractionDigits: state.decimalPlaces
        }).format(converted);
    }

    function compact(value) {
        const amount = (Number(value) || 0) * state.rate;
        const absolute = Math.abs(amount);
        const sign = amount < 0 ? "−" : "";
        const symbol = SYMBOL[state.displayed];

        if (absolute >= 1000000) {
            return sign + symbol +
                (absolute / 1000000).toFixed(absolute % 1000000 ? 1 : 0) + "m";
        }
        if (absolute >= 1000) {
            return sign + symbol +
                (absolute / 1000).toFixed(absolute % 1000 ? 1 : 0) + "k";
        }
        const decimals = state.displayed === "NGN" ? 0 :
            (absolute > 0 && absolute < 1 ? 2 : 0);
        return sign + symbol + absolute.toFixed(decimals);
    }

    function statusText() {
        if (state.preferred === "NGN") return "";
        if (state.unavailable) {
            return state.loading
                ? "Loading " + state.preferred +
                    " exchange rates. Amounts are shown in NGN until rates are available."
                : "Unable to retrieve a reliable " + state.preferred +
                    " exchange rate. Amounts remain in NGN; your preference is saved.";
        }

        const oneUnitInNgn = new Intl.NumberFormat("en-NG", {
            style: "currency", currency: "NGN", maximumFractionDigits: 2
        }).format(1 / state.rate);
        return "Showing approximate " + state.displayed +
            " values • 1 " + state.displayed + " ≈ " + oneUnitInNgn +
            (state.date ? " • rate dated " + state.date : "") +
            (state.stale ? " • using a cached rate (may be outdated)" : "") +
            ". Saved records and new form entries remain in NGN.";
    }

    function renderStatus() {
        if (!document.body) return;
        let note = document.getElementById("budgetwiseCurrencyStatus");
        if (state.preferred === "NGN") {
            if (note) note.hidden = true;
            return;
        }
        if (!note) {
            const content = document.querySelector("main .content, main .page-content, main");
            if (!content) return;
            note = document.createElement("div");
            note.id = "budgetwiseCurrencyStatus";
            note.setAttribute("role", "status");
            note.style.cssText =
                "margin:12px 0;padding:10px 14px;border:1px solid #dceae2;" +
                "border-radius:10px;background:#f0f7f2;color:#436d53;" +
                "font-size:12px;line-height:1.6";
            content.prepend(note);
        }
        note.hidden = false;
        note.style.background = state.unavailable ? "#fff7ed" : "#f0f7f2";
        note.style.color = state.unavailable ? "#925a21" : "#436d53";
        note.textContent = statusText();
    }

    function announce() {
        renderStatus();
        window.dispatchEvent(new CustomEvent("budgetwise:currency-ready", {
            detail: {
                currency: state.displayed,
                preferred: state.preferred,
                stale: state.stale,
                unavailable: state.unavailable
            }
        }));
    }

    async function fetchFreshRates() {
        let lastError;
        for (const url of URLS) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4500);
            try {
                const response = await fetch(url, {
                    signal: controller.signal, cache: "no-cache"
                });
                if (!response.ok) {
                    throw new Error("Exchange rate HTTP " + response.status);
                }
                const result = await response.json();
                const rates = {
                    USD: Number(result?.ngn?.usd),
                    GBP: Number(result?.ngn?.gbp),
                    EUR: Number(result?.ngn?.eur)
                };
                if (!Object.values(rates).every(validRate)) {
                    throw new Error("Exchange rates are incomplete");
                }
                return {
                    savedAt: Date.now(),
                    date: /^\d{4}-\d{2}-\d{2}$/.test(result.date || "")
                        ? result.date : "",
                    rates
                };
            } catch (error) {
                lastError = error;
            } finally {
                clearTimeout(timeout);
            }
        }
        throw lastError || new Error("Exchange rates unavailable");
    }

    let pending = null;

    function initialize() {
        if (pending) return pending;

        applyCache();
        const rates = cachedRates();
        const needsFetch = state.preferred !== "NGN" &&
            (!rates || Date.now() - rates.savedAt >= DAY_MS);

        if (!needsFetch) {
            state.loading = false;
            renderStatus();
            return Promise.resolve();
        }

        state.loading = true;
        renderStatus();
        pending = fetchFreshRates().then(entry => {
            try {
                localStorage.setItem(FX_CACHE_KEY, JSON.stringify(entry));
            } catch {
                // Storage limits should not prevent temporary conversion.
            }
            // Apply fetched rates even if localStorage is unavailable.
            applyCache();
            if (state.preferred !== "NGN" && state.displayed === "NGN") {
                state.displayed = state.preferred;
                state.rate = Number(entry.rates[state.preferred]);
                state.date = entry.date;
                state.unavailable = false;
                state.stale = false;
            }
        }).catch(() => {
            // Do not replace NGN numbers with a preferred-currency symbol
            // when we cannot obtain an actual exchange rate.
            applyCache();
        }).finally(() => {
            pending = null;
            state.loading = false;
            announce();
        });
        return pending;
    }

    window.BudgetWiseCurrency = Object.freeze({
        format,
        compact,
        initialize,
        renderStatus,
        info: () => ({...state})
    });

    // Startup happens in <head>; conversion is immediately available
    // from the same validated cache that Dashboard uses.
    void initialize();

    document.addEventListener("DOMContentLoaded", renderStatus);

    window.addEventListener("storage", event => {
        if (event.key === PREFERENCES_KEY || event.key === FX_CACHE_KEY) {
            applyCache();
            announce();
            if (event.key === PREFERENCES_KEY) void initialize();
        }
    });
})();
