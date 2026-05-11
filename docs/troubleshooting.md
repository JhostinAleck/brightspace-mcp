# Troubleshooting

Common errors and how to fix them. If your problem isn't here, open an issue with the output of `brightspace-mcp config show` (secrets are auto-redacted) and `brightspace-mcp auth --test`.

## `Failed to start server: version discovery failed`

**Cause:** Server can't reach `<base_url>/d2l/api/versions/`. Most often, `base_url` is still the placeholder `https://school.brightspace.com`.

**Fix:** Edit `~/.brightspace-mcp/config.yaml` and replace the placeholder with your real Brightspace URL. The exact URL is visible in your browser when logged into Brightspace (look at the part before `/d2l/...`).

```bash
brightspace-mcp config set profiles.my_school.base_url https://learn.school.edu
```

## `All authentication strategies failed: browser: page.waitForSelector: Timeout 30000ms exceeded`

**Cause:** The browser strategy reaches a step where the expected element doesn't appear within the timeout.

**Diagnosis:** Re-run with `headless: false` to watch the flow:

```yaml
auth:
  browser:
    headless: false
```

Common variants:

### Stuck at `password` (line 64 in BrowserAuthStrategy.ts)
The username step didn't navigate to the password page. Your school may use a single-page form — remove `password_submit` from the config so both fields are filled and submitted together.

### Stuck at `mfa_input`
Your tenant uses Microsoft AAD push notification by default (no TOTP code field is shown). Add the fall-back clicks:

```yaml
pre_mfa_clicks:
  - "#signInAnotherWay"
  - "[data-value='PhoneAppOTP']"
```

