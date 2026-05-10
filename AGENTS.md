# AGENTS.md — Project map for AI assistants & humans

> Map of the `brightspace-mcp` repository. Read this first if you've never touched the project.
> Standard format ([agentsmd.org](https://agentsmd.org)) — works with Claude Code, Cursor, Codex, Gemini CLI, Aider.

## What this is

MCP server that exposes a Brightspace (D2L) instance to AI assistants. Built in TypeScript, follows DDD with bounded contexts, opt-in writes, multi-strategy auth.

```
src/                       ← TypeScript sources (DDD layout)
  contexts/                ← Bounded contexts (assignments, courses, content, …)
    {ctx}/domain/          ← Pure types & repository interfaces
    {ctx}/application/     ← Use cases (orchestrate domain)
    {ctx}/infrastructure/  ← D2L API + cache adapters
  mcp/                     ← MCP tool registry & schemas
  shared-kernel/           ← Cross-cutting (config, types, audit, writes gate)
  cli/                     ← Commander entry points (serve, setup, auth, config)
build/                     ← tsc output (do not edit)
docs/                      ← Detailed documentation (see docs/README.md)
tests/                     ← Vitest mirror of src/
```

## Setup in 5 steps

1. **Install** — `npm install -g brightspace-mcp` *(or use `npx`)*
2. **Config** — pick one:
   - `brightspace-mcp setup` — wizard for typed credentials (TOTP-scriptable MFA)
   - `brightspace-mcp record-auth --save-to keychain` — opens a browser, you log in manually, cookies captured (works with ANY MFA: push notifications, FIDO2, biometric, etc.)
3. **Test auth** — `brightspace-mcp auth --test`
4. **Register** — point your MCP client at `brightspace-mcp serve` *(see [docs/clients.md](./docs/clients.md))*
5. **Use it** — *"What courses am I enrolled in?"* → invokes `list_my_courses`

→ Detailed walkthrough: [`docs/setup-guide.md`](./docs/setup-guide.md)

## Where to look for…

| If you want to… | Read |
|---|---|
| Set up for the first time | [`docs/setup-guide.md`](./docs/setup-guide.md) |
| Pick an auth strategy | [`docs/auth-strategies.md`](./docs/auth-strategies.md) |
| Configure for Microsoft Azure AD / SAML SSO | [`docs/presets.md`](./docs/presets.md) |
| Enable submit/post operations | [`docs/writes.md`](./docs/writes.md) |
| Find what each MCP tool does | [`docs/tools.md`](./docs/tools.md) |
| Fix a stuck setup | [`docs/troubleshooting.md`](./docs/troubleshooting.md) |
| Understand the codebase | [`docs/architecture.md`](./docs/architecture.md) |
| Register with Claude Desktop / Cursor / Windsurf | [`docs/clients.md`](./docs/clients.md) |
| See what changed across versions | [`CHANGELOG.md`](./CHANGELOG.md) |

## Common gotchas (read before opening an issue)

- **`version discovery failed`** at startup → `base_url` still has the placeholder `school.brightspace.com`. Edit `~/.brightspace-mcp/config.yaml`.
- **Auth times out at `d2l-navigation`** → your tenant uses Microsoft AAD push notification. You need `pre_mfa_clicks: ['#signInAnotherWay', "[data-value='PhoneAppOTP']"]`. See [`docs/presets.md`](./docs/presets.md#microsoft-azure-ad-with-authenticator-app).
- **Auth times out *after* TOTP** → "Stay signed in?" dialog blocking. Add `post_mfa_clicks: ['#idSIButton9']`.
- **Write tools missing from MCP server** → writes need *both* `writes.enabled: true` in YAML *and* the `--enable-writes` CLI flag. See [`docs/writes.md`](./docs/writes.md).
- **TOTP rejected** as too short → fixed in v0.15+. Native RFC 6238 implementation accepts any base32 secret length.
- **MFA cannot be scripted** (FIDO2, biometric, Authenticator push number-match) → use `brightspace-mcp record-auth` (opens browser, you log in, cookies captured). Cookies last ~1h; rerun when they expire.
- **`submit_assignment` returns 403/404** → tenant restricted the Valence student-write API. The MCP automatically falls back to a Playwright UI flow that scripts the actual web submit form. Localized button labels are configurable per-tenant in `profile.ui_submit.selectors`.

## For AI assistants working on this codebase

- **DDD layering is enforced** by `dependency-cruiser`. Domain cannot import infrastructure. Run `npm run check:deps` to verify.
- **Add a new MCP tool** by creating: domain method (if needed) → application use case → infrastructure adapter → tool handler in `src/mcp/tools/` → register in `src/mcp/registry.ts` → schema in `src/mcp/schemas.ts`. See `submit-assignment` for a writes-gated example.
- **Tests live in `tests/`** mirroring `src/`. Coverage threshold is 85% statements (see `vitest.config.ts`).
- **Never commit secrets**. `~/.brightspace-mcp/config.yaml` lives outside the repo; the wizard writes it with mode 0600.
- **Run before pushing**: `npm run check` (lint + typecheck + tests + depcruise).
- **Releases**: `npm version <patch|minor|major>` → CHANGELOG entry → push tag → CI builds Docker image.

## License & contribution

MIT. PRs welcome on [GitHub](https://github.com/JhostinAleck/brightspace-mcp).
