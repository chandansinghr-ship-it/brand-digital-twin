import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import lighthouse from "lighthouse";

const CHROME = process.env.CHROME_PATH || "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";
const BASE = process.env.LH_BASE || "http://localhost:80";
const OUT = process.env.LH_OUT || ".local/lighthouse-reports";
const name = process.env.LH_ROUTE;
const path = process.env.LH_PATH;
mkdirSync(OUT, { recursive: true });

const port = 9222 + Math.floor(Math.random() * 200);
const proc = spawn(CHROME, [
  `--remote-debugging-port=${port}`,
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--no-default-browser-check",
  `--user-data-dir=/tmp/lh-${port}-${Date.now()}`,
  "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });

for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (res.ok) break;
  } catch {}
}

try {
  const result = await lighthouse(BASE + path, {
    port,
    output: ["json", "html"],
    logLevel: "error",
    onlyCategories: ["accessibility", "best-practices"],
    formFactor: "mobile",
    screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
    throttling: { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0 },
    emulatedUserAgent: "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36 Lighthouse",
  }, undefined);
  const lhr = result.lhr;
  const a11y = Math.round((lhr.categories.accessibility.score ?? 0) * 100);
  const bp = Math.round((lhr.categories["best-practices"].score ?? 0) * 100);
  writeFileSync(join(OUT, `${name}.report.json`), result.report[0]);
  writeFileSync(join(OUT, `${name}.report.html`), result.report[1]);
  const dump = (catKey) => lhr.categories[catKey].auditRefs
    .map((r) => lhr.audits[r.id])
    .filter((a) => a && a.score !== null && a.score < 1)
    .map((a) => `  - ${a.id}: ${a.title} (items=${(a.details && a.details.items) ? a.details.items.length : 0})`);
  console.log(`${name} a11y=${a11y} bp=${bp}`);
  const a11yIssues = dump("accessibility");
  if (a11yIssues.length) console.log("A11y:\n" + a11yIssues.join("\n"));
  const bpIssues = dump("best-practices");
  if (bpIssues.length) console.log("BP:\n" + bpIssues.join("\n"));
} finally {
  proc.kill("SIGKILL");
}
