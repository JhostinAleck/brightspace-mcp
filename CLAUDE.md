# CLAUDE.md — brightspace-mcp

> Project map and release process for AI assistants working on this repo.
> Read AGENTS.md for the architecture overview. This file focuses on operational workflows.

## Release checklist (MUST follow before every tag push)

### 1. Verify CI is green on `main`

```bash
gh run list --repo JhostinAleck/brightspace-mcp --branch main --limit 3 --json name,status,conclusion
```

All runs must show `"conclusion": "success"`. **Never push a tag if CI is red.**

### 2. Run local checks

```bash
npm run check   # lint + typecheck + tests + depcruise
```

Expected: lint 0 errors, typecheck 0 errors, all tests pass, depcruise 0 violations.

### 3. Update CHANGELOG.md

Add a new `## [X.Y.Z] - YYYY-MM-DD` section at the top (after `## [Unreleased]`).
Follow the established format: BREAKING, Added, Changed, Fixed, Removed.

### 4. Update docs/index.md (VitePress landing page)

Update the **Status table** with current values:

```markdown
| Latest version | [vX.Y.Z](https://github.com/JhostinAleck/brightspace-mcp/releases/tag/vX.Y.Z) |
| Tests          | N/N passing |
| Coverage       | X% lines / Y% functions |
```

Get accurate numbers:
```bash
node -p "require('./package.json').version"                    # version
npx vitest run 2>&1 | grep "Tests "                           # test count
npx vitest run --coverage 2>&1 | grep "Lines\|Functions"      # coverage
```

Also update the tagline and feature cards if new capabilities were added.

### 5. Update docs/.vitepress/config.ts

Change the version badge in the top nav:
```ts
{ text: 'vX.Y.Z', items: [...] }
```

### 6. Update AGENTS.md if architecture changed

If new bounded contexts, new commands, new modules, or new patterns were added — update AGENTS.md so future AI assistants have accurate context.

### 7. Bump version

```bash
npm version patch|minor|major --no-git-tag-version
```

- **patch** — bug fixes, performance, deps
- **minor** — new features, additive changes (see STABILITY.md)
- **major** — breaking changes to public API (see STABILITY.md)

### 8. Commit and push

```bash
git add CHANGELOG.md docs/index.md docs/.vitepress/config.ts AGENTS.md package.json package-lock.json
git commit -m "chore: release vX.Y.Z"
git push origin main
```

Wait for CI to pass on this commit before tagging.

### 9. Verify CI passes on the release commit

```bash
gh run watch $(gh run list --repo JhostinAleck/brightspace-mcp --branch main --limit 1 --json databaseId --jq '.[0].databaseId') --repo JhostinAleck/brightspace-mcp
```

**Only proceed to step 10 when CI is green.**

### 10. Push tag (triggers npm publish + GitHub Release + Docker)

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

CI workflows triggered:
- `release-npm.yml` — publishes to npm with provenance
- `release-github.yml` — creates GitHub Release with SBOM
- `release-docker.yml` — builds and pushes Docker image

### 11. Register with MCP registry (after npm publishes)

```bash
mcp-publisher publish
```

Requires `mcp-publisher` CLI installed and authenticated:
```bash
mcp-publisher login github
```

The `server.json` and `mcpName` in `package.json` are already configured.

---

## Consistency checklist (every release)

Before tagging, verify these are all consistent:

- [ ] `package.json` version matches the tag you're about to push
- [ ] `CHANGELOG.md` has an entry for this version with today's date
- [ ] `docs/index.md` Status table shows the new version, test count, and coverage
- [ ] `docs/.vitepress/config.ts` nav shows the new version
- [ ] `server.json` `"version"` field matches `package.json` version
- [ ] All test snapshots are up to date (`npx vitest run --update` if any are stale)
- [ ] No `Intl`-dependent snapshot tests (use `toContain` instead — they break cross-platform)
- [ ] No hardcoded version strings in docs (should reference `package.json` dynamically or be updated here)

---

## Common pitfalls

**Snapshot tests that fail in CI but pass locally**
Dates formatted by `Intl.DateTimeFormat` vary between macOS ICU and Ubuntu ICU. Do NOT use `toMatchSnapshot()` for output that contains Intl-formatted dates. Use `toContain()` with the non-date parts instead.

**Obsolete snapshots**
When a test changes from `toMatchSnapshot()` to `toContain()`, the old snapshot becomes obsolete and CI fails with `Obsolete snapshots found`. Fix:
```bash
npx vitest run tests/path/to/test.ts --update
git add tests/.../__snapshots__/
git commit -m "fix(tests): remove obsolete snapshots"
```

**npm publish requires NPM_TOKEN**
The `NPM_TOKEN` GitHub secret must be set in repo Settings → Secrets → Actions. Generate at npmjs.com → Access Tokens → Automation token.

**Push to remote requires JhostinAleck account**
If GitHub auth is set to another account:
```bash
gh auth switch   # switch to JhostinAleck
git push origin main
```

---

## .gitignore additions

The following should be in `.gitignore` (or are already):

```
.claude/         # local Claude Code session files (already gitignored by repo default)
.superpowers/    # brainstorming/visual companion session files
```
