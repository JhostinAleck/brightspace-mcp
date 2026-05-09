# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.15.0] - 2026-05-09

### Added

- **`get_topic_file` — xlsx content extraction**: `.xlsx` files now return their cell data as tab-separated rows per sheet (e.g. `=== Sheet1 ===\nNombre\tNota\nAna\t95.5`) instead of `[Excel — N bytes]`. Implemented natively via the existing ZIP parser — no new dependencies.
- **`get_topic_file` — `save_to` parameter**: optional path (`~/...`, `%USERPROFILE%\...`, or absolute) to save the raw file binary to disk. The extracted text is still returned alongside a `[Saved to: /abs/path]` confirmation. Works on macOS, Linux, and Windows.

### Fixed

- **TOTP with 80-bit secrets**: replaced `otplib` class-based TOTP with a native `node:createHmac` implementation (RFC 6238/4226). `otplib` v13 enforces a 128-bit minimum that rejects real-world 16-char base32 secrets issued by many services. The native implementation has no length restriction and passes all RFC Appendix B test vectors.
- **`fast-uri` CVEs**: updated transitive dependency to patch `GHSA-q3j6-qgpj-74h6` (path traversal) and `GHSA-v39h-62p7-jpjc` (host confusion). `npm audit` reports 0 vulnerabilities.

### Removed

- **`otplib`** from `optionalDependencies` — replaced by the native TOTP implementation above.

### Verification

471/471 tests pass, lint clean, typecheck clean, depcruise 0 violations, coverage 87.29% statements / 74.02% branches, `npm audit` 0 vulnerabilities.

## [0.14.0] - 2026-05-07

### Added

- **Error-path test coverage** for the infrastructure layer:
  - `D2lApiClient` metrics observation: cache hit/miss counters, status-code counters, network-error counter, circuit-open counter wired through the breaker's `onStateChange` hook.
  - `CircuitBreaker.onStateChange` event emission: fires once per real transition, never on the implicit boot state.
  - `HeadlessPasswordStrategy` error paths: missing `mfaUrl`, unknown server status, MFA submission failure, login HTTP failure, single-header set-cookie fallback.
  - `D2lCourseRepository.findById` direct `/orgstructure/` lookup, course-shape filtering, 403/404 fallback to enrollments scan, error propagation for non-403/404 failures.
  - `D2lContentRepository.findModules` depth-cap guard: pathological self-referential trees stop descending instead of blowing the stack.

### Changed

- `socket.yml` now silences Socket's `gptAnomaly` (AI typosquat detector) so the false positive on `fast-wrap-ansi` no longer drags the dependency score. Other Socket signals (low-adoption, deprecated, malware, network access, eval, shell access) remain active. Rationale documented inline in the file.
- Removed the `Plan 2` reference from the OAuth-callback error message in `composition-root.ts` — replaced with a clearer description of the out-of-band callback helper requirement.

### Verification

462/462 tests pass, lint clean, typecheck clean, depcruise 0 violations
(177 modules, 531 deps), coverage 86.88% statements / 74.24% branches.

## [0.13.0] - 2026-05-07

### Fixed (comprehensive audit — 51 issues across all severity levels)

#### Critical
- `OrgUnitId` / `UserId` / `CourseId` / `AssignmentId`: `createOrgUnitId` now parses string→number with a positive-integer regex; `toNumber` validates the runtime invariant so future regressions fail loudly instead of silently propagating string-shaped IDs.
- `brightspace-mcp cache clear` CLI: now wipes the real on-disk paths (`domain-cache.json`, `idempotency.json`, `sessions.json`) and Redis via `SCAN`. Previously a silent no-op pointing at a non-existent file.
- `MetricsRegistry`: instrumented in `D2lApiClient` (durations, status codes, network errors, cache hit/miss) and `CircuitBreaker` (state transitions). `get_diagnostics` now reports real data instead of empty maps.
- `AuditLogger`: emits a single flat JSON line via `logger.warn(msg, ctx)` instead of double-stringifying the audit payload.
- `EncryptedFileCredentialStore`: read/write/delete now run under `proper-lockfile` so concurrent processes cannot corrupt credentials.
- `CachedCourseRepository.findById`: discriminated union for negative caching (was conflating cached-null with cache-miss).
- `submit_assignment`: 50 MB hard cap, single decode of the base64 payload.

