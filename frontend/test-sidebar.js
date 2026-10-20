/* Prevent sidebar drift across FundHaven's six authenticated pages. */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const pages = ["dashboard", "transactions", "budgets", "reports", "goals", "settings"];
const links = [
  ["dashboard", "layout-dashboard"],
  ["transactions", "arrow-left-right"],
  ["budgets", "wallet-cards"],
  ["reports", "bar-chart-3"],
  ["goals", "target"],
  ["settings", "settings"],
];
let canonical = null;

for (const page of pages) {
    const html = fs.readFileSync(path.join(__dirname, page + ".html"), "utf8");
    assert.ok(html.includes('href="css/sidebar.css"'), page + " must use shared CSS");
    assert.ok(html.indexOf('href="css/sidebar.css"') > html.indexOf('href="css/brand.css"'));
    const sidebar = html.match(/<aside class="sidebar fh-sidebar"[^>]*>[\s\S]*?<\/aside>/);
    assert.ok(sidebar, page + " must use shared sidebar markup");
    const content = sidebar[0];
    assert.equal((content.match(/id="sidebarAvatar"/g) || []).length, 1);
    assert.equal((content.match(/id="sidebarUserName"/g) || []).length, 1);
    assert.equal((content.match(/id="sidebarUserEmail"/g) || []).length, 1);
    assert.equal((content.match(/aria-current="page"/g) || []).length, 1);
    for (const [target, lucide] of links) {
        const matched = content.match(new RegExp(
            '<a href="' + target + '\\.html" class="nav-link( active)?"(?: aria-current="page")?>' +
            '[\\s\\S]*?<i data-lucide="' + lucide + '"'
        ));
        assert.ok(matched, page + " missing stable menu icon/link " + target);
        assert.equal(Boolean(matched[1]), target === page, page + " wrong selected tab");
    }
    // The sidebar is identical between pages except the selected item.
    const normalized = content
        .replace(/ class="nav-link active"/g, ' class="nav-link"')
        .replace(/ aria-current="page"/g, "");
    if (canonical === null) canonical = normalized;
    assert.equal(normalized, canonical, page + " differs from shared sidebar");
}

const css = fs.readFileSync(path.join(__dirname, "css", "sidebar.css"), "utf8");
assert.ok(css.includes("--fh-sidebar-width: 245px"));
assert.ok(css.includes("@media (max-width: 900px)"));
assert.ok(css.includes(".fh-sidebar.open"));
assert.ok(css.includes(".topbar #mobileMenu"));
console.log("FundHaven sidebar consistency tests passed across all six pages.");
