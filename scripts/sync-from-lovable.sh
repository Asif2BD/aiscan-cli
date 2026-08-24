#!/usr/bin/env bash
# Sync the CLI from the Lovable project (source of truth) into this public repo.
#
#   Lovable  ->  Asif2BD/aisitescan (private)  ->  cli/  ->  this repo
#
# Lovable is where the CLI is actually edited; this repo is what npm points at.
# Without this, the two silently drift and npm ships stale code with no error.
#
# Requires: SSH access to both repos (no tokens).
# Usage:  ./scripts/sync-from-lovable.sh [--check]
#           --check  report drift and exit 1, change nothing (for CI/cron)

set -euo pipefail

UPSTREAM="git@github.com:Asif2BD/aisitescan.git"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Fetching CLI from the Lovable project..."
git clone --depth 1 --quiet --filter=blob:none --sparse "$UPSTREAM" "$TMP/up"
git -C "$TMP/up" sparse-checkout set cli >/dev/null

SRC="$TMP/up/cli"
[ -f "$SRC/bin/aiscan.mjs" ] || { echo "error: cli/bin/aiscan.mjs not found upstream"; exit 1; }

# Upstream package.json is the aiscan-cli manifest, but THIS repo owns the
# repository/bugs fields (they point here). Only the CLI source and README sync.
DRIFT=0
for F in bin/aiscan.mjs README.md; do
  if ! diff -q "$SRC/$F" "$HERE/$F" >/dev/null 2>&1; then
    echo "  drift: $F"
    DRIFT=1
    [ "$CHECK" -eq 0 ] && cp "$SRC/$F" "$HERE/$F"
  fi
done

UPVER="$(node -p "require('$SRC/package.json').version")"
HEREVER="$(node -p "require('$HERE/package.json').version")"
if [ "$UPVER" != "$HEREVER" ]; then
  echo "  version: upstream $UPVER vs here $HEREVER"
  DRIFT=1
  if [ "$CHECK" -eq 0 ]; then
    node -e "
      const fs=require('fs'),p='$HERE/package.json';
      const j=JSON.parse(fs.readFileSync(p,'utf8'));
      j.version='$UPVER';
      fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
    "
  fi
fi

if [ "$DRIFT" -eq 0 ]; then echo "In sync — nothing to do."; exit 0; fi
if [ "$CHECK" -eq 1 ]; then echo "OUT OF SYNC (run without --check to fix)"; exit 1; fi

# The VERSION constant in the CLI must match package.json, or the publish
# workflow and Lovable's own sync-cli.mjs will both reject it.
CV="$(grep -m1 '^const VERSION' "$HERE/bin/aiscan.mjs" | sed 's/.*"\(.*\)".*/\1/')"
PV="$(node -p "require('$HERE/package.json').version")"
[ "$CV" = "$PV" ] || { echo "error: VERSION $CV != package.json $PV — fix upstream in Lovable"; exit 1; }

echo "Synced. Review, then: git add -A && git commit && git push"
git -C "$HERE" --no-pager diff --stat
