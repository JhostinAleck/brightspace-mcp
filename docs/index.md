---
layout: home

hero:
  name: brightspace-mcp
  text: Talk to D2L Brightspace from any MCP client
  tagline: Multi-auth, opt-in writes, MCP Resources, MCP Prompts, web dashboard, i18n. 743 tests · 89% coverage.
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
    title: Five auth strategies
    details: api_token, browser (Playwright + SSO presets), headless, oauth, session_cookie. TOTP, Duo Push, FIDO2/biometric via record-auth.
    link: /auth-strategies
    linkText: Choose your strategy
  - icon: 📚
    title: 26 MCP tools + Resources + Prompts
    details: Read courses, grades, assignments, content, quizzes, calendar, discussions. Plus stable brightspace:// URIs and pre-built prompt templates.
    link: /tools
    linkText: Browse the catalog
  - icon: ✍️
    title: Opt-in writes
    details: Submit assignments, post discussion replies, mark announcements read. Gated behind --enable-writes with idempotency and audit log.
    link: /writes
    linkText: Enable writes
  - icon: 🌍
    title: Localized output
    details: Dates and text in your language — en-US, es-419, pt-BR, fr-CA. Timezone-aware Markdown output. Configured in setup wizard automatically.
    link: /setup-guide#output-timezone-and-language
    linkText: Configure locale
  - icon: 🖥️
    title: Web dashboard
    details: "`brightspace-mcp ui` opens a local dashboard — auth status, upcoming due dates, grades, config editor, cache stats, audit logs."
    link: /setup-guide#web-ui-dashboard
    linkText: Open dashboard
  - icon: 🧱
    title: DDD-clean architecture
    details: Bounded contexts enforced by dependency-cruiser. Domain layer is pure TypeScript, no infra leakage. 743 tests, 89% line coverage.
    link: /architecture
    linkText: Read architecture
---

## Quick install

```bash
npx brightspace-mcp@latest setup   # interactive wizard
# or non-interactive (CI/DevContainers):
npx brightspace-mcp@latest init --base-url https://... --strategy browser --preset microsoft
brightspace-mcp doctor              # verify setup
```

Add to your MCP client (Claude Desktop, Cursor, Windsurf, …) — see [Clients](/clients).

## Why brightspace-mcp?

D2L Brightspace doesn't ship with a friendly API for daily student / TA workflows. This MCP server bridges that gap so an LLM agent can:

- **Read** your courses, syllabus, content, announcements, grades, quizzes, and discussions
- **Write** carefully — submit assignments, reply to discussions — only when you opt in
- **Adapt** to any institution via YAML profiles and auth presets, no code changes
- **Browse** content via stable `brightspace://` MCP Resources and pre-built prompt templates
- **Manage** everything from a local web dashboard (`brightspace-mcp ui`)

It's a portable, self-updating alternative to scripting against Valence by hand — with SemVer stability from v1.0.0 onward.

## Status

| | |
|---|---|
| Latest version | [v1.1.0](https://github.com/JhostinAleck/brightspace-mcp/releases/tag/v1.1.0) |
| Tests | 743/743 passing |
| Coverage | 89% lines / 88% functions |
| Node | ≥ 20 (tested 20, 22) |
| OS | macOS, Linux, Windows |
| License | MIT |
