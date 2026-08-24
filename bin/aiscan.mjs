#!/usr/bin/env node
/**
 * AIScan CLI — grade any website for AI-agent readiness from your terminal.
 *
 * Zero dependencies. Works with `npx aiscan-cli <url>` or piped straight from
 * https://aiscan.site/cli.mjs. Talks to the stable public v1 API.
 *
 * Docs: https://aiscan.site/docs/cli
 */

// Keep in sync with cli/package.json — scripts/sync-cli.mjs fails the build on drift.
const VERSION = "1.0.1";

// Fail fast (and readably) on Node < 18 — we rely on global fetch.
{
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18 || typeof fetch !== "function") {
    console.error(
      [
        `aiscan requires Node 18+ (you are on ${process.versions.node}).`,
        "",
        "Options that work today:",
        "  1. Upgrade Node: https://nodejs.org",
        "  2. Use a version manager: nvm install 18 && nvm use 18",
        "  3. Scan in the browser, nothing to install: https://aiscan.site",
        "  4. Use the REST API (no Node needed):",
        "     curl 'https://aiscan.site/api/public/v1/scan?url=https://example.com'",
      ].join("\n"),
    );
    process.exit(2);
  }
}

const API_BASE = process.env.AISCAN_API_BASE || "https://aiscan.site";

// ---------------------------------------------------------------- colors ---
const noColorEnv =
  process.env.NO_COLOR !== undefined || process.env.TERM === "dumb" || !process.stdout.isTTY;
let useColor = !noColorEnv;
const c = (code) => (s) => (useColor ? `\u001b[${code}m${s}\u001b[0m` : String(s));
const bold = c("1");
const dim = c("2");
const red = c("31");
const green = c("32");
const yellow = c("33");
const blue = c("36");
const magenta = c("35");
const gray = c("90");

// ------------------------------------------------------------------ args ---
function parseArgs(argv) {
  const opts = {
    urls: [],
    json: false,
    md: false,
    fresh: false,
    scope: "site",
    isPublic: null,
    key: process.env.AISCAN_API_KEY || null,
    minScore: null,
    failOn: null, // "essential" | "any"
    fix: false,
    quiet: false,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "-h":
      case "--help":
        opts.help = true;
        break;
      case "-v":
      case "--version":
        opts.version = true;
        break;
      case "--json":
        opts.json = true;
        break;
      case "--md":
      case "--markdown":
        opts.md = true;
        break;
      case "--fresh":
      case "--no-cache":
        opts.fresh = true;
        break;
      case "--page":
        opts.scope = "page";
        break;
      case "--private":
        opts.isPublic = false;
        break;
      case "--public":
        opts.isPublic = true;
        break;
      case "--fix":
        opts.fix = true;
        break;
      case "--quiet":
      case "-q":
        opts.quiet = true;
        break;
      case "--no-color":
        useColor = false;
        break;
      case "--key":
        opts.key = next();
        break;
      case "--min-score":
        opts.minScore = Number(next());
        break;
      case "--fail-on":
        opts.failOn = next();
        break;
      default:
        if (a.startsWith("--key=")) opts.key = a.slice(6);
        else if (a.startsWith("--min-score=")) opts.minScore = Number(a.slice(12));
        else if (a.startsWith("--fail-on=")) opts.failOn = a.slice(10);
        else if (a.startsWith("-")) {
          console.error(red(`Unknown flag: ${a}`));
          process.exit(2);
        } else opts.urls.push(a);
    }
  }
  return opts;
}

