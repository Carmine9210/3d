import { describe, expect, it } from 'vitest';
import { centsToDecimal, csvCell, toCsv } from '@/lib/csv';

describe('csv', () => {
  it('escape di separatori e virgolette', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('di "Mario"')).toBe('"di ""Mario"""');
    expect(csvCell(null)).toBe('');
  });
  it('blocca la formula injection ma lascia i numeri negativi', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('-12,50')).toBe('-12,50');
  });
  it('BOM, intestazione e importi italiani', () => {
    const out = toCsv(['a', 'b'], [[1, centsToDecimal(1999)]]);
    expect(out.startsWith('﻿a;b\r\n1;19,99')).toBe(true);
  });
});
