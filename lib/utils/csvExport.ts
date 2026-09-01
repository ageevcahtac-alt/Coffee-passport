// Generic CSV builder/download helper — RFC 4180 quoting, CRLF line
// endings, and a UTF-8 BOM (without it Excel mis-detects the encoding and
// mangles Cyrillic content, which is most of what this app exports).
const BOM = '﻿';

function escapeCsvField(field: string): string {
  if (/[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvField).join(','));
  return BOM + lines.join('\r\n');
}

export function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const csv = buildCsv(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
