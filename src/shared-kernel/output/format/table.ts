function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  if (headers.length === 0 && rows.length === 0) return '';
  const head = `| ${headers.map(escapeCell).join(' | ')} |`;
  const sep = `|${headers.map(() => '---').join('|')}|`;
  const body = rows.map((r) => `| ${r.map(escapeCell).join(' | ')} |`).join('\n');
  return body.length === 0 ? `${head}\n${sep}` : `${head}\n${sep}\n${body}`;
}