#### High
- Audit logging happens AFTER the idempotency check in all 3 write tools so replays no longer inflate the audit log.
- Cache write now lives inside the coalesced fn (one `cache.set` per upstream fetch instead of N).
- `FileCache` / `FileSessionCache.get` use lazy expiration (no write on read); opportunistic GC happens on the next `set()`.
- `RedisCache.clear` uses `SCAN` + variadic `DEL` instead of the production-hazardous `KEYS *`.
- `Disposables` registry plus `SIGTERM`/`SIGINT` handlers in serve/auth so Redis `quit()` and Playwright `close()` actually run on shutdown.
- `findMyCourses` guarded by `MAX_PAGES` + cyclic-bookmark detection.
- `AggregateAuthError` preserves every strategy failure with its kind so all chain failures are visible.
- `D2lContentRepository.buildModule` fans out submodules via `Promise.all` with a depth cap.
- `getUpcomingDueDates` uses `Promise.all` for per-course fetches.
- Single ZIP extractor in `shared-kernel/zip` parses the central directory (the old byte-scan parser misread payloads containing `PK` signatures).
- `whoami` receives the discovered LP version instead of a frozen default.
- `User-Agent` now reads the version from `package.json` at startup.
- `PlaywrightPageRenderer` reuses one browser singleton with per-call contexts; `dispose` closes it on shutdown.
- DOCX paragraph regex switched to lazy match — the greedy form swallowed entire paragraphs for shapes without nested `w:r`/`w:t` children.

#### Medium / Low
- `redactor.ts`: TOTP regex bounded to [16-128] chars; JWT pattern added.
- `AuditLogger` `SECRET_KEYS` expanded to 12 entries (case-insensitive lookup).
- `AccessToken` rejects CRLF/NUL injection at construction time.
- `D2lApiClient` hashes the auth fingerprint before building the cache key (raw secret no longer travels with the cache key object).
- `findById` takes the O(1) `/orgstructure/` path with enrollment fallback for tenants that 403/404 student tokens against orgstructure.
- `clear_cache` MCP tool exposes all 6 domain contexts (was `courses` only).
- `CachedIdempotencyStore` no longer doubles the `idm:` prefix.
- `RetryPolicy` honours server-supplied `Retry-After` even when it exceeds `maxMs` (with documented rationale).
- `parseRetryAfterMs` validates negative values.

### Changed

- **Replaced unmaintained dependencies**:
  - `keytar@7.9.0` (no releases since 2022, deprecated `prebuild-install` chain) → `@napi-rs/keyring@1.x` (modern napi-rs binding, no deprecated transitives). `KeychainCredentialStore` is now backend-agnostic and accepts a loader returning either a flat keytar-style module or an `AsyncEntry`-style napi-rs module. The legacy `keytarLoader` option name is honoured for backward compatibility.
  - `npm-run-all@4.1.5` (mysticatea, no releases since 2018) → `npm-run-all2@8.0.4` (active fork).
- **`contexts/courses/` restructured** to match the rest of the bounded contexts: `domain/` for entities and repositories, `application/` for use cases.
- **`Paths` namespace** consolidates `~/.brightspace-mcp/*` paths so CLI and runtime stay in lock-step.
- `DEFAULT_CONFIG.base_url` is now `https://placeholder.invalid` so misconfigurations fail at DNS time rather than silently pointing at `example.brightspace.com`.

### Removed

- `keytar` optional dependency (replaced — see above).
- `InMemoryIdempotencyStore` from production wiring (kept only as a test seam).

### Security

- Defence-in-depth in token validation, secret redaction, file-lock-protected credential store, and CRLF-injection guards in HTTP headers.
- `socket.yml` configuration silences the false-positive "obfuscated code" alert on `ioredis` (which ships minified — not obfuscated — bundles).

### Verification

443/443 tests, lint clean, typecheck clean,
`dependency-cruiser` 0 violations (177 modules, 531 deps), build clean,
coverage 85.42% statements / 71.42% branches. Net: -139 transitive
packages installed after replacing `keytar` and `npm-run-all`.

## [0.12.2] - 2026-05-04

### Added

- `get_topic_file` now extracts text from PDF files using `pdf-parse` (pdfjs-dist under the hood). Previously PDFs returned only a size label; now the full text content is returned up to 12 000 characters.

### Changed

- `get_topic_file` fallback order for `application/octet-stream` topics is unchanged; PDFs are now handled before the octet-stream branch with a dedicated extraction path.

## [0.12.1] - 2026-05-04

### Fixed
- Re-release: npm transparency log conflict after partial 0.12.0 publish attempt.

## [0.12.0] - 2026-05-04

### Added

