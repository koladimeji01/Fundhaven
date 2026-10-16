/*
 * Generate a static Vercel or Netlify deployment from FundHaven/frontend.
 *
 * Preferred public build-time environment variable:
 *   FUNDHAVEN_API_URL=https://YOUR-RENDER-SERVICE.onrender.com/api/v1
 * The old BUDGETWISE_API_URL is also accepted during migration.
 *
 * This is a public API endpoint, not a secret. Never put DATABASE_URL,
 * SECRET_KEY, or any API token in public build configuration.
 *
 * Usage:
 *   cd frontend && FUNDHAVEN_API_URL=https://... node build.js
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const dist = path.join(root, "dist");

function parsePublicApiUrl(raw) {
    if (!raw || !raw.trim()) {
        throw new Error(
            "Missing FUNDHAVEN_API_URL. In Netlify/Vercel site settings → " +
            "Environment variables, set it to the Render HTTPS URL " +
            "ending in /api/v1, then redeploy."
        );
    }
    let url;
    try {
        url = new URL(raw.trim());
    } catch {
        throw new Error("FUNDHAVEN_API_URL is not a valid URL.");
    }
    if (url.protocol !== "https:" || url.username || url.password ||
        url.search || url.hash || url.pathname.replace(/\/$/, "") !== "/api/v1") {
        throw new Error(
            "FUNDHAVEN_API_URL must be a public https://.../api/v1 URL " +
            "with no credentials, query string or fragments."
        );
    }
    return url.origin + "/api/v1";
}

const apiUrl = parsePublicApiUrl(
    process.env.FUNDHAVEN_API_URL || process.env.BUDGETWISE_API_URL
);
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const ignored = new Set([
    "dist", "node_modules", ".git", ".vercel", "build.js",
    "vercel.json", "test-currency.js", "test-finova.js", "test-performance.js", ".env", ".env.local", ".env.production",
    ".env.test", "README.md"
]);

function copyPublic(source, target) {
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const from = path.join(source, entry.name);
        const to = path.join(target, entry.name);
        if (ignored.has(entry.name) || entry.name.startsWith(".env")) continue;
        // Do not follow symbolic links, which might point at private files.
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
            fs.mkdirSync(to, { recursive: true });
            copyPublic(from, to);
        } else if (entry.isFile()) {
            fs.copyFileSync(from, to);
        }
    }
}
copyPublic(root, dist);

// Force the public, non-secret API endpoint into the deployed config.
const configPath = path.join(dist, "js", "runtime-config.js");
fs.mkdirSync(path.dirname(configPath), { recursive: true });
fs.writeFileSync(
    configPath,
    "// Built by FundHaven deployment; API URL is public.\n" +
    "window.BUDGETWISE_API_BASE_URL = " +
    JSON.stringify(apiUrl).replace(/</g, "\\u003c") +
    ";\n",
    "utf8"
);
console.log("FundHaven frontend built in dist/ with HTTPS API endpoint.");
