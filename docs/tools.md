# MCP tools reference

Inputs and example outputs for every tool exposed by the server. The full JSON Schema is sent to MCP clients automatically — this doc is the human-readable summary.

## Read tools (always available)

### `check_auth`
Verify the server can talk to Brightspace.

**Args:** none.
**Returns:** `Authenticated as <name>. Source: <strategy>. Expires in ~<n> min.`

### `list_my_courses`
List enrolled courses. Both formats show each course's `id` (needed by every other course tool).

**Args:**
- `active_only` *(boolean, default `true`)* — only current courses; `false` lists the full history with past courses tagged inactive.
- `format` *(`"compact" | "detailed"`, default `"compact"`)*
- `limit` *(integer, 1–200, default 50)*

D2L reports `IsActive: true` for every past enrollment and does not let students read course-offering or semester dates, so "current" is decided from the enrollment itself:

1. Access end date set → current if it has not passed (and the start is no more than 30 days away).
2. Only a start date → current if it started within the last ~6 months (or starts within 30 days).
3. No dates → current if you opened the course in the last 45 days, or its code shares a term token (5+ digits, e.g. `202620`) with a dated current course.

### `get_my_grades`
Final grades for a course.

**Args:** `course_id` *(integer)*, `format` *(`compact|detailed`)*.

### `get_assignments`
List Dropbox folders (assignments) for a course.

**Args:**
- `course_id` *(integer, required)*
- `include_past` *(boolean, default `false`)*
- `format` *(`compact|detailed`)*

Status is `submitted`, `not submitted`, or `status unavailable` — the last one when Brightspace refuses to disclose submissions (typical for group folders and closed folders), so the tool never claims "not submitted" without evidence. Folders with no due date but an availability end date show it as the close date.

The `detailed` format also shows, when present: open/close dates, points, whether the folder is a group assignment, allowed file types, link attachments, and the rubric name (use `get_assignment_rubric` for the full rubric).

### `get_upcoming_due_dates`
Cross-course view of what's coming due: assignments plus active quizzes whose due date (or close date) falls in the window, labeled `[quiz]` and sorted together.

**Args:**
- `days` *(integer 1–365, default 14)*
- `format` *(`compact|detailed`)*

All times are formatted in the timezone configured in `output.tz` (auto-detected from system if not set). ISO timestamps are included in the meta footer.

### `get_feedback`
Grade and instructor feedback for one assignment: score, overall comment, release date, and — when the folder has a rubric — the per-criterion rubric outcome (level, score, comment per criterion, plus overall rubric score and level). Says "not graded yet" when nothing has been released.

Sources: the folder's grade item (`/grades/{id}/values/myGradeValue`) and the rubric assessment (`/le/unstable/{ou}/assessment?assessmentType=Rubric…`, keyed by the `whoami` user id). If the rubric route is unavailable on a tenant, only the grade and comment are shown.

**Args:** `course_id`, `assignment_id`.

### `get_assignment_rubric`
The grading rubric attached to an assignment, rendered as one markdown table per criteria group (criteria × levels, each cell with points and the level description), plus the rubric's size, max points and overall levels.

**Args:** `course_id` *(integer)*, `assignment_id` *(integer)*.

### `get_my_submissions`
What you (or your group) turned in to an assignment, newest first: submission id, date, submitter, comment, and each file with its size. Works for open **and closed** folders: while a folder is open it reads `mysubmissions`; once it closes students get 403 there, so it reads the web UI submission history instead (`folders_history.d2l`, located through the folder list link).

- `file_name` returns the content of that submitted file (newest version; pick an older one with `submission_id`) — PDF, DOCX, XLSX, PPTX, text, images, etc.
- `save_to` downloads to a local directory. Without filters it saves only the latest submission; repeated names from older submissions are prefixed with their submission id instead of overwriting.

**Args:** `course_id` *(integer)*, `assignment_id` *(integer)*, `submission_id` *(string, optional)*, `file_name` *(string, optional)*, `save_to` *(directory, optional)*.

