function formatItem(prefix: string, item: string): string {
  const lines = item.split('\n');
  const head = `${prefix}${lines[0]}`;
  const indent = ' '.repeat(prefix.length);
  const rest = lines.slice(1).map((l) => `${indent}${l}`);
  return [head, ...rest].join('\n');
}

export function bulletList(items: readonly string[]): string {
  if (items.length === 0) return '';
  return items.map((i) => formatItem('- ', i)).join('\n');
}

export function numberedList(items: readonly string[]): string {
  if (items.length === 0) return '';
  return items.map((i, idx) => formatItem(`${idx + 1}. `, i)).join('\n');
}
