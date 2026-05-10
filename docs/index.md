---
layout: home

hero:
  name: brightspace-mcp
  text: Talk to D2L Brightspace from any MCP client
  tagline: Multi-auth, opt-in writes, session cache. Built with DDD bounded contexts and 88% test coverage.
  image:
    src: /logo.svg
    alt: brightspace-mcp
  actions:
    - theme: brand
      text: Get started
      link: /setup-guide
    - theme: alt
      text: Tools reference
      link: /tools
    - theme: alt
      text: View on GitHub
      link: https://github.com/JhostinAleck/brightspace-mcp

features:
  - icon: 🔐
    title: Four auth strategies
    details: api_token, browser (Playwright), oauth, session_cookie. Pick the one that fits your tenant — push notifications and FIDO2 included.
    link: /auth-strategies
    linkText: Choose your strategy
  - icon: 📚
    title: 20+ MCP tools
    details: List courses, fetch syllabus, download topic files, read announcements, get assignments — all read-only by default.
    link: /tools
    linkText: Browse the catalog
  - icon: ✍️
    title: Opt-in writes
    details: Submit assignments, post discussion replies, mark announcements read. Gated behind --enable-writes with audit log.
    link: /writes
    linkText: Enable writes
  - icon: 🏫
    title: Tenant-aware
    details: Locale-agnostic UI selectors, tenant presets, automatic Valence version discovery. Works on Microsoft AAD, SAML, and direct logins.
    link: /presets
    linkText: See known tenants
  - icon: 🧱
    title: DDD-clean architecture
    details: Bounded contexts enforced by dependency-cruiser. Domain layer is pure TypeScript, no infra leakage. Easy to extend.
    link: /architecture
    linkText: Read architecture
  - icon: 🛠️
    title: Operator-friendly
    details: Built-in `doctor` smoke test, `record-auth` cookie capture, `profile` switcher, NDJSON audit log. Fix problems in minutes.
    link: /troubleshooting
    linkText: Troubleshoot
---

## Quick install

```bash
npm install -g brightspace-mcp
brightspace-mcp init    # interactive config wizard
brightspace-mcp doctor  # verify setup
```

Add to your MCP client (Claude Desktop, Cursor, Windsurf, …) — see [Clients](/clients).

## Why brightspace-mcp?

D2L Brightspace doesn't ship with a friendly API for daily student / TA workflows. This MCP server bridges that gap so an LLM agent can:

- **Read** your courses, syllabus, content, announcements, grades, and discussions
- **Write** carefully — submit assignments, reply to discussions — only when you opt in
- **Adapt** to any institution via YAML profiles, no code changes

It's a portable, single-binary alternative to scripting against Valence by hand.

## Status

| | |
|---|---|
| Latest version | [v0.17.0](https://github.com/JhostinAleck/brightspace-mcp/releases/tag/v0.17.0) |
| Tests | 524/524 passing |
| Coverage | 88% lines / 87% functions |
| Node | ≥ 20 (tested 20, 22) |
| OS | macOS, Linux, Windows |
| License | MIT |
