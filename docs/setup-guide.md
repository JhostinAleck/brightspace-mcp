# Setup guide

Step-by-step setup for `brightspace-mcp`. If your school uses Microsoft Azure AD or Google Workspace SSO, also read [presets.md](./presets.md).

## Step 1 — Install

```bash
npm install -g brightspace-mcp     # global
# or
npx brightspace-mcp setup          # one-shot, no install
```

Requires Node ≥ 20.

## Step 2 — Find your Brightspace base URL

Open Brightspace in a browser. The URL bar shows something like:
- `https://learn.example.edu/d2l/home/...` → base URL is `https://learn.example.edu`
- `https://learn.school.edu/d2l/home/...` → base URL is `https://learn.school.edu`

⚠️ **Do not** leave `https://school.brightspace.com` as the default — it's a placeholder. The server will fail at startup with `version discovery failed` if it's wrong.

## Step 3 — Choose your auth strategy

Three setup paths:

### A. Interactive wizard (typed credentials)

```bash
brightspace-mcp setup
```

Asks 5 questions and writes `~/.brightspace-mcp/config.yaml` with mode 0600.

### B. Recorder (you log in manually, we steal the cookie)

```bash
brightspace-mcp record-auth --save-to keychain
```

Opens a real browser. You log in however your tenant requires — TOTP, push notification, biometric, Yubikey, anything. As soon as you reach `/d2l/home`, the recorder captures your session cookies and writes them into the config under the `session_cookie` strategy.

This is the **only viable path** for tenants with auth flows that cannot be scripted (Microsoft Authenticator number-matching, FIDO2/Yubikey, fingerprint, etc.). Cookie expires in ~1 hour — re-run when auth fails.

### C. Manual YAML

If you know what you need, edit the YAML directly. See [auth-strategies.md](./auth-strategies.md).

**TL;DR for picking a strategy**:
- Admin gave you a Valence API token → `api_token`
- Email/password + TOTP authenticator (scriptable MFA) → `browser`
- Email/password, no MFA, server-rendered form → `headless`
- Tenant has OAuth client registration → `oauth`
- Anything else (biometric, push, USB key, complex SSO) → use **option B (`record-auth`)**

## Step 4 — Verify auth works

```bash
brightspace-mcp auth --test
```

Expected output:
```
✓ Authenticated as Jane Doe
✓ D2L API versions discovered: lp=1.59, le=1.93
✓ Session expires in 60 min
```

If this fails, see [troubleshooting.md](./troubleshooting.md).

## Step 5 — Wire it into your MCP client

See [clients.md](./clients.md) for Claude Desktop, Cursor, Windsurf, and Claude Code.

Quick test from any client:

> *"List my Brightspace courses."*

Should invoke `list_my_courses` and return your enrollments.

## Configuration file location

| OS | Path |
|---|---|
| macOS / Linux | `~/.brightspace-mcp/config.yaml` |
| Windows | `%USERPROFILE%\.brightspace-mcp\config.yaml` |

Override with `BRIGHTSPACE_CONFIG=/path/to/config.yaml` or `--config /path/...`.

## Multiple profiles

You can keep multiple Brightspace tenants in one file:

```yaml
default_profile: undergrad

profiles:
  undergrad:
    base_url: https://learn.school.edu
    auth: { ... }
  research:
    base_url: https://researchportal.school.edu
    auth: { ... }
```

Switch the default with `brightspace-mcp profile use <name>` (persisted in YAML), or per-invocation with `BRIGHTSPACE_PROFILE=research brightspace-mcp serve`.

List defined profiles with `brightspace-mcp profile list` (or just `brightspace-mcp profile`).

## What the wizard skips that you may need

The setup wizard covers 80% of cases. For the remaining 20%, edit the YAML manually:

- **Custom Microsoft AAD selectors** → see [presets.md](./presets.md#microsoft-azure-ad-with-authenticator-app)
- **Redis-backed session cache** → set `session.cache_backend: redis` and `redis.url`
- **Write operations** → set `writes.enabled: true` *and* pass `--enable-writes` to `serve`. See [writes.md](./writes.md).
- **Fallback auth chains** → `auth.fallbacks: [api_token, browser]` to try multiple strategies in order

## Common setup checkpoints

The fastest way to verify everything: run **`brightspace-mcp doctor`**.

```
$ brightspace-mcp doctor
✓ Config file (/Users/you/.brightspace-mcp/config.yaml)
✓ Config validates (1 profile(s))
✓ Profile resolves (myschool → https://learn.school.edu)
✓ D2L API versions discovered (lp=1.59, le=1.93)
✓ Authentication (Jane Doe, source: browser)
✓ list_my_courses smoke read (12 course(s) enrolled)
✓ Writes gate (enabled)

All checks passed.
```

A red `✗` includes the next-action hint. Manually:

✅ `brightspace-mcp config show` prints config (secrets redacted) without errors.
✅ `brightspace-mcp config validate` exits 0.
✅ `brightspace-mcp auth --test` shows your name and API versions.
✅ `npx brightspace-mcp serve` starts and prints `Discovered D2L API versions ...` to stderr.

If `doctor` is green, you're done. Move on to [clients.md](./clients.md).