### `get_roster` / `get_classlist_emails`
Classmates and their emails.

**Args:** `course_id`.

### `get_syllabus`
The course overview (`GET /overview`) as plain text when the instructor published one.

**Args:** `course_id`.

Many instructors never publish the overview (it returns 404) and upload the syllabus into course content instead. In that case the tool says so explicitly (`Brightspace course overview not published (404 or empty description)`) and lists up to 5 likely places, best first, each with the exact call that reads it:

- topics or linked files whose **title or file name** contains a syllabus keyword (`syllabus`, `sílabo`, `programa del curso`, `programa`, `course outline`, `plan de curso`, `guía del curso`, `programme`, … — accents and case ignored, whole words only, so "programación" does not match) → `get_topic_file(course_id, topic_id)` / `get_course_file(course_id, path)`;
- links whose **anchor text** matches (e.g. "Programa Curso 2026-20" → `quickLink … type=coursefile` resolved to its `/content/enforced/…` path, "CHECK THE SYLLABUS HERE");
- documents linked from a module titled like a syllabus, and such modules themselves → `get_module(course_id, module_id)`;
- generic welcome/intro pages and modules ("Welcome", "Bienvenida", "Información general", "Presentación") as a last resort.

Links are read from module descriptions and from at most two small intro/syllabus HTML topics (downloaded to find the links); the syllabus file itself is **not** downloaded. Links into other courses are ignored; links to other sites (SharePoint, Drive) are listed as external. When nothing matches, the tool suggests `search_course` and `get_course_content`.

### `get_course_content`
Module tree with topics, loaded with a single `GET /content/toc` call. Use this to find topic IDs.

**Args:** `course_id`, `depth` *(0–5, default 2)*.

Each topic shows its real kind (`file`, `link`, `quiz`, `lti`, `dropbox`, `discussion`), its URL when it has one, and `[broken]` when Brightspace flags it as broken. Many courses keep their material in **module descriptions** rather than topics, so modules with a description also show a short excerpt (200 characters), up to 5 of the files/links it contains (session tokens stripped) and a `module_id=…` — call `get_module` for the full text and `get_course_file` for the linked `/content/enforced/...` files.

### `get_module`
One module in full: the complete description text, every link or embedded file (anchors, iframes, `<object>`/`<embed>` media), its topics and its submodules.

**Args:** `course_id`, `module_id` *(shown as `module_id=…` by `get_course_content`)*.

### `get_course_file`
Download and read a file stored in the course content area — the PDFs, slides and documents that HTML topics and module descriptions link or embed (`/content/enforced/{course_id}-…/file.pdf`).

**Args:**
- `course_id`, `path` *(both required)* — the path exactly as shown by `get_course_content`, `get_module` or `get_topic_file`. A full URL on your Brightspace host is accepted too.
- `topic_id` *(optional)* — the HTML topic a **relative** link came from; the link is resolved against that topic's folder.
- `save_to` *(optional)* — also write the raw file to disk.

Only files of that same course are served: other courses' folders, other hosts, `..`/encoded traversal and non-`/content/enforced/` paths are refused with an error. Uses the same text extraction as `get_topic_file`. If Brightspace answers with an HTML page instead of the requested binary (typically an expired session), an explicit error is returned.

### `get_announcements`
News feed: pinned announcements first, then newest first. Each entry shows its `id`, date, author, a ~300 character excerpt (HTML entities decoded; when cut it says so and gives the `get_announcement` call for the full text) and its attachments (name, size, `attachment_id`). Hidden announcements are not shown.

**Args:**
- `course_id` *(integer, required)*
- `limit` *(integer, 1–200, default 10)* — D2L returns all of a course's announcements in one response; the header says "showing N of M" when `limit` cuts the list.

