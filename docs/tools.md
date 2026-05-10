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

⚠️ **All times are UTC.** The tool emits a warning footer reminding LLMs to convert to local before answering "due tomorrow"-type questions.

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
- `filename` *(string)*
- `content_base64` *(string — base64 of file bytes, max ~50 MB)*
- `mime_type` *(string, optional — e.g. `application/zip`)*
- `idempotency_key` *(string, 8–128 chars)*

**Returns:** `Submitted <filename> — submissionId <id> at <iso> (cid=<correlation>)`.

### `post_discussion_reply`
Reply to a discussion topic.

**Args:** `course_id`, `topic_id`, `parent_post_id` *(string|null)*, `html`, `idempotency_key`.

### `mark_announcement_read`
Mark an announcement as read.

**Args:** `course_id`, `announcement_id`.

---

## Output format conventions

- **Dates** are emitted as ISO-8601 with `Z` suffix (UTC). The `get_upcoming_due_dates` and `get_assignments` tools append a UTC warning footer.
- **IDs** are emitted as integers in tool output but the schemas accept either integer or string — both are coerced.
- **Compact format** is one line per record; `detailed` adds nested fields.
- **Errors** are returned as plain text in `content[0].text` prefixed with `Error: …` rather than throwing, so the LLM can react.
