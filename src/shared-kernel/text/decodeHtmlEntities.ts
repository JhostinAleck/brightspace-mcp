const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  iexcl: '¡', iquest: '¿', laquo: '«', raquo: '»', middot: '·', hellip: '…',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ',
  auml: 'ä', euml: 'ë', iuml: 'ï', ouml: 'ö', uuml: 'ü', Uuml: 'Ü', ccedil: 'ç',
};

function fromCodePointSafe(code: number, raw: string): string {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : raw;
}

/**
 * Decodes named, decimal and hex HTML entities in a single pass, so an
 * escaped entity like `&amp;lt;` becomes the literal text `&lt;` instead of
 * being double-decoded into `<`. Unknown entities are left untouched.
 */
export function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (raw, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) return fromCodePointSafe(parseInt(body.slice(2), 16), raw);
    if (body.startsWith('#')) return fromCodePointSafe(parseInt(body.slice(1), 10), raw);
    return NAMED[body] ?? raw;
  });
}
