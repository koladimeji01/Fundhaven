/* Finova frontend integration smoke tests.
 * Run: node frontend/test-finova.js
 * No external APIs, browser or paid model requests.
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(
    path.join(__dirname, "js", "ai-insights.js"), "utf8"
);

function element(id) {
    const events = {};
    const attrs = {};
    return {
        id,
        events,
        attrs,
        disabled: false,
        checked: false,
        value: "",
        textContent: "",
        children: [],
        classList: {toggle() {}},
        addEventListener(type, cb) {(events[type] ||= []).push(cb);},
        async emit(type, event = {}) {
            for (const cb of (events[type] || [])) {
                await cb({target: this, ...event});
            }
        },
        replaceChildren() {this.children = [];},
        append(...nodes) {this.children.push(...nodes);},
        appendChild(child) {this.children.push(child);},
        setAttribute(key, value) {attrs[key] = value;},
        removeAttribute(key) {delete attrs[key];},
    };
}

function harness({configured = true, aiCode = 200} = {}) {
    const domListeners = {};
    const nodes = {};
    for (const id of [
        "dashboardMonthInput", "bwAIStatus", "bwLocalInsights",
        "bwGeneratedAdvice", "bwLocalInsightButton",
        "bwAIAdviceButton", "bwAIConsent"
    ]) nodes[id] = element(id);
    nodes.dashboardMonthInput.value = "2026-10";
    nodes.bwAIAdviceButton.textContent = "Generate advice with Finova";
    const calls = [];
    const document = {
        getElementById(id) {return nodes[id] || null;},
        createElement(tag) {return element(tag);},
        addEventListener(type, cb) {
            (domListeners[type] ||= []).push(cb);
        },
    };
    const win = {
        BUDGETWISE_API_BASE_URL: "https://demo.example/api/v1",
        location: {replace(target) {
            throw new Error("Unexpected redirect to " + target);
        }}
    };
    const fakeResponse = (status, data) => ({
        status,
        ok: status >= 200 && status < 300,
        async json() {return data;}
    });
    const context = {
        document,
        window: win,
        localStorage: {getItem(key) {
            return key === "access_token" ? "demo-jwt" : null;
        }, removeItem() {}},
        fetch: async (url, options) => {
            calls.push({url, options});
            if (url.endsWith("/ai/status")) {
                return fakeResponse(200, {
                    assistant: "Finova",
                    generative_configured: configured,
                    requires_explicit_consent: true
                });
            }
            if (url.includes("/ai/insights?month=")) {
                return fakeResponse(200, {
                    assistant: "Finova",
                    month: "2026-10",
                    source: "local_rules",
                    insights: ["Review the food category."]
                });
            }
            if (url.endsWith("/ai/insights") && options.method === "POST") {
                return aiCode === 200
                    ? fakeResponse(200, {
                        assistant: "Finova",
                        source: "ai_model",
                        month: "2026-10",
                        advice: "- Keep an eye on food spending."
                    })
                    : fakeResponse(aiCode, {
                        detail: "Finova's OpenAI API key was rejected."
                    });
            }
            throw new Error("Unexpected endpoint " + url);
        },
        AbortController,
        setTimeout, clearTimeout, console
    };

    vm.runInNewContext(script, context, {filename: "ai-insights.js"});
    return {
        nodes, calls,
        async loaded() {
            for (const cb of domListeners.DOMContentLoaded || []) cb();
            await new Promise(resolve => setImmediate(resolve));
        },
        async changeMonth(month) {
            nodes.dashboardMonthInput.value = month;
            for (const cb of domListeners.change || []) {
                cb({target: nodes.dashboardMonthInput});
            }
        }
    };
}

async function main() {
    const ready = harness();
    await ready.loaded();
    assert.equal(ready.calls.length, 1, "Page load must only check configuration");
    assert.ok(ready.calls[0].url.endsWith("/ai/status"));
    assert.equal(ready.calls[0].options.method, undefined);
    assert.equal(ready.nodes.bwAIAdviceButton.disabled, true);

    await ready.nodes.bwLocalInsightButton.emit("click");
    assert.equal(ready.calls.length, 2);
    assert.ok(ready.calls[1].url.endsWith("/ai/insights?month=2026-10"));
    assert.equal(ready.nodes.bwLocalInsights.children.length, 2);

    ready.nodes.bwAIConsent.checked = true;
    await ready.nodes.bwAIConsent.emit("change");
    assert.equal(ready.nodes.bwAIAdviceButton.disabled, false);

    await ready.nodes.bwAIAdviceButton.emit("click");
    assert.equal(ready.calls.length, 3);
    const send = ready.calls[2];
    assert.equal(send.options.method, "POST");
    const body = JSON.parse(send.options.body);
    assert.equal(body.share_aggregates_with_ai, true);
    assert.equal(body.month, "2026-10");
    assert.equal(body.email, undefined);
    assert.equal(body.user_id, undefined);
    assert.match(ready.nodes.bwGeneratedAdvice.textContent, /food spending/);
    assert.equal(ready.nodes.bwAIConsent.checked, false);
    assert.equal(ready.nodes.bwAIAdviceButton.disabled, true);

    await ready.changeMonth("2026-09");
    assert.equal(ready.nodes.bwGeneratedAdvice.textContent, "");
    assert.equal(ready.nodes.bwLocalInsights.children.length, 0);

    const missing = harness({configured: false});
    await missing.loaded();
    assert.equal(missing.nodes.bwAIAdviceButton.disabled, true);
    assert.match(missing.nodes.bwAIStatus.textContent, /OPENAI_API_KEY/);
    missing.nodes.bwAIConsent.checked = true;
    await missing.nodes.bwAIConsent.emit("change");
    assert.equal(missing.nodes.bwAIAdviceButton.disabled, true);
    await missing.nodes.bwAIAdviceButton.emit("click");
    assert.equal(missing.calls.length, 1, "Missing key must not trigger model call");

    const invalidKey = harness({configured: true, aiCode: 503});
    await invalidKey.loaded();
    invalidKey.nodes.bwAIConsent.checked = true;
    await invalidKey.nodes.bwAIConsent.emit("change");
    await invalidKey.nodes.bwAIAdviceButton.emit("click");
    assert.match(invalidKey.nodes.bwAIStatus.textContent, /API key was rejected/);
    assert.equal(invalidKey.nodes.bwAIConsent.checked, false);
    assert.equal(invalidKey.nodes.bwAIAdviceButton.disabled, true);

    const html = fs.readFileSync(
        path.join(__dirname, "dashboard.html"), "utf8"
    );
    assert.match(html, /Finova/);
    assert.match(html, /id="bwAIConsent"/);
    assert.match(html, /data-lucide="sparkles"/);

    console.log("Finova frontend tests passed: consent, status, advice, errors, month changes.");
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
