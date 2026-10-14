/* Regression tests for BudgetWise shared display currency.
   Run: node frontend/test-currency.js
   Uses only Node built-ins; no internet or external currency provider calls.
*/
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const frontend = __dirname;
const currencyCode = fs.readFileSync(
    path.join(frontend, "js", "currency.js"), "utf8"
);
const PREF_KEY = "budgetwise_preferences";
const CACHE_KEY = "budgetwise_fx_ngn_v1";
const date = "2026-10-14";

function setup(options = {}) {
    const data = new Map([
        [PREF_KEY, JSON.stringify({
            currency: options.currency || "NGN",
            decimalPlaces: options.decimals ?? 2
        })]
    ]);
    if (options.cache !== false) {
        data.set(CACHE_KEY, JSON.stringify({
            savedAt: Date.now() - (options.ageDays || 0) * 86400000,
            date,
            rates: {USD: 0.001, GBP: 0.0008, EUR: 0.0009}
        }));
    }
    const events = {};
    const listeners = {};
    let calls = 0;
    const localStorage = {
        getItem(key) {return data.get(key) ?? null;},
        setItem(key, value) {data.set(key, String(value));},
        removeItem(key) {data.delete(key);}
    };
    const win = {
        addEventListener(event, handler) {
            (listeners[event] ||= []).push(handler);
        },
        dispatchEvent(event) {
            (events[event.type] ||= []).push(event.detail);
            for (const fn of listeners[event.type] || []) fn(event);
        }
    };
    const document = {
        body: null,
        addEventListener() {},
        getElementById() {return null;}
    };
    const context = {
        window: win, document, localStorage,
        Date, JSON, Number, String, Array, Object, Math, Intl,
        setTimeout, clearTimeout, console,
        CustomEvent: class CustomEvent {
            constructor(type, init) {this.type=type;this.detail=init?.detail;}
        },
        AbortController,
        async fetch() {
            calls++;
            if (options.fetchFails) throw new Error("FX is offline");
            return {
                ok: true,
                async json() {
                    return {
                        date,
                        ngn: {usd: 0.002, gbp: 0.0016, eur: 0.0018}
                    };
                }
            };
        }
    };
    vm.runInNewContext(currencyCode, context, {filename: "currency.js"});
    return {
        api: win.BudgetWiseCurrency,
        data, events, win,
        calls: () => calls
    };
}

async function main() {
    const ngn = setup({currency: "NGN"});
    assert.equal(ngn.api.info().displayed, "NGN");
    assert.match(ngn.api.format(12000), /₦12,000/);
    assert.equal(ngn.api.compact(1234567), "₦1.2m");
    assert.equal(ngn.calls(), 0, "NGN must not request network rates");

    for (const [code, mark] of [
        ["USD", "$"], ["GBP", "£"], ["EUR", "€"]
    ]) {
        const test = setup({currency: code});
        assert.equal(test.api.info().displayed, code);
        assert.ok(test.api.format(100000).includes(mark));
        assert.notEqual(test.api.format(100000), ngn.api.format(100000));
        assert.equal(test.calls(), 0, "fresh cached rates must avoid fetch");
        assert.equal(test.api.info().rate, {
            USD: 0.001, GBP: 0.0008, EUR: 0.0009
        }[code]);
    }

    const dollars = setup({currency: "USD", decimals: 2});
    assert.equal(dollars.api.format(150000), "$150.00");
    assert.equal(dollars.api.compact(1000000), "$1k");
    assert.equal(dollars.api.format(-50000), "-$50.00");

    const p = JSON.parse(dollars.data.get(PREF_KEY));
    assert.equal(p.currency, "USD", "display formatting must not alter settings");
    const cache = JSON.parse(dollars.data.get(CACHE_KEY));
    assert.equal(cache.rates.USD, 0.001, "display-only formatting must not alter FX");

    const noCache = setup({currency: "USD", cache: false});
    assert.equal(noCache.api.info().displayed, "NGN");
    assert.equal(noCache.api.info().unavailable, true);
    assert.match(noCache.api.format(5000), /₦/);
    await noCache.api.initialize();
    assert.equal(noCache.api.info().displayed, "USD");
    assert.equal(noCache.api.info().rate, 0.002);
    assert.equal(noCache.api.format(5000), "$10.00");
    assert.equal(noCache.calls(), 1);
    assert.equal(noCache.events["budgetwise:currency-ready"].length, 1);

    const offline = setup({currency: "GBP", cache: false, fetchFails: true});
    await offline.api.initialize();
    assert.equal(offline.api.info().displayed, "NGN");
    assert.equal(offline.api.info().unavailable, true);
    assert.match(offline.api.format(20000), /₦/);
    assert.equal(offline.calls(), 2, "both endpoints may be attempted");

    const stale = setup({
        currency: "EUR", ageDays: 2, fetchFails: true
    });
    assert.equal(stale.api.info().displayed, "EUR");
    await stale.api.initialize();
    assert.equal(stale.api.info().displayed, "EUR");
    assert.equal(stale.api.info().stale, true);

    const expired = setup({currency: "USD", ageDays: 8, fetchFails: true});
    await expired.api.initialize();
    assert.equal(expired.api.info().displayed, "NGN");
    assert.equal(expired.api.info().unavailable, true);

    const htmlPages = [
        "transactions.html", "budgets.html", "reports.html", "goals.html"
    ];
    for (const file of htmlPages) {
        const html = fs.readFileSync(path.join(frontend, file), "utf8");
        const runtime = html.indexOf('src="js/runtime-config.js"');
        const shared = html.indexOf('src="js/currency.js"');
        assert.ok(runtime >= 0 && shared > runtime,
            file + " must load currency.js after runtime-config.js");
        const jsRef = html.indexOf('src="js/' + file.replace(".html", ".js") + '"');
        assert.ok(jsRef === -1 || shared < jsRef,
            file + " must load currency.js before page JS");
    }

    for (const file of [
        "transactions.js", "budgets.js", "reports.js", "goals.js"
    ]) {
        const script = fs.readFileSync(path.join(frontend, "js", file), "utf8");
        assert.ok(script.includes("window.BudgetWiseCurrency.format"),
            file + " must use shared formatter");
        assert.ok(!script.includes('currency: "NGN"'),
            file + " must not hardcode NGN display formatting");
    }

    console.log("BudgetWise currency tests passed (NGN, USD, GBP, EUR, cache, offline, HTML).");
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