The author comes from the course classlist (announcements only carry the author's user id). If the classlist is unavailable, or the instructor hid author info, no author is shown.

### `get_announcement`
One announcement in full: body as readable text (paragraphs and list items on their own lines, links kept as `label (url)`), plus its attachments.

**Args:**
- `course_id` *(integer, required)*
- `announcement_id` *(integer, required)* — from `get_announcements`
- `attachment_id` *(integer, optional)* — return that attachment's content instead (PDF, Office, text… extracted like `get_topic_file`; images as image content). Downloaded from `/d2l/api/le/{v}/{ou}/news/{id}/attachments/{fileId}`.
- `save_to` *(string, optional, requires `attachment_id`)* — also save the attachment to this file path.

### `get_discussions`
Forum threads.

**Args:** `course_id`, `topic_id` *(optional — list forums if omitted)*.

### `get_calendar_events`
Course calendar items visible to you (lectures, exams, due dates, content releases) from now through the next N days.

**Args:**
- `course_id` *(integer, required)*
- `days` *(integer 1–365, default 30)*

**Returns:** events sorted by start time, formatted in the configured `output.tz`/`output.locale`. All-day events show a date only; location and a short plain-text description (HTML stripped) are included when set. Uses `calendar/events/myEvents/` (paged) and falls back to `calendar/events/` on older tenants.

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

**What comes back, by format:**

| Format | Result |
|---|---|
| PDF | Text (line breaks kept) |
| DOCX, XLSX/XLSM, PPTX | Text — detected from the zip central directory or the topic URL extension; PPTX in slide order |
| HTML topic | Readable text; relative links resolved to `/content/enforced/...` paths usable with `get_course_file`; embedded iframes/media listed |
| Plain text, CSV, JSON | Text with newlines preserved (JSON pretty-printed) |
| Jupyter `.ipynb` | Markdown cells + fenced code cells (outputs omitted) |
| PNG / JPEG / GIF / WebP | MCP `image` content (inline up to 4 MB) |
| Audio / video / unknown binaries | Metadata only (type and size) — use `save_to` |
| ZIP | List of entries |

Text is capped at 40,000 characters and the response says so when it was truncated. Link, quiz-quicklink and LTI topics return their URL and a hint instead of a file; broken topics return an explicit message. The browser-rendered page is only used as a fallback for HTML topics without extractable text.

### `get_my_groups`
List the groups you're enrolled in for a course, with member names.

**Args:** `course_id`.
**Returns:** per-category, the group name + member display names + usernames where available.

Useful for "who's in my group?" or finding the right `grpid` for a manual UI URL.

### `list_quizzes`
List every quiz in a course (all pages) with attempts allowed, time limits, and open/due/close dates.

**Args:** `course_id`, `format` *(`compact|detailed`)*.
**Returns:** compact: name, due (or close) date, attempts allowed. Detailed adds opens/due/closes, enforced time limit, and a plain-text instructions snippet. Inactive quizzes are tagged `[inactive]`. Dates use the configured `output.tz`/`output.locale`.

The D2L quiz list does not include how many attempts *you* have used, and the attempts endpoint is normally forbidden to students, so the tool shows "N attempts allowed" rather than a guessed "0 taken".

⚠️ Read-only by design — quiz questions and answer keys are NOT exposed even if the API permits it. Quiz integrity matters.

### `get_quiz_attempts`
Your attempts on a single quiz with scores and submission status.

**Args:** `course_id`, `quiz_id`.
**Returns:** per-attempt score, percent (when the total is known), submission status, start/complete times in the configured timezone.

D2L gates this endpoint behind the `Quizzing.GradeAttempts` permission. Most student accounts get a 403; the tool then returns an explanation pointing to `get_my_grades` instead of an error.

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
Ranked full-text search across content modules (titles, **module description text** and topic titles), announcements, and discussion forums for a single course. In-memory term-frequency scoring.

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
| brightspace-content-topic | `brightspace://{courseId}/content/topics/{topicId}` | `text/plain` extracted with the shared extractor (PDF, Office, HTML, text), images as blobs, base64 fallback when there is no text (e.g. scanned PDFs) |
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
