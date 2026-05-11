# brightspace-mcp

[![CI](https://github.com/JhostinAleck/brightspace-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/JhostinAleck/brightspace-mcp/actions/workflows/ci.yml)
[![Docs](https://github.com/JhostinAleck/brightspace-mcp/actions/workflows/docs.yml/badge.svg)](https://jhostinaleck.github.io/brightspace-mcp/)
[![npm version](https://img.shields.io/npm/v/brightspace-mcp.svg)](https://www.npmjs.com/package/brightspace-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/brightspace-mcp.svg)](./package.json)

📖 **[Full documentation site →](https://jhostinaleck.github.io/brightspace-mcp/)**

MCP server for D2L Brightspace. Gives Claude (and any MCP-compatible client) access to your courses, grades, assignments, content, calendar, and more — with multi-strategy authentication, full MFA support, and production-grade resilience built in.

---

## Quick start

```bash
npx brightspace-mcp setup   # interactive wizard (recommended for first time)
```

The interactive wizard handles everything: base URL, auth strategy, MFA, credential storage, and auto-registration with Claude Desktop / Cursor / Windsurf.

For CI pipelines or DevContainers with no TTY, use the non-interactive `init` command instead:

```bash
npx brightspace-mcp init \
  --base-url https://yourschool.brightspace.com \
  --strategy api_token \
  --token-ref env:BRIGHTSPACE_API_TOKEN
```

---

## Documentation

Deep-dive guides live in [`docs/`](./docs/) — start with [`docs/README.md`](./docs/README.md).

| Topic | Doc |
|---|---|
| Setup walkthrough | [`docs/setup-guide.md`](./docs/setup-guide.md) |
| Auth strategies | [`docs/auth-strategies.md`](./docs/auth-strategies.md) |
| Known-good presets (Microsoft AAD, etc.) | [`docs/presets.md`](./docs/presets.md) |
| Write operations (submit, post, mark) | [`docs/writes.md`](./docs/writes.md) |
| MCP tools reference | [`docs/tools.md`](./docs/tools.md) |
| MCP Resources + Prompts | [`docs/tools.md#mcp-resources`](./docs/tools.md#mcp-resources) |
| Troubleshooting | [`docs/troubleshooting.md`](./docs/troubleshooting.md) |
| Architecture (DDD) | [`docs/architecture.md`](./docs/architecture.md) |
| Register with MCP clients | [`docs/clients.md`](./docs/clients.md) |

For AI assistants and contributors, [`AGENTS.md`](./AGENTS.md) is a one-page map of the repo.

---

## Table of contents

- [Installation](#installation)
- [Authentication strategies](#authentication-strategies)
- [MFA strategies](#mfa-strategies)
- [Configuration reference](#configuration-reference)
- [Output: timezone and language](#output-timezone-and-language)
- [Redis cache](#redis-cache)
- [Write operations](#write-operations)
- [Available tools](#available-tools)
- [MCP Resources](#mcp-resources)
- [MCP Prompts](#mcp-prompts)
- [Web UI dashboard](#web-ui-dashboard)
- [Register with an MCP client](#register-with-an-mcp-client)
- [CLI reference](#cli-reference)
- [Docker](#docker)

---

## Installation

### npx (recommended — no install needed)

```bash
npx brightspace-mcp setup   # first-time wizard
npx brightspace-mcp serve   # run the server
```

### Global install

```bash
npm install -g brightspace-mcp
brightspace-mcp setup
brightspace-mcp serve
```

### From source

```bash
git clone https://github.com/JhostinAleck/brightspace-mcp.git
cd brightspace-mcp
npm install && npm run build
node build/cli/main.js serve
```

**Requirements**: Node.js ≥ 20.

---

## Authentication strategies

Pick the strategy that matches your Brightspace setup. Run `brightspace-mcp setup` and it will walk you through the right one.

### API Token (simplest)

Requires a Valence API token from your Brightspace admin panel.

```yaml
profiles:
  my_school:
    base_url: https://school.brightspace.com
    auth:
      strategy: api_token
      api_token:
        token_ref: env:BRIGHTSPACE_API_TOKEN
```

```bash
export BRIGHTSPACE_API_TOKEN="your-token"
brightspace-mcp serve
```

### Headless (username + password)

Automates HTTP-level login — no browser window. Supports all MFA strategies including **Duo Push**.

```yaml
profiles:
  my_school:
    base_url: https://school.brightspace.com
    auth:
      strategy: headless
      headless:
        login_url: https://school.brightspace.com/d2l/login
        username_ref: env:BRIGHTSPACE_USERNAME
        password_ref: env:BRIGHTSPACE_PASSWORD
        mfa:
          strategy: duo_push     # or: totp, manual_prompt, none
          duo_push: {}           # uses defaults: poll every 1s, timeout 120s
```

### Browser (Playwright)

Launches a headless Chromium instance and automates the login UI. Best for SSO flows (Microsoft Azure AD, SAML) where the login page has complex JavaScript.

```bash
npm install playwright && npx playwright install chromium
```

```yaml
auth:
  strategy: browser
  browser:
    login_url: https://school.brightspace.com/d2l/login
    headless: true
    username_ref: env:BRIGHTSPACE_USERNAME
    password_ref: env:BRIGHTSPACE_PASSWORD
    selectors:
      username: "#i0116"
      password: "#i0118"
      submit: "#idSIButton9"
      password_submit: "#idSIButton9"
      mfa_input: "#idTxtBx_SAOTCC_OTC"
      mfa_submit: "#idSubmit_SAOTCC_Continue"
      post_login: "d2l-labs-navigation"
    mfa:
      strategy: totp
      totp:
        secret_ref: env:BRIGHTSPACE_TOTP_SECRET
```

The setup wizard includes a **Microsoft SSO preset** that fills all selectors automatically.

### Session Cookie

Paste the D2L session cookies from your browser's DevTools. Useful when other strategies are blocked.

```yaml
auth:
  strategy: session_cookie
  session_cookie:
    cookie_ref: env:BRIGHTSPACE_COOKIE
    session_ttl_seconds: 3600
```

```bash
# Cookie format: "d2lSessionVal=XXX; d2lSecureSessionVal=YYY"
export BRIGHTSPACE_COOKIE="d2lSessionVal=...; d2lSecureSessionVal=..."
```

---

## MFA strategies

| Strategy | When to use |
|---|---|
| `none` | No MFA on your account |
| `totp` | Authenticator app (Google Authenticator, Authy, etc.) |
| `duo_push` | Duo Security — server polls for mobile approval automatically |
| `manual_prompt` | Any TOTP/OTP — server pauses and asks you to paste the code |

### TOTP example

```yaml
mfa:
  strategy: totp
  totp:
    secret_ref: env:BRIGHTSPACE_TOTP_SECRET   # base32 secret from QR code setup
    digits: 6       # 6 or 8
    period: 30      # seconds
    algorithm: SHA1 # SHA1, SHA256, or SHA512
```

### Duo Push example

```yaml
mfa:
  strategy: duo_push
  duo_push:
    poll_interval_ms: 1000   # how often to check (default: 1000)
    timeout_ms: 120000       # give up after this many ms (default: 120000)
```

---

## Configuration reference

Full config file (`~/.brightspace-mcp/config.yaml`):

```yaml
default_profile: my_school

profiles:
  my_school:
    base_url: https://school.brightspace.com
    auth:
      strategy: api_token          # api_token | browser | headless | session_cookie | oauth
      api_token:
        token_ref: env:BRIGHTSPACE_API_TOKEN
    session:
      cache_backend: memory        # memory | file | redis
      preemptive_refresh_seconds: 300

logging:
  level: info                      # debug | info | warn | error

writes:
  enabled: false
  dry_run: false

# Optional — required when session.cache_backend: redis
redis:
  url: redis://localhost:6379
  key_prefix: "brightspace:"
```

### Credential references

Secret values are never stored in plain text. Use `ref:` notation to point to the actual value:

| Prefix | Example | Description |
|---|---|---|
| `env:NAME` | `env:BRIGHTSPACE_API_TOKEN` | Read from environment variable |
| `keychain:service/account` | `keychain:brightspace-mcp/token` | OS keychain (macOS Keychain, GNOME Keyring, Windows Credential Manager) |
| `file:label` | `file:api_token` | Encrypted file (`~/.brightspace-mcp/credentials.enc`, AES-256-GCM) |

---

## Output: timezone and language

All tool responses are formatted in your configured timezone and language.

```yaml
output:
  tz: America/Bogota       # IANA name; default: auto-detected from system
  locale: es-419           # en-US | es-419 | pt-BR | fr-CA; default: auto-detected
  format: markdown         # markdown (default) | plain
  include_meta_footer: true
```

Run `brightspace-mcp setup` and choose your timezone and language. Or set it in `~/.brightspace-mcp/config.yaml`.

---

## Redis cache

When running multiple instances or want cache persistence across restarts, enable Redis:

**1. Add the `redis` section to config:**

```yaml
redis:
  url: redis://localhost:6379
  key_prefix: "brightspace:"

profiles:
  my_school:
    session:
      cache_backend: redis
```

**2. Install ioredis (optional dependency):**

```bash
npm install ioredis
```

**3. Start Redis and the server:**

```bash
docker run -d -p 6379:6379 redis:7-alpine
brightspace-mcp serve
```

The domain cache (courses, grades, assignments, etc.) automatically uses Redis as persistent layer when the `redis:` section is present in config. Session tokens are stored with TTL derived from the token expiry.

---

## Write operations

Write tools (`submit_assignment`, `post_discussion_reply`, `mark_announcement_read`) are disabled by default and require two separate opt-ins:

**1. Config file:**

```yaml
writes:
  enabled: true
  dry_run: false   # set true to preview without mutating D2L
```

**2. CLI flag:**

```bash
brightspace-mcp serve --enable-writes
```

All write operations:
- Require a client-supplied `idempotency_key` (8–128 chars). Repeat calls with the same key return the cached response without re-executing.
- Emit a WARN-level audit log line with correlation ID, tool name, and redacted args.
- Respect `dry_run: true` to return a preview response without touching D2L.

---

## Available tools

### Read tools (always available)

| Tool | Description |
|---|---|
| `check_auth` | Verify authentication and show the active user identity |
| `list_my_courses` | List all enrolled courses |
| `get_my_grades` | Get grades for a course |
| `get_assignments` | List assignments and dropbox folders |
| `get_assignment_files` | Download and read instructor-posted assignment files |
| `get_upcoming_due_dates` | List assignments due in the next N days |
| `get_feedback` | Read instructor feedback on submitted assignments |
| `get_syllabus` | Fetch the course syllabus |
| `get_course_content` | Browse modules and topics (includes topic IDs) |
| `get_topic_file` | Download and read a content topic file (DOCX, PDF, HTML, plain text) |
| `get_announcements` | List course announcements |
| `get_discussions` | Browse discussion forums and threads |
| `get_calendar_events` | List calendar events in a date range |
| `get_roster` | Get the full course roster |
| `get_classlist_emails` | Get classmate email addresses |
| `get_diagnostics` | Show cache stats, circuit breaker state, and version info |
| `clear_cache` | Clear memory and persistent cache backends |

### Write tools (require `--enable-writes`)

| Tool | Description |
|---|---|
| `submit_assignment` | Upload a file to a Brightspace Dropbox folder |
| `post_discussion_reply` | Reply to a discussion thread |
| `mark_announcement_read` | Mark an announcement as read |

---

## MCP Resources

Four stable URIs for Brightspace content (readable by any MCP client via `resources/read`):

| URI | Content |
|---|---|
| `brightspace://{courseId}/syllabus` | Course syllabus, HTML stripped |
| `brightspace://{courseId}/content/topics/{topicId}` | Topic file (text extracted from PDF, or base64 fallback) |
| `brightspace://{courseId}/assignments/{assignmentId}/files` | All assignment attachments as text |
| `brightspace://{courseId}/announcements/{announcementId}` | Announcement text |

Obtain IDs from tools like `list_my_courses`, `get_assignments`, `get_announcements`.

---

## MCP Prompts

Four pre-built prompt templates visible in your MCP client's prompt picker:

| Prompt | Arguments | Purpose |
|---|---|---|
| `weekly_briefing` | none | 7-day overview: due dates, announcements, recent grades |
| `grade_audit` | `course_id?` | Grade analysis + what you need to pass |
| `study_planner` | `days_ahead?` (default 7) | Study plan from due dates and calendar |
| `course_summary` | `course_id` (required) | Full course overview |

---

## Web UI dashboard

```bash
brightspace-mcp ui             # open at http://localhost:9876
brightspace-mcp ui --open      # open browser automatically
brightspace-mcp ui --port 8080 # custom port
```

Provides: auth status, upcoming due dates, grades, announcements, config editor (form + YAML), cache stats, audit logs, diagnostics. Dark/light mode, tooltips on all fields.

---

## Register with an MCP client

See [`docs/clients.md`](./docs/clients.md) for Claude Desktop, Cursor, and Windsurf snippets, or run `brightspace-mcp setup` which auto-detects and registers for you.

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "brightspace": {
      "command": "npx",
      "args": ["--yes", "brightspace-mcp", "serve"],
      "env": {
        "BRIGHTSPACE_CONFIG": "/Users/you/.brightspace-mcp/config.yaml"
      }
    }
  }
}
```

---

## CLI reference

```
brightspace-mcp setup                      Interactive first-time setup wizard
brightspace-mcp init [flags]               Non-interactive config writer (CI/scripts, no TTY)
brightspace-mcp serve                      Start the MCP server (stdio transport)
brightspace-mcp serve --enable-writes      Start with write tools enabled
brightspace-mcp ui [flags]                 Local web dashboard at http://localhost:9876
brightspace-mcp auth                       Re-authenticate and test the config
brightspace-mcp config show                Print config (secrets redacted)
brightspace-mcp config show --resolved     Show all secret refs as [redacted]
brightspace-mcp config validate            Validate config schema without running
brightspace-mcp config set <path> <value>  Edit a nested config value
brightspace-mcp cache clear                Clear memory + file/Redis cache
brightspace-mcp cache clear --context <n>  Clear a specific cache context
```

---

## Docker

### Standalone

```bash
docker pull ghcr.io/jhostinaleck/brightspace-mcp:latest
docker run --rm -i \
  -v "$HOME/.brightspace-mcp:/config:ro" \
  -e BRIGHTSPACE_CONFIG=/config/config.yaml \
  ghcr.io/jhostinaleck/brightspace-mcp:latest serve
```

### With Redis (docker-compose)

```bash
# Start server + Redis
docker compose --profile redis up

# Or standalone (in-memory cache)
docker compose up
```

The `config.yaml` inside `~/.brightspace-mcp/` must have the `redis:` section pointing to `redis://redis:6379` when using the compose profile.

---

## Architecture highlights

- **Resilience**: retry with exponential backoff + jitter, circuit breaker (5 failures → 30s cooldown), request coalescing, bulkhead (max 5 concurrent requests)
- **Cache tiers**: HTTP response cache (L1, in-memory, 60s TTL) + domain cache (L2, layered memory → file or Redis)
- **Security**: HTTPS-only transport, secrets redaction in all log output, OS keychain integration, AES-256-GCM encrypted credential file, session tokens expire with the D2L token
- **DDD structure**: bounded contexts (`assignments`, `authentication`, `calendar`, `communications`, `content`, `courses`, `grades`) with clean domain / application / infrastructure separation

---

## License

[MIT](./LICENSE) © Jhostin Aleck
