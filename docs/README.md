# Documentation index

Detailed guides for `brightspace-mcp`. The top-level [`README.md`](../README.md) is the quickstart; the files in this folder are the deep-dives.

## By task

**I want to…**

| Goal | Doc |
|---|---|
| Get up and running | [setup-guide.md](./setup-guide.md) |
| Set up non-interactively (CI / DevContainers) | [setup-guide.md §0](./setup-guide.md#step-0-optional-non-interactive-setup-for-ciscripts) |
| Capture cookies from a manual login (FIDO2 / biometric / push) | [setup-guide.md §3 option B](./setup-guide.md#b-recorder-you-log-in-manually-we-steal-the-cookie) |
| Pick the right auth strategy | [auth-strategies.md](./auth-strategies.md) |
| Use a known config for my school | [presets.md](./presets.md) |
| Configure timezone and display language | [setup-guide.md §Output](./setup-guide.md#output-timezone-and-language) |
| Enable writes (submit, post, mark) | [writes.md](./writes.md) |
| Customize the UI fallback for a non-English tenant | [writes.md §UI fallback](./writes.md#ui-fallback-for-restricted-tenants) |
| Look up an MCP tool's args | [tools.md](./tools.md) |
| Use MCP Resources (stable URIs for syllabi, PDFs) | [tools.md §MCP Resources](./tools.md#mcp-resources) |
| Use MCP Prompts (weekly briefing, grade audit, etc.) | [tools.md §MCP Prompts](./tools.md#mcp-prompts) |
| Open the web dashboard | [setup-guide.md §Web UI](./setup-guide.md#web-ui-dashboard) |
| Troubleshoot a broken setup | [troubleshooting.md](./troubleshooting.md) |
| Register with Claude Desktop / Cursor / Windsurf | [clients.md](./clients.md) |
| Understand the code structure | [architecture.md](./architecture.md) |

## By concern

**Setup & operations:**
- [setup-guide.md](./setup-guide.md) — first-time setup walkthrough
- [auth-strategies.md](./auth-strategies.md) — choose api_token / browser / oauth / session_cookie
- [presets.md](./presets.md) — known-good configurations for common tenants
- [clients.md](./clients.md) — wire the server into MCP-capable clients

**Capabilities:**
- [tools.md](./tools.md) — read tools (always available)
- [tools.md §MCP Resources](./tools.md#mcp-resources) — stable `brightspace://` URIs for syllabi, PDFs, announcements
- [tools.md §MCP Prompts](./tools.md#mcp-prompts) — pre-built LLM prompt templates
- [writes.md](./writes.md) — write tools (gated)

**Internals:**
- [architecture.md](./architecture.md) — DDD bounded contexts, layering rules
- [troubleshooting.md](./troubleshooting.md) — common errors and fixes

**Reference:**
- [`../AGENTS.md`](../AGENTS.md) — top-level project map
- [`../CHANGELOG.md`](../CHANGELOG.md) — what changed in each release
- [`../README.md`](../README.md) — landing page / quickstart

## Conventions

- Code samples assume macOS / Linux. Windows alternatives are noted where they differ.
- Config snippets are valid YAML — paste them as-is into `~/.brightspace-mcp/config.yaml`.
- All examples use the placeholder `https://school.brightspace.com` — replace with your real URL.
- IDs in examples are realistic-looking but synthetic (e.g. `course_id: 424258`).
