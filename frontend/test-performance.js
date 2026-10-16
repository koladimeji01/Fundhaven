/* Guard against unnecessary blocking of finance pages.
 * Static checks; browser and network performance still require live measurement.
 */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = __dirname;
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const dashboard = read("js/dashboard.js");
assert.match(dashboard, /const dashboardReady = loadDashboard\(\);/);
assert.match(dashboard, /void loadCurrencyPreference\(\)/);
assert.doesNotMatch(dashboard, /await fxReady;\s*await loadDashboard\(\)/);
assert.match(read("js/budgets.js"), /await Promise\.all\(\[loadUser\(\), loadExpenses\(\)\]\);\s*await loadBudgets\(\);/);
assert.match(read("js/transactions.js"), /await Promise\.all\(\[loadUser\(\), loadTransactions\(\)\]\);/);
assert.match(read("js/settings.js"), /await Promise\.all\(\[loadUser\(\), setupMonthlyEmailPreference\(\)\]\);/);
for (const page of ["dashboard", "transactions", "budgets", "reports", "goals", "settings"]) {
    const html = read(page + ".html");
    assert.match(html, /<script async src="https:\/\/unpkg\.com\/lucide@latest"/);
    assert.match(html, /window\.lucide\?\.createIcons\(\)/);
}
console.log("Frontend startup performance guardrails passed.");
