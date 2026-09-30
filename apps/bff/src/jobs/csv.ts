/**
 * RFC 4180 CSV: CRLF line endings. A field holding a comma, quote or line break is quoted, with
 * its own quotes doubled.
 */
export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((fields) => fields.map(quote).join(',') + '\r\n').join('');
}

function quote(field: string): string {
  return /[",\r\n]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field;
}
