import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { z } from 'zod';

import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId.js';
import type { MySubmission, SubmittedFile } from '@/contexts/assignments/domain/MySubmission.js';
import { extractedToMcpContent, type McpContentBlock } from '@/mcp/file-content.js';
import { extractFileContent } from '@/shared-kernel/extract/extractFileContent.js';
import { expandPath } from '@/shared-kernel/path/expandPath.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export const getMySubmissionsSchema = z.object({
  course_id: z.number().int().positive(),
  assignment_id: z.number().int().positive(),
  submission_id: z.string().regex(/^\d+$/).optional()
    .describe('Only this submission (ids are listed by a call without it).'),
  file_name: z.string().min(1).optional()
    .describe('Read this submitted file (case-insensitive name); newest match wins.'),
  save_to: z.string().min(1).optional()
    .describe('Directory to save the selected files into. Without filters, saves the latest submission.'),
}).strict();

export interface GetMySubmissionsDeps { assignmentRepo: AssignmentRepository; }

type Selected = { submission: MySubmission; file: SubmittedFile };

const text = (t: string): { content: McpContentBlock[] } => ({ content: [{ type: 'text', text: t }] });

function formatSize(f: SubmittedFile): string {
  if (f.sizeBytes !== null) {
    const kb = f.sizeBytes / 1024;
    return kb < 1024 ? `${Math.max(1, Math.round(kb))} KB` : `${(kb / 1024).toFixed(1)} MB`;
  }
  return f.sizeLabel ?? '';
}

function formatDate(s: MySubmission): string {
  return s.submittedAt?.toISOString() ?? s.submittedAtLabel ?? 'unknown date';
}

function describe(subs: MySubmission[]): string {
  const lines = [`${subs.length} submission(s), newest first:`];
  for (const s of subs) {
    const by = s.submittedBy ? ` by ${s.submittedBy}` : '';
    lines.push(`\n## Submission ${s.id} — ${formatDate(s)}${by}`);
    if (s.comment) lines.push(`Comment: ${s.comment}`);
    if (s.files.length === 0) lines.push('- (no files)');
    for (const f of s.files) {
      const size = formatSize(f);
      lines.push(`- ${f.name}${size ? ` (${size})` : ''}`);
    }
  }
  return lines.join('\n');
}

/** Names come from D2L: keep only the last path segment so saves stay inside save_to. */
function safeFileName(name: string): string {
  const base = basename(name.replace(/\\/g, '/')).replace(/^\.+$/, '');
  return base || 'submission';
}

async function saveAll(deps: GetMySubmissionsDeps, courseId: OrgUnitId, dir: string, picked: Selected[]): Promise<string[]> {
  const saveDir = resolve(expandPath(dir));
  mkdirSync(saveDir, { recursive: true });
  const used = new Set<string>();
  const lines: string[] = [];
  for (const { submission, file } of picked) {
    let name = safeFileName(file.name);
    // Older submissions often reuse a name: prefix them instead of overwriting.
    if (used.has(name)) name = `${submission.id}-${name}`;
    used.add(name);
    try {
      const out = join(saveDir, name);
      writeFileSync(out, await deps.assignmentRepo.findFileBinary(courseId, file));
      lines.push(`[Saved to: ${out}]`);
    } catch (err) {
      lines.push(`[Save failed for ${file.name}: ${(err as Error).message}]`);
    }
  }
  return lines;
}

export async function handleGetMySubmissions(deps: GetMySubmissionsDeps, rawInput: unknown) {
  const input = getMySubmissionsSchema.parse(rawInput);
  const courseId = OrgUnitId.of(input.course_id);
  const all = await deps.assignmentRepo.findMySubmissions(courseId, AssignmentId.of(input.assignment_id));
  if (all.length === 0) return text('No submissions found for this assignment.');

  const subs = input.submission_id ? all.filter((s) => s.id === input.submission_id) : all;
  if (subs.length === 0) return text(`Submission ${input.submission_id} not found.\n\n${describe(all)}`);

  const wanted = input.file_name?.toLowerCase();
  const picked: Selected[] = subs
    .flatMap((submission) => submission.files.map((file) => ({ submission, file })))
    .filter(({ file }) => wanted === undefined || file.name.toLowerCase() === wanted);
  if (picked.length === 0) return text(`No submitted file named "${input.file_name}".\n\n${describe(subs)}`);

  const notes: string[] = [];
  if (input.save_to) {
    const filtered = input.submission_id !== undefined || wanted !== undefined;
    const toSave = filtered ? picked : picked.filter((p) => p.submission.id === subs[0]?.id);
    notes.push(...await saveAll(deps, courseId, input.save_to, toSave));
  }

  if (wanted === undefined) {
    const hint = '\n\nRead a file with file_name, or save files with save_to.';
    return text([describe(subs) + (input.save_to ? '' : hint), ...notes].join('\n\n'));
  }

  const first = picked[0] as Selected;
  const buf = await deps.assignmentRepo.findFileBinary(courseId, first.file);
  notes.unshift(`[Submission ${first.submission.id} — ${formatDate(first.submission)}]`);
  const extracted = await extractFileContent(buf, { filename: first.file.name });
  return { content: extractedToMcpContent(extracted, { notes }) };
}
