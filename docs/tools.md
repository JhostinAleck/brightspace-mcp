# MCP tools reference

Inputs and example outputs for every tool exposed by the server. The full JSON Schema is sent to MCP clients automatically — this doc is the human-readable summary.

## Read tools (always available)

### `check_auth`
Verify the server can talk to Brightspace.

**Args:** none.
**Returns:** `Authenticated as <name>. Source: <strategy>. Expires in ~<n> min.`

### `list_my_courses`
List enrolled courses.

**Args:**
- `active_only` *(boolean, default `true`)*
- `format` *(`"compact" | "detailed"`, default `"compact"`)*
- `limit` *(integer, 1–200, default 50)*

### `get_my_grades`
Final grades for a course.

**Args:** `course_id` *(integer)*, `format` *(`compact|detailed`)*.

### `get_assignments`
List Dropbox folders (assignments) for a course.

**Args:**
- `course_id` *(integer, required)*
- `include_past` *(boolean, default `false`)*
- `format` *(`compact|detailed`)*

### `get_upcoming_due_dates`
Cross-course view of what's coming due.

**Args:**
- `days` *(integer 1–365, default 14)*
- `format` *(`compact|detailed`)*

All times are formatted in the timezone configured in `output.tz` (auto-detected from system if not set). ISO timestamps are included in the meta footer.

### `get_feedback`
Submission feedback (score + comments).

**Args:** `course_id`, `assignment_id`.

### `get_roster` / `get_classlist_emails`
Classmates and their emails.

**Args:** `course_id`.