function normalizeUrl(input) {
  let u = String(input).trim();
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    return new URL(u).toString();
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ help ---
const HELP = `
${bold("aiscan")} ${dim("v" + VERSION)} — is your site agent-ready?

${bold("USAGE")}
  npx aiscan-cli <url> [more urls...] [options]

${bold("OPTIONS")}
  --page                 Grade one specific URL instead of the whole site ${magenta("(Pro)")}
  --fresh                Bypass the 5-minute result cache
  --json                 Print the raw JSON report (pipe into jq)
  --md                   Print a Markdown report (great for PR comments)
  --fix                  Print a copy-paste prompt for Claude Code / Cursor
  --key <key>            API key (or set ${dim("AISCAN_API_KEY")})
  --private              Keep the saved report private ${magenta("(registered users)")}
  --public               Force the saved report public
  --min-score <n>        Exit 1 if the score is below n ${dim("(CI gate)")}
  --fail-on <essential|any>
                         Exit 1 if essential (or any) checks fail
  -q, --quiet            Only print the score line
  --no-color             Disable ANSI colors
  -h, --help             Show this help
  -v, --version          Show the CLI version

${bold("EXAMPLES")}
  npx aiscan-cli example.com
  npx aiscan-cli example.com --fresh --fix
  npx aiscan-cli example.com/blog/post --page --key $AISCAN_API_KEY
  npx aiscan-cli example.com --json | jq '.checks[] | select(.status=="fail")'
  npx aiscan-cli example.com --min-score 80        ${dim("# fails CI below 80")}

${bold("EXIT CODES")}
  0 pass · 1 gate failed · 2 bad usage · 3 network/API error

${bold("PLANS")}
  Anonymous   5 scans/min per IP, public reports
  Free acct   API key, private reports, history, monitoring
  Pro         --page scans, higher limits, scheduled monitoring + alerts
  ${dim("Sign up free: https://aiscan.site/auth · Docs: https://aiscan.site/docs/cli")}
`;

// ------------------------------------------------------------------- api ---
async function scan(url, opts) {
  const endpoint = new URL(`${API_BASE}/api/public/v1/scan`);
  const headers = { "content-type": "application/json", accept: "application/json" };
  if (opts.key) headers.authorization = `Bearer ${opts.key}`;
  const body = { url, fresh: opts.fresh, scope: opts.scope };
  if (typeof opts.isPublic === "boolean") body.isPublic = opts.isPublic;

  let res;
  try {
    res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (e) {
    throw Object.assign(new Error(`Network error: ${e.message}`), { code: 3 });
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw Object.assign(new Error(`Unexpected response (HTTP ${res.status})`), { code: 3 });
  }
  if (!res.ok) {
    const detail = json.detail || json.error || json.title || `HTTP ${res.status}`;
    throw Object.assign(new Error(detail), { code: res.status === 403 ? 1 : 3, status: res.status });
  }
  return json;
}

// --------------------------------------------------------------- render ---
const DIM_LABELS = {
  discoverability: "Discoverability",
  content: "Content",
  bot_access: "Bot Access",
  capabilities: "Capabilities",
  commerce: "Commerce",
};

function grade(score) {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function scoreColor(score) {
  if (score >= 90) return green;
  if (score >= 75) return blue;
  if (score >= 60) return yellow;
  return red;
}

function bar(pct, width = 24) {
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width);
  return "█".repeat(filled) + gray("░".repeat(width - filled));
}

function statusIcon(status) {
  if (status === "pass") return green("✔");
  if (status === "partial") return yellow("◐");
  if (status === "fail") return red("✘");
  return gray("–");
}

function tierLabel(t) {
  if (t === "essential") return red("essential");
  if (t === "bonus") return gray("bonus");
  return yellow("recommended");
}

function renderHuman(r, opts) {
  const out = [];
  const score = Math.round(r.overallScore ?? 0);
  const col = scoreColor(score);
  const g = grade(score);

  out.push("");
  out.push(`  ${bold(r.url)}`);
  const meta = [
    `${r.scope === "page" ? "page scan" : "site scan"}`,
    r.platform?.platform && r.platform.platform !== "unknown" ? r.platform.platform : null,
    r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : null,
    r.cached ? "cached" : null,
  ].filter(Boolean);
  out.push(`  ${gray(meta.join(" · "))}`);
  out.push("");
  out.push(`  ${col(bar(score))}  ${bold(col(`${score}/100`))} ${col(g)}  ${gray(`Level ${r.level} · ${r.levelName}`)}`);
  out.push("");

  if (opts.quiet) return out.join("\n") + "\n";

  // Dimensions
  for (const [key, label] of Object.entries(DIM_LABELS)) {
    const d = r.dimensions?.[key];
    if (!d) continue;
    if (d.applicable === false) {
      out.push(`  ${gray(label.padEnd(16))} ${gray("not applicable")}`);
      continue;
    }
    const pct = Math.round(d.score ?? 0);
    out.push(`  ${label.padEnd(16)} ${scoreColor(pct)(bar(pct, 16))} ${String(pct).padStart(3)}%`);
  }
  out.push("");

  const checks = Array.isArray(r.checks) ? r.checks : [];
  const failing = checks.filter((x) => x.status === "fail" || x.status === "partial");
  const passing = checks.filter((x) => x.status === "pass");

  out.push(
    `  ${green(`${passing.length} passing`)} ${gray("·")} ${red(`${failing.filter((f) => f.status === "fail").length} failing`)} ${gray("·")} ${yellow(`${failing.filter((f) => f.status === "partial").length} partial`)}`,
  );
  out.push("");

  if (failing.length) {
    out.push(`  ${bold("What to fix")}`);
    const order = { essential: 0, recommended: 1, bonus: 2 };
    failing
      .slice()
      .sort((a, b) => (order[a.tier] ?? 1) - (order[b.tier] ?? 1))
      .forEach((x) => {
        out.push(`  ${statusIcon(x.status)} ${bold(x.id)} ${x.label ?? x.name ?? ""} ${gray("[")}${tierLabel(x.tier)}${gray("]")}`);
        if (x.evidence) out.push(`      ${gray("found: " + x.evidence)}`);
        if (x.remediation) out.push(`      ${dim("fix:   " + String(x.remediation).replace(/\s+/g, " ").slice(0, 160))}`);
      });
    out.push("");
  } else {
    out.push(`  ${green("No failing checks. Your site is agent-ready.")}`);
    out.push("");
  }

  if (r.shareUrl) out.push(`  ${gray("Full report:")} ${blue(r.shareUrl)}`);
  out.push(`  ${gray("Fix guides:")}  ${blue("https://aiscan.site/docs/checks")}`);

  if (!opts.key) {
    out.push("");
    out.push(`  ${magenta("↑")} ${bold("Create a free account")} for private reports, scan history,`);
    out.push(`    monitoring and an API key: ${blue("https://aiscan.site/auth")}`);
  }
  if (!opts.key || opts.scope !== "page") {
    out.push(`  ${gray("Pro adds per-page scans (--page), alerts and higher limits.")}`);
  }
  out.push("");
  return out.join("\n") + "\n";
}

function renderMarkdown(r) {
  const score = Math.round(r.overallScore ?? 0);
  const checks = Array.isArray(r.checks) ? r.checks : [];
  const lines = [];
  lines.push(`## AIScan — ${r.url}`);
  lines.push("");
  lines.push(`**${score}/100 (${grade(score)})** · Level ${r.level} — ${r.levelName}${r.scope === "page" ? " · page scan" : ""}`);
  lines.push("");
  lines.push("| Dimension | Score |");
  lines.push("| --- | --- |");
  for (const [key, label] of Object.entries(DIM_LABELS)) {
    const d = r.dimensions?.[key];
    if (!d) continue;
    lines.push(`| ${label} | ${d.applicable === false ? "n/a" : `${Math.round(d.score)}%`} |`);
  }
  lines.push("");
  const failing = checks.filter((x) => x.status === "fail" || x.status === "partial");
  if (failing.length) {
    lines.push("### Failing checks");
    lines.push("");
    lines.push("| Check | Tier | Status | Evidence | Fix |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const x of failing) {
      lines.push(
        `| \`${x.id}\` ${x.label ?? ""} | ${x.tier ?? "recommended"} | ${x.status} | ${String(x.evidence ?? "").replace(/\|/g, "/")} | ${String(x.remediation ?? "").replace(/\|/g, "/").replace(/\s+/g, " ").slice(0, 180)} |`,
      );
    }
  } else {
    lines.push("All checks pass.");
  }
  lines.push("");
  if (r.shareUrl) lines.push(`[Full report](${r.shareUrl}) · [Docs](https://aiscan.site/docs)`);
  return lines.join("\n") + "\n";
}

function renderFixPrompt(r) {
  const checks = (Array.isArray(r.checks) ? r.checks : []).filter(
    (x) => x.status === "fail" || x.status === "partial",
  );
  const lines = [];
  lines.push("----- copy everything below into Claude Code / Cursor -----");
  lines.push("");
  lines.push(
    `My site ${r.url} scores ${Math.round(r.overallScore)}/100 on AIScan (AI-agent readiness). Detected platform: ${r.platform?.platform ?? "unknown"}.`,
  );
  lines.push("Fix the following issues in this repository. Use the platform conventions for where files live.");
  lines.push("");
  for (const x of checks) {
    lines.push(`- [${x.tier ?? "recommended"}] ${x.id} — ${x.label ?? ""}`);
    if (x.evidence) lines.push(`  observed: ${x.evidence}`);
    if (x.remediation) lines.push(`  required: ${String(x.remediation).replace(/\s+/g, " ")}`);
  }
  lines.push("");
  lines.push(
    "After the changes are deployed, re-verify with: curl 'https://aiscan.site/api/public/v1/scan?url=" +
      encodeURIComponent(r.url) +
      "&fresh=1'",
  );
  lines.push("");
  lines.push("----- end -----");
  return lines.join("\n") + "\n";
}

// ------------------------------------------------------------------ main ---
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.version) {
    console.log(VERSION);
    return 0;
  }
  if (opts.help || opts.urls.length === 0) {
    console.log(HELP);
    return opts.urls.length === 0 && !opts.help ? 2 : 0;
  }

  let worst = 100;
  let anyEssentialFail = false;
  let anyFail = false;
  const results = [];

  for (const raw of opts.urls) {
    const url = normalizeUrl(raw);
    if (!url) {
      console.error(red(`Not a valid URL: ${raw}`));
      return 2;
    }
    if (!opts.json && !opts.quiet) process.stderr.write(gray(`  scanning ${url} …\r`));
    let r;
    try {
      r = await scan(url, opts);
    } catch (e) {
      process.stderr.write(" ".repeat(60) + "\r");
      console.error(red(`✘ ${url}: ${e.message}`));
      if (e.status === 403) {
        console.error(gray("  Per-page scans are Pro-only — upgrade at https://aiscan.site/profile"));
      }
      return e.code ?? 3;
    }
    process.stderr.write(" ".repeat(60) + "\r");
    results.push(r);

    worst = Math.min(worst, Math.round(r.overallScore ?? 0));
    for (const x of r.checks ?? []) {
      if (x.status === "fail") {
        anyFail = true;
        if (x.tier === "essential") anyEssentialFail = true;
      }
    }

    if (opts.json) {
      console.log(JSON.stringify(r, null, 2));
    } else if (opts.md) {
      process.stdout.write(renderMarkdown(r));
    } else {
      process.stdout.write(renderHuman(r, opts));
      if (opts.fix) process.stdout.write("\n" + renderFixPrompt(r));
    }
  }

  if (typeof opts.minScore === "number" && !Number.isNaN(opts.minScore) && worst < opts.minScore) {
    console.error(red(`✘ Score ${worst} is below the --min-score threshold of ${opts.minScore}.`));
    return 1;
  }
  if (opts.failOn === "essential" && anyEssentialFail) {
    console.error(red("✘ Essential checks are failing."));
    return 1;
  }
  if (opts.failOn === "any" && anyFail) {
    console.error(red("✘ One or more checks are failing."));
    return 1;
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(red(e?.message ?? String(e)));
    process.exit(3);
  });