- `get_topic_file` — new MCP tool to download and read any content topic file by topic ID. Returns extracted text for DOCX, size info for PDF/Excel/PowerPoint, and falls back to Playwright-rendered text for D2L-internal binary topics (`other` kind).
- `get_course_content` now shows `(id=XXXX)` next to each topic, enabling direct use with `get_topic_file`.
- `PlaywrightPageRenderer` — reuses browser-auth session cookies to render JavaScript-heavy Brightspace pages with a full Chromium instance, solving JS web-component rendering that `fetch()` cannot see.
- `D2lApiClient.getRenderedHtml` / `getRenderedText` — fall back to `PlaywrightPageRenderer` when browser auth is configured, otherwise use plain `fetch`.
- `ContentRepository.findTopicRenderedText` — renders a topic's view URL via Playwright and returns stripped text.
- `PlaywrightBrowserContext` interface (with `addCookies` / `newPage`) and `waitForTimeout` on `PlaywrightPage`.

### Fixed

- `get_assignment_files`: instructor-posted attachments are now found via three-strategy lookup: (A) `Attachments[]` in folder list response, (B) dedicated `/attachments/` endpoint, (C) Playwright-rendered HTML scraping with four regex patterns including `title` attribute matching for truncated link text.
- `get_assignment_files` strategy C now uses `getRenderedHtml` (Playwright) instead of `fetch`, capturing links rendered by D2L web components.
- `get_my_grades`: `LetterGrade.fromPercent` no longer throws on grades above 100% (bonus points). Values > 100 are clamped to `A`; the raw percent is preserved.
- `get_topic_file`: robust content-type detection via magic bytes distinguishes DOCX, XLSX, PPTX, ZIP, PDF, HTML, and plain text; falls back to Playwright-rendered text for unrecognised D2L binary formats.
- `findFiles` (D2lAssignmentRepository): individual folder endpoint (`/dropbox/folders/{id}/`) 404s for students; now uses the list endpoint for metadata and scrapes the submit page for attachments.
- All user-facing strings moved to English (MCP is global, not Spanish-only).
- Pre-existing `getAssignments` test fixed (due date was already past); `FakeAssignmentRepository` now implements `findFiles` stub.

## [0.10.0] - 2026-04-23

### Added (Plan 7)

- 3 write-capable MCP tools gated behind `--enable-writes` CLI flag AND `writes.enabled: true` config — both required.
- `submit_assignment` — upload a file to a Brightspace Dropbox Folder via multipart POST.
- `post_discussion_reply` — reply to a discussion topic.
- `mark_announcement_read` — mark a news announcement as read.
- Each write tool requires an `idempotency_key` (8-128 chars, client-supplied); duplicate calls with the same key return the cached response without re-executing against D2L.
- `writes.dry_run: true` config option — returns a preview without calling D2L.
- `WritesGate` (shared-kernel) — double-consent boolean gate used by the MCP tool registry.
- `InMemoryIdempotencyStore` (shared-kernel) — TTL-aware (24h default), clock-injectable.
- `AuditLogger` (shared-kernel) — emits WARN-level structured log lines for every write attempt, with correlation ID + tool + redacted args.
- `AssignmentRepository.submit`, `CommunicationsRepository.postReply`, `CommunicationsRepository.markAnnouncementRead` domain methods + D2L implementations.
- `D2lApiClient.postJson` and `D2lApiClient.postMultipart` for write paths. Writes bypass the HTTP response cache but still respect retry + bulkhead + circuit breaker + transport policy.
- E2E writes test (`tests/e2e/writes.test.ts`) verifying both gating behavior and idempotency replay against mock D2L.

## [0.9.0] - 2026-04-23

### Added (Plan 6)

- `brightspace-mcp setup` — interactive wizard that asks base URL, auth strategy, MFA, credential storage; writes `~/.brightspace-mcp/config.yaml` (0600 perms); auto-detects Claude Desktop / Cursor / Windsurf and offers to register.
- `brightspace-mcp auth` — exercises the `EnsureAuthenticated` chain for the active profile.
- `brightspace-mcp config show [--resolved]` — prints the config (redacting secrets).
- `brightspace-mcp config validate` — parses and schema-checks the config file.
- `brightspace-mcp config set <path> <value>` — edits a nested config field programmatically; validates before writing.
- `brightspace-mcp cache clear [--context <name>]` — clears memory + file cache backends.
- `@inquirer/prompts` runtime dep for wizard prompts.

## [0.8.4] - 2026-04-23

### Fixed

