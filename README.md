# aiscan

Grade any website for **AI-agent readiness** from your terminal — the same engine behind [aiscan.site](https://aiscan.site).

```bash
npx aiscan-cli example.com      # or: npx @aiscan/cli example.com
```

No install, no dependencies, Node 18+. Prefer no npm at all? `curl -fsSL https://aiscan.site/cli.mjs | node - example.com`.

On Node < 18 the CLI cannot run: upgrade Node (<https://nodejs.org>, or `nvm install 18 && nvm use 18`), scan in the browser at <https://aiscan.site>, or use the REST API.

## What it checks

16+ evidence-backed checks across five dimensions — Discoverability, Content, Bot Access, Capabilities, Commerce — each mapped to a published standard (RFC 9309 robots.txt, sitemaps.org, llms.txt, RFC 9727 api-catalog, MCP server cards, Agent Skills, OAuth discovery, RFC 9457 problem details, Content Signals). Every result carries the evidence we observed (status codes, headers, byte counts) and a tier: **essential**, **recommended** or **bonus**.

## Usage

```
npx aiscan-cli <url> [more urls...] [options]

  --page                 Grade one specific URL instead of the whole site (Pro)
  --fresh                Bypass the 5-minute result cache
  --json                 Raw JSON report (pipe into jq)
  --md                   Markdown report (great for PR comments)
  --fix                  Print a copy-paste prompt for Claude Code / Cursor
  --key <key>            API key (or set AISCAN_API_KEY)
  --private / --public   Visibility of the saved report
  --min-score <n>        Exit 1 below n (CI gate)
  --fail-on essential|any
  -q, --quiet            Score line only
  --no-color, -h, -v
```

Exit codes: `0` pass · `1` gate failed · `2` bad usage · `3` network/API error.

## CI example

```yaml
# .github/workflows/agent-readiness.yml
name: Agent readiness
on: [push]
jobs:
  aiscan:
    runs-on: ubuntu-latest
    steps:
      - run: npx aiscan-cli https://example.com --min-score 85 --fail-on essential --md >> $GITHUB_STEP_SUMMARY
        env:
          AISCAN_API_KEY: ${{ secrets.AISCAN_API_KEY }}
```

## Fix loop with an AI agent

```bash
npx aiscan-cli example.com --fix | pbcopy   # paste into Claude Code or Cursor
```

## Plans

| | Anonymous | Free account | Pro |
| --- | --- | --- | --- |
| Site scans | 5/min per IP | API key, no IP limit | higher limits |
| Report visibility | public | private by default | private by default |
| Scan history | – | yes | yes |
| `--page` scans | – | – | yes |
| Monitoring + email alerts | – | manual re-scan | scheduled |

Create a free account at <https://aiscan.site/auth>, then generate an API key at <https://aiscan.site/profile#api-keys>.

## Also available

REST API (`/api/public/v1/scan`, OpenAPI 3.1 at `/openapi.json`), MCP server (`/api/mcp`), Chrome extension, Telegram bot, Claude Code skill.

Docs: <https://aiscan.site/docs/cli>