→ Full preset in [presets.md](./presets.md#microsoft-azure-ad-with-authenticator-app).

### My MFA cannot be scripted (FIDO2 / biometric / Authenticator number-match)

Some flows are physically impossible to automate (Yubikey USB tap, fingerprint, "approve number 47 on your phone"). For these, use the recorder instead of `browser` strategy:

```bash
brightspace-mcp record-auth --save-to keychain
```

It opens a real browser, you log in normally, and the cookies get captured into a `session_cookie` profile. Cookies expire in ~1 hour — rerun the command when needed. See [auth-strategies.md#session_cookie](./auth-strategies.md#session_cookie).

### Stuck at `post_login`
Your `post_login` selector doesn't exist on the Brightspace home of your tenant. Try alternatives in this order: `d2l-navigation` → `d2l-labs-navigation` → `.d2l-navigation` → `#minibar-container`. Whichever you find on `view-source:` of your home page, use that.

### Stuck after MFA submit
Microsoft shows a "Stay signed in?" dialog after TOTP that needs a click. Add:

```yaml
post_mfa_clicks:
  - "#idSIButton9"
```

(Available since v0.16.)

## `SecretTooShortError` when using TOTP

**Cause:** Pre-v0.15 the project used `otplib` v13 which enforces a 16-byte minimum. Many real-world TOTP secrets are 10 bytes (16 base32 chars).

**Fix:** Upgrade to v0.15 or later. The native `node:crypto` implementation accepts any length per RFC 6238.

## Write tools missing from the MCP server

**Cause:** Writes need *both* gates open.

**Fix:**
1. `writes.enabled: true` in `~/.brightspace-mcp/config.yaml`
2. `--enable-writes` flag in your client's `args` for the `serve` command
3. Restart the client / `/reload-plugins`

Verify with `brightspace-mcp serve --enable-writes` in a terminal — you should see `submit_assignment` etc. registered.

## `playwright is not available`

**Cause:** The `browser` strategy requires Playwright but it's an `optionalDependency` (not auto-installed by `npx`).

**Fix:**

```bash
npm install playwright
npx playwright install chromium
```

Or use the `headless` strategy (no Playwright required) if your school's login is server-rendered.

## Tools return stale data

**Cause:** Cached HTTP responses.

**Fix:** Invoke the `clear_cache` tool, or:

```bash
brightspace-mcp cache clear
```

Cache scopes: `all`, `http`, `courses`, `grades`, `assignments`, `content`, `communications`, `calendar`.

## `submit_assignment` returns 403 Forbidden

**Cause:** Your Brightspace tenant has disabled student-side dropbox submission via the Valence API. The endpoint exists and the GET works (returns the empty submission list), but POST is forbidden by tenant policy.

**Diagnosis:** GET against `/d2l/api/le/{ver}/{ou}/dropbox/folders/{fid}/submissions/mysubmissions/` returns `200 []`, but POST returns `403 {"Errors":[{"Message":"Forbidden"}]}` even with the correct XSRF token. This holds inside an already-authenticated browser session, confirming it's tenant policy, not auth.

**Fix:** Nothing extra to configure. When the API POST returns 403/404, `submit_assignment` **automatically retries via Playwright**, scripting the actual web upload form headlessly. The fallback verifies the submission landed by re-checking the Valence read API.

If your tenant has a customized UI with non-standard button labels, override the selectors via YAML — see [writes.md §UI fallback](./writes.md#ui-fallback-for-restricted-tenants).

If your tenant *does* allow API submissions, you'll see something like `Submitted Lab4.zip — submissionId 12345 …`. The implementation works against tenants that haven't restricted the endpoint.

## `submit_assignment` returns 400 "Invalid Parameters"

**Cause:** Wrong multipart format — `multipart/form-data` instead of the `multipart/mixed` that Valence docs require, or missing the `data` JSON part.

**Fix:** Already handled in v0.16+. Upgrade if you're seeing this on an older version.

## "Submission already exists" / duplicate write

**Cause:** Same `idempotency_key` already used; the tool returns the cached response.

**Fix:** Use a different `idempotency_key`. The cache lives at `~/.brightspace-mcp/idempotency.json` — delete it if you really need to retry a write with the same key (only if you know what you're doing).

## My session cookie expired (401 on every read tool)

For credential-based strategies (`browser`, `headless`, `oauth`, `api_token`) the MCP server **auto-refreshes** when it sees a 401: the failing request is retried once after `EnsureAuthenticated.reauthenticate()` runs. You won't normally see expiration errors.

For `session_cookie` (cookies captured via `record-auth`), there is no automated re-auth — Playwright cannot pop a browser without user interaction. When the cookie expires (~1 hour) re-run:

```bash
brightspace-mcp record-auth --save-to keychain --profile my_school
```

The same one-liner works for any storage mode (`keychain | file | env | print`). The YAML is updated in place; nothing else needs to change.

## `submit_assignment` UI flow can't find a button

If the API submit fails (403/404) and the UI fallback also fails with `"<X> button not found (selector: ...)"`, your tenant has a customized Brightspace UI. Override that specific step in YAML:

```yaml
profiles:
  my_school:
    ui_submit:
      selectors:
        # only override the step that's failing
        commit_button: 'button[data-d2l-id="custom-attach"]'
```

Available keys: `add_file_button`, `my_computer_link`, `upload_button`, `commit_button`, `submit_button`, `confirm_button`. See [writes.md](./writes.md) for the full structure.

## Auth works in CLI but not in MCP client

**Cause:** Different environment. Your shell has env vars; the MCP client launches a subprocess without them.

**Fix:** Pass credentials in the client's `env` block:

```json
{
  "mcpServers": {
    "brightspace": {
      "command": "npx",
      "args": ["--yes", "brightspace-mcp", "serve"],
      "env": {
        "BRIGHTSPACE_USERNAME": "you@school.edu",
        "BRIGHTSPACE_PASSWORD": "...",
        "BRIGHTSPACE_TOTP_SECRET": "ABC..."
      }
    }
  }
}
```

Or use `keychain:` references in the YAML so the secrets are read from the OS keyring regardless of process env.

## Logs

| What | Where |
|---|---|
| Server stderr (info/debug) | wherever your client redirects subprocess stderr |
| Audit log of writes | `~/.brightspace-mcp/audit.log` |
| Idempotency cache | `~/.brightspace-mcp/idempotency.json` |
| Session cache (file backend) | `~/.brightspace-mcp/sessions.json` |
| Claude Desktop MCP logs | `~/Library/Logs/Claude/mcp*.log` (macOS) |

Increase verbosity:

```yaml
logging:
  level: debug   # error | warn | info | debug
```

### "Why do I see `{{some.key}}` in tool output?"

That marker means the translator couldn't find a key in the active locale
**or** in the `en-US` fallback. Likely causes:
1. A key was added to `en-US.json` but not to the active locale's catalog
   and is not in `docs/i18n-fallback-allowed.json`.
2. A typo in the key passed to `t(...)` inside a handler.

Run `npx vitest run tests/shared-kernel/output/i18n/catalog-parity.test.ts` to find
missing keys.

### Invalid timezone error at startup

```
invalid tz: "..." — Use an IANA name like "America/Bogota"
```

Find your system timezone:

```bash
node -e "console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)"
```

Set it in `~/.brightspace-mcp/config.yaml` under `output.tz`.

### Web UI fails to start (`ui failed: ...`)

Common causes:
- Port 9876 already in use → add `--port 9877`
- Config not found → run `brightspace-mcp setup` or `brightspace-mcp init` first
- Auth expired → run `brightspace-mcp auth` to re-authenticate