### `get_syllabus`
Course syllabus (parsed from D2L's first-content-topic heuristic).

**Args:** `course_id`.

### `get_course_content`
Module tree with topics. Use this to find topic IDs.

**Args:** `course_id`, `depth` *(0–5, default 2)*.

### `get_announcements`
News feed.

**Args:** `course_id`, `limit`.

### `get_discussions`
Forum threads.

**Args:** `course_id`, `topic_id` *(optional — list forums if omitted)*.

### `get_calendar_events`
Course calendar items.

**Args:** `course_id`, `from_date`, `to_date`.

### `get_assignment_files`
Download and read attachments posted on an assignment (instructions, templates).

**Args:** `course_id`, `assignment_id`.
**Returns:** Extracted text for DOCX/XLSX/PDF; size info for binaries.

### `get_topic_file`
Download a single content topic file. Returns extracted text and optionally saves the binary to disk.

**Args:**
- `course_id`, `topic_id` *(both required)*
- `save_to` *(string, optional — `~/...`, `%VAR%\...`, or absolute path)*

If `save_to` is provided, the raw file binary is also written to disk and the response includes `[Saved to: /abs/path]`.

### `get_my_groups`
List the groups you're enrolled in for a course, with member names.

**Args:** `course_id`.
**Returns:** per-category, the group name + member display names + usernames where available.

Useful for "who's in my group?" or finding the right `grpid` for a manual UI URL.

### `list_quizzes`
List quizzes for a course with attempt counts, time limits, close dates.

**Args:** `course_id`, `format` *(`compact|detailed`)*.
**Returns:** newest-first list with attempts taken, attempts remaining, due date.

⚠️ Read-only by design — quiz questions and answer keys are NOT exposed even if the API permits it. Quiz integrity matters.

### `get_quiz_attempts`
Your attempts on a single quiz with scores and submission status.

**Args:** `course_id`, `quiz_id`.
**Returns:** per-attempt score, percent, submission status, start/complete timestamps.

### `clear_cache`
Drop cached responses to force re-fetch.

**Args:** `scope` *(`all|http|courses|grades|assignments|content|communications|calendar`, default `all`)*.

### `get_audit_log`
Local NDJSON audit history of write attempts (`submit_assignment`, `post_discussion_reply`, `mark_announcement_read`). Read-only — no writes-gate required.

**Args:**
- `tool` *(string, optional)* — filter by tool name
- `since` *(ISO timestamp, optional)*
- `limit` *(integer 1–500, default 100)*

**Returns:** newest-first list of attempts with timestamp, correlation ID, redacted args.

The log lives at `~/.brightspace-mcp/audit.log` (mode 0600). Secret-shaped fields are pre-redacted before being written.

### `list_notifications`
User activity feed — due-date reminders, grade releases, announcement posts.

**Args:**
- `unread_only` *(boolean, default `false`)*
- `limit` *(integer 1–100, default 25)*

### `search_course`
Ranked full-text search across content modules, announcements, and discussion forums for a single course. In-memory term-frequency scoring.

**Args:**
- `course_id` *(integer, required)*
- `query` *(string, required)*
- `scope` *(`all|content|announcements|discussions`, default `all`)*
- `limit` *(integer, default 20)*

### `get_diagnostics`
JSON report on server state — profile, base URL, discovered API versions, cache hit/miss counters, HTTP timings.

**Args:** none.

---

## Write tools (gated behind `writes.enabled` + `--enable-writes`)

→ See [writes.md](./writes.md) for how to enable.

### `submit_assignment`
Upload a file to a Brightspace Dropbox folder.

**Args:**
- `course_id` *(string)*
- `folder_id` *(string — assignment ID)*
- `file_path` *(string, optional — `~/...`, `%VAR%\...`, or absolute path; preferred for files > 1 MB — server reads from disk, avoids base64 token cost)*
- `filename` *(string — required when using `content_base64`; optional with `file_path`, defaults to basename)*
- `content_base64` *(string, optional — base64 of file bytes, max ~50 MB; use when file is not on disk)*
- `mime_type` *(string, optional — e.g. `application/zip`)*
- `idempotency_key` *(string, 8–128 chars)*

Provide either `file_path` **or** `content_base64` — not both.

**Returns:** `Submitted <filename> — submissionId <id> at <iso> (cid=<correlation>)`.

### `post_discussion_reply`
Reply to a discussion topic.

**Args:** `course_id`, `topic_id`, `parent_post_id` *(string|null)*, `html`, `idempotency_key`.

### `mark_announcement_read`
Mark an announcement as read.

**Args:** `course_id`, `announcement_id`.

---

## Output format conventions

- **Dates** are emitted in the timezone configured under `output.tz` (auto-detected from system if not set). ISO timestamps are included in the meta footer. The `output.format: markdown` default renders headers and tables for better LLM readability.
- **IDs** are emitted as integers in tool output but the schemas accept either integer or string — both are coerced.
- **Compact format** is one line per record; `detailed` adds nested fields.
- **Errors** are returned as plain text in `content[0].text` prefixed with `Error: …` rather than throwing, so the LLM can react.

---

## MCP Resources

In addition to tools, the server exposes Brightspace content as MCP Resources with stable `brightspace://` URIs. Resources can be read by any MCP client via `resources/read`.

| Resource name | URI pattern | Returns |
|---|---|---|
| brightspace-syllabus | `brightspace://{courseId}/syllabus` | `text/plain` — HTML stripped, date formatted |
| brightspace-content-topic | `brightspace://{courseId}/content/topics/{topicId}` | `text/plain` from pdf-parse, or `application/pdf` base64 fallback |
| brightspace-assignment-files | `brightspace://{courseId}/assignments/{assignmentId}/files` | All attachments as text (one per file) |
| brightspace-announcement | `brightspace://{courseId}/announcements/{announcementId}` | `text/plain` — HTML stripped |

Use IDs from tools (`list_my_courses` → courseId, `get_assignments` → assignmentId, etc.) to construct URIs.

## MCP Prompts

Four pre-built prompt templates visible in the MCP client's prompt picker:

| Prompt | Arguments | Description |
|---|---|---|
| `weekly_briefing` | none | Ask the LLM for a 7-day briefing using available tools |
| `grade_audit` | `course_id?` (int, optional) | Grade analysis and pass-rate projection |
| `study_planner` | `days_ahead?` (int, default 7) | Study plan based on due dates and calendar |
| `course_summary` | `course_id` (int, required) | Full course overview: syllabus, content, assignments, grades |

Prompts return a pre-filled `user` message that guides the LLM to use the available tools.
