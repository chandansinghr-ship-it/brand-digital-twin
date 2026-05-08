import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import lighthouse from "lighthouse";

const CHROME = process.env.CHROME_PATH || "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";
const BASE = process.env.LH_BASE || "http://localhost:80";
const OUT = process.env.LH_OUT || ".local/lighthouse-reports";

const ROUTES = [
  ["home", "/"],
  ["menu", "/menu"],
  ["dish", "/dish/activated-charcoal-smoothie"],
  ["cart", "/cart"],
  ["account", "/account"],
];

mkdirSync(OUT, { recursive: true });

function pickPort() {
  return 9222 + Math.floor(Math.random() * 200);
}

async function launchChrome() {
  const port = pickPort();
  const args = [
    `--remote-debugging-port=${port}`,
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=/tmp/lh-${port}-${Date.now()}`,
    "about:blank",
  ];
  const proc = spawn(CHROME, args, { stdio: ["ignore", "pipe", "pipe"] });
  // Wait for devtools
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return { proc, port };
    } catch {}
  }
  proc.kill("SIGKILL");
  throw new Error("Chrome did not start");
}

async function audit(name, path) {
  const url = BASE + path;
  const { proc, port } = await launchChrome();
  try {
    const result = await lighthouse(
      url,
      {
        port,
        output: ["json", "html"],
        logLevel: "error",
        onlyCategories: ["accessibility", "best-practices"],
        formFactor: "mobile",
        screenEmulation: {
          mobile: true,
          width: 412,
          height: 823,
          deviceScaleFactor: 1.75,
          disabled: false,
        },
        throttling: {
          rttMs: 150,
          throughputKbps: 1638.4,
          cpuSlowdownMultiplier: 4,
          requestLatencyMs: 0,
          downloadThroughputKbps: 0,
          uploadThroughputKbps: 0,
        },
        emulatedUserAgent:
          "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36 Lighthouse",
      },
      undefined
    );
    const lhr = result.lhr;
    const a11y = Math.round((lhr.categories.accessibility.score ?? 0) * 100);
    const bp = Math.round((lhr.categories["best-practices"].score ?? 0) * 100);
    writeFileSync(join(OUT, `${name}.report.json`), result.report[0]);
    writeFileSync(join(OUT, `${name}.report.html`), result.report[1]);

    const a11yAudits = lhr.categories.accessibility.auditRefs
      .map((ref) => lhr.audits[ref.id])
      .filter((a) => a && a.score !== null && a.score < 1)
      .map((a) => ({
        id: a.id,
        title: a.title,
        score: a.score,
        items: (a.details && a.details.items) ? a.details.items.length : 0,
      }));

    const bpAudits = lhr.categories["best-practices"].auditRefs
      .map((ref) => lhr.audits[ref.id])
      .filter((a) => a && a.score !== null && a.score < 1)
      .map((a) => ({
        id: a.id,
        title: a.title,
        score: a.score,
      }));

    return { name, path, url, a11y, bp, a11yAudits, bpAudits };
  } finally {
    proc.kill("SIGKILL");
  }
}

const summary = [];
for (const [name, p] of ROUTES) {
  process.stdout.write(`\n>> ${name} ${p}\n`);
  try {
    const r = await audit(name, p);
    summary.push(r);
    console.log(`   a11y=${r.a11y}  best-practices=${r.bp}`);
    if (r.a11yAudits.length) {
      console.log("   A11y issues:");
      for (const a of r.a11yAudits) console.log(`     - ${a.id}: ${a.title} (items=${a.items})`);
    }
    if (r.bpAudits.length) {
      console.log("   BP issues:");
      for (const a of r.bpAudits) console.log(`     - ${a.id}: ${a.title}`);
    }
  } catch (e) {
    console.error(`   FAILED: ${e.message}`);
    summary.push({ name, path: p, error: e.message });
  }
}

writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log("\n=== SUMMARY ===");
for (const r of summary) {
  if (r.error) console.log(`${r.name.padEnd(8)} ERROR ${r.error}`);
  else console.log(`${r.name.padEnd(8)} a11y=${r.a11y}  bp=${r.bp}`);
}
const minA11y = Math.min(...summary.filter((r) => !r.error).map((r) => r.a11y));
console.log(`min a11y = ${minA11y}`);
process.exit(minA11y >= 95 ? 0 : 1);
