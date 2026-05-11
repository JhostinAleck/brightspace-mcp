export type Heading = 1 | 2 | 3 | 4 | 5 | 6;

const escapeChars = /[\\`*_{}\[\]()#+\-.!|>]/g;

export const markdown = {
  h1: (t: string) => `# ${t}`,
  h2: (t: string) => `## ${t}`,
  h3: (t: string) => `### ${t}`,
  h4: (t: string) => `#### ${t}`,
  h5: (t: string) => `##### ${t}`,
  h6: (t: string) => `###### ${t}`,
  heading: (level: Heading, t: string) => `${'#'.repeat(level)} ${t}`,
  bold: (t: string) => `**${t}**`,
  italic: (t: string) => `_${t}_`,
  code: (t: string) => `\`${t}\``,
  codeBlock: (lang: string, t: string) => `\`\`\`${lang}\n${t}\n\`\`\``,
  link: (label: string, url: string) => `[${label}](${url})`,
  blockquote: (t: string) => t.split('\n').map((l) => `> ${l}`).join('\n'),
  escape: (t: string) => t.replace(escapeChars, (c) => `\\${c}`),
} as const;

export type MarkdownPrimitives = typeof markdown;
