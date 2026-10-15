/* Finova UI integration tests (Node built-ins only; no network). */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(
    path.join(__dirname, "js", "ai-insights.js"), "utf8"
);
const html = fs.readFileSync(
    path.join(__dirname, "dashboard.html"), "utf8"
);

class Element {
    constructor(id) {
        this.id = id;
        this.disabled = false;
        this.checked = false;
        this.textContent = "";
        this.value = "";
        this.children = [];
        this.handlers = {};
        this.classList = { toggle() {} };
    }
    addEventListener(type, handler) {
        (this.handlers[type] ||= []).push(handler);
    }
    async fire(type, extra = {}) {
        for (const handler of this.handlers[type] || []) {
            await handler({target: this, ...extra});
        }
    }
    replaceChildren(...children) {
        this.children = children;
    }
    append(...children) {
        this.children.push(...children);
    }
    appendChild(child) {
        this.children.push(child);
        return child;
    }
}

async function setup({configured = true, pendingAdvice = null} = {}) {
    const ids = [
        "bwAIStatus", "bwLocalInsightButton", "bwAIAdviceButton",
        "bwAIConsent", "bwGeneratedAdvice", "bwLocalInsights",
        "dashboardMonthInput"
    ];
    const els = Object.fromEntries(ids.map(id => [id, new Element(id)]));
    els.dashboardMonthInput.value = "2026-10";

    const docEvents = {};
    const requests = [];
    let location = null;

    const document = {
        getElementById(id) {return els[id] || null;},
        createElement(tag) {return new Element(tag);},
        addEventListener(type, handler) {
            (docEvents[type] ||= []).push(handler);
        }
    };
    async function fireDocument(type, event) {
        for (const handler of docEvents[type] || []) {
            await handler(event);
        }
    }
    const window = {
        BUDGETWISE_API_BASE_URL: "https://backend.example/api/v1",
        location: {replace(url) {location = url;}}
    };
    const localStorage = {
        getItem(key) {return key === "access_token" ? "safe-test-token" : null;},
        removeItem() {}
    };
    async function fetch(url, options = {}) {
        const method = options.method || "GET";
        requests.push({url, method, options});
        const ok = result => ({
            ok: true, status: 200, json: async () => result
        });
        if (url.endsWith("/ai/status")) return ok({
            assistant: "Finova",
            generative_configured: configured,
            message: configured ? "Finova is configured" : "Set OPENAI_API_KEY on Render"
        });
        if (url.includes("/ai/insights?")) return ok({
            assistant: "Finova",
            month: "2026-10",
            source: "local_rules",
            insights: ["Review food spending."]
        });
        if (url.endsWith("/ai/insights") && method === "POST") {
            const result = pendingAdvice
                ? await pendingAdvice
                : {assistant: "Finova", source: "ai_model", advice: "- Reduce wasted spending."};
            return ok(result);
        }
        throw new Error("Unexpected test fetch: " + method + " " + url);
    }

    vm.runInNewContext(script, {
        document, window, localStorage, fetch,
        Date, JSON, Number, String, Array, Object, Math, console
    }, {filename: "ai-insights.js"});

    await fireDocument("DOMContentLoaded", {target: document});
    // Flush microtasks scheduled by the async readiness request.
    await new Promise(resolve => setImmediate(resolve));
    return {els, requests, fireDocument, getLocation: () => location};
}

async function run() {
    for (const id of [
        "bwAIStatus", "bwLocalInsightButton", "bwAIAdviceButton",
        "bwAIConsent", "bwGeneratedAdvice", "bwLocalInsights"
    ]) {
        assert.ok(html.includes('id="' + id + '"'), "Dashboard requires " + id);
    }
    assert.ok(html.includes("Finova — BudgetWise AI"));
    assert.ok(html.includes('data-lucide="sparkles"'));

    const live = await setup();
    assert.equal(live.requests.length, 1);
    assert.equal(live.requests[0].method, "GET");
    assert.ok(live.requests[0].url.endsWith("/ai/status"));
    assert.equal(live.els.bwAIAdviceButton.disabled, true);
    assert.equal(live.requests.some(r => r.method === "POST"), false);

    await live.els.bwLocalInsightButton.fire("click");
    assert.equal(live.requests.filter(r => r.method === "POST").length, 0);
    assert.equal(live.els.bwLocalInsights.children.length, 2);
    assert.ok(live.els.bwAIStatus.textContent.includes("private"));

    live.els.bwAIConsent.checked = true;
    await live.els.bwAIConsent.fire("change");
    assert.equal(live.els.bwAIAdviceButton.disabled, false);
    await live.els.bwAIAdviceButton.fire("click");
    const generated = live.requests.filter(r => r.method === "POST");
    assert.equal(generated.length, 1);
    const sent = JSON.parse(generated[0].options.body);
    assert.equal(sent.month, "2026-10");
    assert.equal(sent.share_aggregates_with_ai, true);
    assert.equal(live.els.bwAIConsent.checked, false);
    assert.equal(live.els.bwAIAdviceButton.disabled, true);
    assert.equal(live.els.bwGeneratedAdvice.textContent, "- Reduce wasted spending.");
    assert.equal(live.getLocation(), null);

    const notReady = await setup({configured: false});
    notReady.els.bwAIConsent.checked = true;
    await notReady.els.bwAIConsent.fire("change");
    assert.equal(notReady.els.bwAIAdviceButton.disabled, true);
    assert.ok(notReady.els.bwAIStatus.textContent.includes("OPENAI_API_KEY"));
    assert.equal(notReady.requests.some(r => r.method === "POST"), false);

    let finish;
    const slow = new Promise(resolve => {finish = resolve;});
    const stale = await setup({pendingAdvice: slow});
    stale.els.bwAIConsent.checked = true;
    await stale.els.bwAIConsent.fire("change");
    const inFlight = stale.els.bwAIAdviceButton.fire("click");
    await Promise.resolve();
    stale.els.dashboardMonthInput.value = "2026-09";
    await stale.fireDocument("change", {target: stale.els.dashboardMonthInput});
    finish({assistant: "Finova", source: "ai_model", advice: "OLD MONTH"});
    await inFlight;
    assert.equal(stale.els.bwGeneratedAdvice.textContent, "");
    assert.equal(stale.els.bwAIConsent.checked, false);

    console.log("Finova UI tests passed (readiness, consent, local tips, generated text, stale month).");
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