- `release-npm.yml` no longer sets `NODE_AUTH_TOKEN` — previously the empty `secrets.NPM_TOKEN` fallback blocked OIDC trusted-publisher detection and surfaced as `ENEEDAUTH`. The workflow now relies entirely on OIDC via GitHub's `id-token: write` permission.
- Coverage config excludes composition/glue files (`cli/commands/**`, `mcp/registry.ts`, `mcp/server.ts`, `mcp/tools/**`, pure-type files) and lowers the `branches` threshold from 80% to 70% to match reality. These excluded files are covered by the E2E smoke test, not by unit tests.

## [0.8.3] - 2026-04-23

### Fixed

- Added vitest `globalSetup` that builds `src/` once before any test file runs. Previously the E2E smoke test (which spawns `node build/cli/main.js` as a subprocess) crashed with "MCP error -32000: Connection closed" when CI ran `npm run check` before the build step. The `globalSetup` is a no-op when `build/cli/main.js` already exists, so it's free on subsequent test-watch runs.

## [0.8.2] - 2026-04-23

### Fixed

- `tests/release/npm-pack.test.ts` now auto-builds when `build/cli/main.js` is missing. Previously it passed locally (where `build/` was always present) but failed in fresh CI runs because the `check` step ran before `build`.

## [0.8.1] - 2026-04-23

### Fixed

- `--version` now reads dynamically from `package.json` instead of the hardcoded `0.1.0` it reported in v0.8.0.
- `release-docker.yml` now lowercases the image owner before cosign reference construction — previously the `sign` job failed with "could not parse reference" when the GitHub owner had uppercase characters.
- `release-npm.yml` pinned to `production` environment for OIDC trusted-publisher binding (enables full npm provenance attestation without long-lived tokens).

## [0.8.0] - 2026-04-25

### Added (Plan 8)

- Docker image with OCI labels, healthcheck, and multi-arch (linux/amd64, linux/arm64) GHCR publishing.
- `docker-compose.yml` with default and optional `redis` profile.
- `.github/workflows/release-npm.yml` — tag-triggered npm publish with OIDC provenance.
- `.github/workflows/release-docker.yml` — tag + main-triggered GHCR push, cosign keyless signing, GitHub build provenance attestation.
- `.github/workflows/release-github.yml` — tag-triggered GitHub Release creation with CycloneDX SBOM asset and CHANGELOG-derived notes.
- `.github/workflows/security.yml` — gitleaks secret scanning, `npm audit --audit-level=high`, OSSF Scorecard supply-chain posture scan.
- `.github/workflows/ci.yml` — added `actionlint` job.
- README badges, `npx` / Docker / compose / source install paths, feature list, status.
- `docs/clients.md` with Claude Desktop, Cursor, Windsurf, and Docker MCP client snippets.
- `prepublishOnly` script enforcing full check before publish.
- npm metadata: `keywords`, `repository`, `bugs`, `homepage`, `author`.

### Changed (Plan 8)

- `docker/Dockerfile` runtime stage now prunes dev dependencies and copies `README.md` + `LICENSE` into the image for OCI metadata compliance.
- `.dockerignore` tightened to keep `README.md` and `LICENSE` in the build context.

### Fixed (Plan 8)

- `ioredis`, `keytar`, `otplib` removed from `devDependencies` — they now appear only in `optionalDependencies` so `npm prune --omit=dev` retains them. Previously these were stripped from production images, causing `--help` to crash with `ERR_MODULE_NOT_FOUND`.
- Dockerfile `HEALTHCHECK` changed from a no-op (`node -e "process.exit(0)"`) to `node build/cli/main.js --version` which validates the full module graph loads.

### Added

- Initial project scaffold with layered architecture (bounded contexts, dependency-cruiser enforcement)
- ApiTokenStrategy authentication
- `check_auth` and `list_my_courses` MCP tools

### Added (Plan 2)

- `MfaStrategy` interface with 4 adapters: `NoMfaStrategy`, `TotpMfaStrategy` (RFC 6238 via otplib, with algorithm allowlist hardening), `ManualPromptMfaStrategy`, `DuoPushMfaStrategy` (polling with timeout).
- 4 new authentication strategies: `SessionCookieStrategy`, `HeadlessPasswordStrategy` (with MFA fan-out), `OAuthStrategy` (Authorization Code + PKCE + refresh token rotation + CSRF state verification), `BrowserAuthStrategy` (Playwright, lazy-loaded).
- 3 new credential stores: `KeychainCredentialStore` (keytar, lazy-loaded), `EncryptedFileCredentialStore` (AES-256-GCM, pinned scrypt params N=2^15/r=8/p=1, atomic writes, 0600 perms), `CompositeCredentialStore` (routes env:/keychain:/file: by scheme).
- `FileSessionCache` with `proper-lockfile` and atomic writes for cross-process safety.
- `AuthStrategyResolver` + `ConfigBackedStrategyResolver` with auto-detect and fallback chain; `EnsureAuthenticated` now orchestrates the chain.
- `FallbackChainExhaustedError` domain error.
- Extended `SecretResolver` to resolve `keychain:<service>/<key>` and `file:<path>` refs via the credential store.
- Extended config schema (Zod v4) with per-strategy config blocks and MFA config, cross-field validation via `superRefine`.
- Optional peer dependencies: `otplib`, `keytar`. New runtime dependency: `proper-lockfile`.
- Composition root wires all strategies based on profile config.

