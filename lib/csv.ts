/** CSV per Excel italiano: separatore ";" , BOM UTF-8, protezione da formula injection. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Celle che iniziano con = + - @ (o tab/CR) verrebbero eseguite come formule da Excel.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Importo in euro con virgola decimale (formato italiano, senza simbolo). */
export function centsToDecimal(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toFixed(2).replace('.', ',');
}
