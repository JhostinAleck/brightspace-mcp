# Stability policy

`brightspace-mcp` follows [Semantic Versioning 2.0](https://semver.org) starting from v1.0.0.

## What is public API

Changing any of the following is a **MAJOR** (breaking) change:

- CLI command names and their flags (`setup`, `serve`, `init`, `ui`, `auth`, `doctor`, `record-auth`, `upgrade`, `profile`, `config`, `cache`)
- MCP tool names and their input schemas (e.g. `list_my_courses`, `get_my_grades`)
- MCP Resource URI patterns (`brightspace://{courseId}/...`)
- MCP Prompt names (`weekly_briefing`, `grade_audit`, `study_planner`, `course_summary`)
- Config YAML schema keys under `profiles.*`, `output.*`, `writes.*`, `logging.*`, `redis.*`
- `~/.brightspace-mcp/` file layout (`config.yaml`, `audit.log`, `idempotency.json`)

## What is NOT public API

The following may change in **MINOR** releases:

- Internal TypeScript types, interfaces, classes, and composition-root wiring
- Output formatting changes that preserve information (e.g. Markdown table column order)
- New tools, resources, or prompts added — always additive
- New config keys — always additive, backward-compatible with defaults
- New CLI flags on existing commands — always additive
- Web UI layout and design (`brightspace-mcp ui`)

**PATCH** releases: bug fixes, performance improvements, dependency updates.

## Pre-release

Tags `1.x.x-alpha.*` and `1.x.x-beta.*` carry no stability guarantee.