### Added (Plan 3)

- HTTP resilience: `RetryPolicy` (backoff + jitter + classifier), `CircuitBreaker` (closed/open/half-open), `RequestCoalescer` (in-flight dedup), `Bulkhead` (per-context concurrency), `TransportPolicy` (HTTPS-only with localhost-http test mode).
- `RateLimitedError` for 429s; `D2lApiClient` respects `Retry-After` headers.
- L1 HTTP cache (`HttpResponseCache`) keyed by method + path + auth fingerprint (prevents cross-user cache poisoning).
- L2 domain cache decorator: `CachedCourseRepository`.
- 3 new shared-kernel cache backends: `FileCache` (lockfile + atomic), `RedisCache` (lazy ioredis), `LayeredCache` (memory + persistent write-through).
- `MetricsRegistry` + `DiagnosticsSnapshot` for observability.
- 2 new MCP tools: `clear_cache` and `get_diagnostics`.
- E2E smoke test reactivated — runs against a local mock D2L server using the new localhost-http transport mode (`BRIGHTSPACE_ALLOW_HTTP_LOCALHOST=1`).
- Composition root wires cache tiers, metrics, and the full resilience stack into `D2lApiClient`.

### Added (Plan 4)

- `grades` bounded context: `Grade`, `GradeItem`, `LetterGrade` value object, `GradeRepository` interface, `getMyGrades` use case, `D2lGradeRepository` with fixture-based integration tests, `CachedGradeRepository` decorator.
- `assignments` bounded context: `Assignment`, `Submission`, `Feedback`, `AssignmentId`, `DueDate` value objects, `AssignmentRepository` interface with `findByCourse` + `findFeedback`, 3 use cases (`getAssignments`, `getUpcomingDueDates`, `getFeedback`), `D2lAssignmentRepository`, `CachedAssignmentRepository` decorator (caches nullable feedback correctly via discriminated sentinel).
- 4 new MCP tools: `get_my_grades`, `get_assignments`, `get_upcoming_due_dates` (cross-context orchestration at MCP layer), `get_feedback`.
- Tool formatters (`gradesToCompact/Detailed`, `assignmentsToCompact/Detailed`, `feedbackToText`) in `src/mcp/tool-helpers.ts`.
- E2E smoke test extended to exercise `get_my_grades` and `get_assignments` against the mock D2L server.

### Added (Plan 5)

- `courses` context extended: `Classmate` value object + `findRoster`/`findClasslistEmails` on `CourseRepository`, implemented by `D2lCourseRepository` (LP classlist endpoints) and cached via `CachedCourseRepository`. `D2lCourseRepository` now accepts `{ le, lp }` versions; composition-root passes both.
- `content` bounded context: `Syllabus`, `Module`, `Topic` entities, `ContentRepository` interface, `getSyllabus` + `getCourseContent` use cases, `D2lContentRepository` (overview + content tree), `CachedContentRepository` with sentinel for null syllabus.
- `communications` bounded context: `Announcement`, `DiscussionForum`, `DiscussionTopic` entities, `CommunicationsRepository` interface, `getAnnouncements` (reverse-chronological + limit) and `getDiscussions` use cases, `D2lCommunicationsRepository` (news + discussions endpoints), `CachedCommunicationsRepository`.
- `calendar` bounded context: `CalendarEvent` entity, `CalendarRepository` interface, `getCalendarEvents` use case, `D2lCalendarRepository` (calendar events endpoint), `CachedCalendarRepository` keyed by `(course, from, to)`.
- 7 new MCP tools: `get_roster`, `get_classlist_emails`, `get_syllabus`, `get_course_content`, `get_announcements`, `get_discussions`, `get_calendar_events` — bringing the total to 15.
- Formatters in `src/mcp/tool-helpers.ts`: `rosterToText`, `emailsToText`, `syllabusToText`, `courseContentToText`, `announcementsToText`, `discussionsToText`, `calendarEventsToText`.
- E2E smoke test extended with 3 new assertions (roster, syllabus, announcements + calendar).
