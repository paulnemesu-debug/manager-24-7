import { expect, it } from 'vitest';
import { createExcelWorkbook, workbookToBlob } from '@/lib/excel-workbook';
import { parsePriceList } from '@/lib/price-import';
import { parseSalesFile } from '@/lib/sales-import';
import { parseConsumptionFile } from '@/lib/consumption-import';
import { parseHaccpAutocontrolImport } from '@/lib/haccp-autocontrol-import';
import { splitLocalDateTime } from '@/lib/local-date-time';

it('finds the price table after a parameter sheet in an actual multi-sheet XLSX', async () => {
  const file = await workbookToBlob(createExcelWorkbook([
    { name: 'Parametri', rows: [['TVA', 11]] },
    { name: 'Catalog', rows: [['Denumire', 'Pret', 'UM'], ['Brânză QA', 12.5, 'kg']] },
  ]));
  const rows = await parsePriceList(await file.arrayBuffer());
  expect(rows).toEqual([{ name: 'Brânză QA', price: 12.5, unit: 'kg', notes: null, rowNumber: 2 }]);
});
it('imports fractional sales from an actual XLSX without inflating decimal quantities', async () => {
  const file = await workbookToBlob(createExcelWorkbook([{ name: 'Vânzări', rows: [['Preparat', 'Cantitate vândută'], ['Ciorbă QA', 12.5]] }]));
  expect(await parseSalesFile(await file.arrayBuffer())).toEqual([{ name: 'Ciorbă QA', sold: 12.5, rowNumber: 2 }]);
});
it('imports consumption units and quantities from an actual XLSX', async () => {
  const file = await workbookToBlob(createExcelWorkbook([{ name: 'Consum', rows: [['Ingredient', 'Cantitate', 'UM'], ['Făină QA', 2.5, 'kg']] }]));
  expect((await parseConsumptionFile(await file.arrayBuffer()))[0]).toMatchObject({ name: 'Făină QA', quantity: 2.5, unit: 'kg' });
});
it('imports dated HACCP autocontrol and reminder times from an actual XLSX', async () => {
  const file = await workbookToBlob(createExcelWorkbook([{ name: 'Autocontrol', rows: [
    ['Tip', 'Denumire', 'Data', 'Ora', 'Data reamintire', 'Ora reamintire'],
    ['Probe alimentare', 'Probă QA', '2026-10-05', '11:30', '2026-10-04', '17:00'],
  ] }]));
  const [event] = await parseHaccpAutocontrolImport(await file.arrayBuffer(), 'qa.xlsx');
  expect(event.controlType).toBe('food_sample');
  expect(splitLocalDateTime(event.scheduledAt)).toEqual({ date: '2026-10-05', time: '11:30' });
  expect(splitLocalDateTime(event.reminderAt!)).toEqual({ date: '2026-10-04', time: '17:00' });
});
it('rejects invalid XLSX bytes instead of inventing import rows', async () => {
  const bytes = new TextEncoder().encode('not-an-xlsx').buffer;
  for (const parse of [parsePriceList, parseSalesFile, parseConsumptionFile]) await expect(parse(bytes)).rejects.toThrow();
});
