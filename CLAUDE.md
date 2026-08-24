# aiscan-cli — mirrored source

**Do not edit this repo.** This CLI (and this file) is mirrored from the private
Lovable project `Asif2BD/aisitescan`, which is the single source of truth.
Edits made here are overwritten on the next sync.

## To change the CLI

1. Edit `cli/bin/aiscan.mjs` in the Lovable project.
2. Bump `cli/package.json` `version` and the `VERSION` constant in
   `cli/bin/aiscan.mjs` — they must match.
3. `node scripts/sync-cli.mjs` (regenerates the site's `public/cli.mjs`).
4. Sync this mirror, then commit and push:
   ```bash
   ./scripts/sync-from-lovable.sh
   git add -A && git commit -m "sync vX.Y.Z" && git push
   ```

## To release

```bash
git tag vX.Y.Z && git push --tags
```

`.github/workflows/publish.yml` publishes both `aiscan-cli` and `@aiscan/cli`
via npm **OIDC trusted publishing**. No npm token exists; nothing is in GitHub
secrets. The workflow refuses to republish an existing version and smoke-tests
the CLI with a live scan first.

Full runbook: `CLAUDE.md` §9 in the Lovable project. Docs: https://aiscan.site/docs/cli
