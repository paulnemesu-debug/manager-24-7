import { describe, expect, it } from 'vitest';
import { csvToGrid, gridToCsv, escapeOperationsHtml, validateOperationsGrid, validateOperationsArchive } from './operations-transfer';

describe('operations interchange', () => {
  it('reads Romanian decimal commas, BOM, quoted delimiters and embedded newlines', () => {
    expect(csvToGrid('\ufeffutilaj;cost;note\r\n"Frigider; 1";12,50;"prima\na doua"')).toEqual([
      ['utilaj', 'cost', 'note'], ['Frigider; 1', '12,50', 'prima\na doua'],
    ]);
  });
  it('detects comma and tab outside quotes', () => {
    expect(csvToGrid('name,cost\n"a;b;c",12')).toEqual([['name', 'cost'], ['a;b;c', '12']]);
    expect(csvToGrid('name\tcost\na\t12')).toEqual([['name', 'cost'], ['a', '12']]);
  });
  it('rejects malformed quotes and nonrectangular data', () => {
    expect(() => csvToGrid('a;b\n"unterminated;b')).toThrow();
    expect(() => csvToGrid('a;b\n"x"tail;b')).toThrow();
    expect(() => validateOperationsGrid([['a','b'],['c','d','e']])).toThrow();
  });
  it('neutralizes spreadsheet formulas while restoring text on reimport', () => {
    const grid = [['name','notes'], ['=HYPERLINK("https://example.invalid")', '+SUM(1)'], ["'=already", '  @x'], ['a\nb', '"quoted"']];
    const csv = gridToCsv(grid);
    expect(csv).toContain("'=HYPERLINK");
    expect(csvToGrid(csv)).toEqual(grid);
  });
  it('handles zeros and fractions without converting invalid numbers', () => {
    expect(csvToGrid(gridToCsv([['n','flag'],[0,true],[1.25,false]]))).toEqual([['n','flag'],['0','true'],['1.25','false']]);
    expect(() => gridToCsv([[NaN]])).toThrow();
    expect(() => validateOperationsGrid([[Infinity]] )).toThrow();
  });
  it('bounds grid size and escapes every HTML attribute delimiter', () => {
    expect(() => validateOperationsGrid([Array(81).fill('x')])).toThrow();
    expect(escapeOperationsHtml('<img src="x" onerror=\'bad\'>&')).toBe('&lt;img src=&quot;x&quot; onerror=&#39;bad&#39;&gt;&amp;');
  });
  it('rejects non-ZIP and oversized expanded archives before XLSX parsing', () => {
    expect(() => validateOperationsArchive(new Uint8Array([1,2,3]))).toThrow();
    const zip = new Uint8Array(68); const view = new DataView(zip.buffer);
    view.setUint32(0,0x02014b50,true); view.setUint32(24,40*1024*1024,true);
    view.setUint32(46,0x06054b50,true); view.setUint16(56,1,true); view.setUint32(58,46,true); view.setUint32(62,0,true);
    expect(() => validateOperationsArchive(zip)).toThrow();
  });
});
