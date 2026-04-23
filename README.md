# brightspace-mcp

[![CI](https://github.com/JhostinAleck/brightspace-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/JhostinAleck/brightspace-mcp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/brightspace-mcp.svg)](https://www.npmjs.com/package/brightspace-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/brightspace-mcp.svg)](./package.json)

MCP server for D2L Brightspace with multi-strategy authentication, TOTP/MFA support, retry + circuit breaker + cache tiers, and opt-in write operations.

## Install

### Via npx (recommended)

```bash
npx brightspace-mcp serve
```

### Via Docker

```bash
docker pull ghcr.io/jhostinaleck/brightspace-mcp:latest
docker run --rm -i \
  -v "$HOME/.brightspace-mcp:/config:ro" \
  -e BRIGHTSPACE_CONFIG=/config/config.yaml \
  ghcr.io/jhostinaleck/brightspace-mcp:latest serve
```

### Via docker-compose (with optional Redis)

```bash
# Default — in-memory cache
docker compose up

# With Redis cache backend
BRIGHTSPACE_CACHE_BACKEND=redis BRIGHTSPACE_REDIS_URL=redis://redis:6379 \
  docker compose --profile redis up
```

### From source

```bash
git clone https://github.com/JhostinAleck/brightspace-mcp.git
cd brightspace-mcp
npm install
npm run build
node build/cli/main.js serve
```

## Configure

Create `~/.brightspace-mcp/config.yaml`:

```yaml
default_profile: my_school
profiles:
  my_school:
    base_url: https://your-school.brightspace.com
    auth:
      strategy: api_token
      api_token: { token_ref: env:BRIGHTSPACE_API_TOKEN }
```

Then export your token and run the server:

```bash
export BRIGHTSPACE_API_TOKEN="<your-token>"
npx brightspace-mcp serve
```

## Setup wizard (easiest path)

Run the interactive setup:

```bash
npx brightspace-mcp setup
```

The wizard:
- Asks for your Brightspace base URL and chosen auth strategy (API token, browser, OAuth, etc.)
- If TOTP MFA, walks through saving the secret via env var / keychain / encrypted file
- Writes `~/.brightspace-mcp/config.yaml` with 0600 permissions
- Auto-detects Claude Desktop, Cursor, and Windsurf — offers to register this server in each

Other CLI commands:

```bash
brightspace-mcp auth                    # Re-authenticate (test config)
brightspace-mcp config show             # Print current config (secrets redacted)
brightspace-mcp config show --resolved  # Show secret refs as [redacted]
brightspace-mcp config validate         # Validate config without running server
brightspace-mcp config set <path> <value>
brightspace-mcp cache clear             # Clear both memory and file cache
```

## Register with an MCP client

See [`docs/clients.md`](./docs/clients.md) for Claude Desktop, Cursor, and Windsurf snippets.

## Features

- **Multi-strategy auth**: API Token, Browser (Playwright), OAuth PKCE, Session Cookie, Headless Password
- **MFA**: TOTP (RFC 6238), Duo Push, Manual Prompt
- **Credentials**: OS keychain, encrypted file (AES-256-GCM + scrypt), env vars
- **Resilience**: retry with jitter, circuit breaker, request coalescing, bulkhead, rate-limit awareness
- **Cache**: two-tier (HTTP L1 + domain L2), backends in-memory / file / Redis / layered
- **Security**: cross-user cache isolation via auth fingerprint, HTTPS-only transport, secrets redaction in logs
- **Observability**: metrics + diagnostics MCP tool
- **15 tools**: `check_auth`, `list_my_courses`, `get_my_grades`, `get_assignments`, `get_upcoming_due_dates`, `get_feedback`, `get_roster`, `get_classlist_emails`, `get_syllabus`, `get_course_content`, `get_announcements`, `get_discussions`, `get_calendar_events`, `clear_cache`, `get_diagnostics`

## Status

- [x] Plan 1: Foundation + vertical slice
- [x] Plan 2: Browser, OAuth, Session Cookie, Headless + MFA (TOTP, Duo, Manual)
- [x] Plan 3: Retry/backoff, rate limit, coalescing, File/Redis cache
- [x] Plan 4: Grades + Assignments
- [x] Plan 5: Content + Communications + Calendar + Roster
- [x] Plan 8: Release pipeline
- [ ] Plan 6: CLI setup wizard
- [ ] Plan 7: Opt-in write operations

## License

[MIT](./LICENSE) © Jhostin Aleck
