import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import readXlsxFile from 'read-excel-file/universal';

const state = vi.hoisted(() => ({ os: 'android', available: true, files: new Map<string, string | Uint8Array>(), shared: [] as string[], html: [] as string[], downloads: [] as { name: string; data: BlobPart }[] }));
vi.mock('react-native', () => ({ Platform: { get OS() { return state.os; } } }));
vi.mock('expo-file-system', () => ({ Paths: { cache: 'file:///qa-cache' }, File: class {
  uri: string;
  constructor(...parts: string[]) { this.uri = parts.join('/'); }
  get exists() { return state.files.has(this.uri); }
  create() { state.files.set(this.uri, ''); }
  delete() { state.files.delete(this.uri); }
  write(value: string | Uint8Array) { state.files.set(this.uri, value); }
  copy(target: { uri: string }) { state.files.set(target.uri, state.files.get(this.uri) ?? 'PDF-adapter'); }
  async base64() { return 'iVBORw0KGgo='; }
} }));
vi.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ uri: 'data:image/png;base64,iVBORw0KGgo=', localUri: null, downloadAsync: async () => undefined }) } }));
vi.mock('expo-print', () => ({
  printToFileAsync: async ({ html }: { html: string }) => { state.html.push(html); return { uri: 'file:///qa-print.pdf' }; },
  printAsync: async ({ html }: { html: string }) => { state.html.push(html); },
}));
vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => state.available, shareAsync: async (uri: string) => { state.shared.push(uri); } }));
vi.mock('@/lib/web-download', () => ({ downloadWebFile: (data: BlobPart, name: string) => { state.downloads.push({ name, data }); } }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getAllKeys: async () => [], multiGet: async () => [] } }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: true, supabase: null }));

import { HACCP_FORMS } from '@/constants/haccp-forms';
import { translate } from '@/i18n/translations';
import { demoRecipes } from '@/lib/demo-data';
import { createEmptyIngredient, createEmptyRecipe, calculateRecipeTotals } from '@/lib/calculations';
import { calculateRecipeNutrition } from '@/lib/nutrition';
import { createFormatters } from '@/lib/format';
import { exportRecipeExcel, exportRecipePdf, exportCookbookExcel, exportCookbookPdf, exportAllergenMenuPdf } from '@/lib/recipe-export';
import { exportHrExcel, exportHrPdf } from '@/lib/hr-export';
import { exportHaccpDocumentPdf, exportHaccpControlPackPdf } from '@/lib/haccp-export';
import { exportWastePlanPdf, exportRedistributionPdf, exportWasteDossierPdf } from '@/lib/waste-compliance-export';
import { exportAccountData } from '@/lib/account-export';
import type { HaccpDocument } from '@/types/haccp';
import type { HrEmployee, HrShift } from '@/types/hr';
import type { WastePreventionPlan } from '@/types/waste-compliance';

const context = { locale: 'ro' as const, t: (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('ro', key, params), format: createFormatters('ro'), userEmail: 'qa@example.test', pricesDate: '2026-10-04T10:00:00Z', plan: 'pro' as const };
const recipe = { ...demoRecipes[0], title: 'Rețetă QA <script> & test' };
const employee: HrEmployee = { id: 'qa-employee', name: 'Angajat QA', role: 'Bucătar', locationId: null, locationName: 'Locație QA', grossSalary: 6000, netSalary: 3600, active: true, createdAt: '2026-10-01', updatedAt: '2026-10-04' };
const shift: HrShift = { id: 'qa-shift', employeeId: employee.id, workDate: '2026-10-03', plannedStart: '08:00', plannedEnd: '16:00', actualStart: '08:15', actualEnd: '16:45', status: 'present', notes: '', updatedAt: '2026-10-04' };
const documentFor = (formCode: string): HaccpDocument => ({ id: 'qa-document', formCode, headerValues: { location: 'Locație QA', month: '10', year: '2026', period: '10/2026' }, rows: [], syncState: 'local', createdAt: '2026-10-04T10:00:00Z', updatedAt: '2026-10-04T10:00:00Z' });
const plan: WastePreventionPlan = { id: 'qa-plan', locationId: null, reportingYear: 2026, companyName: 'Companie QA', companyTaxId: 'QA-TEST', companyAddress: 'Adresă QA', companyAuthorization: 'QA', companyPhone: '', companyEmail: 'qa@example.test', legalRepresentative: 'Responsabil QA', responsiblePerson: 'Operator QA', measures: ['fifo'], objectives: 'Date exclusiv pentru simulare', status: 'draft', submittedAt: null, updatedAt: '2026-10-04', syncState: 'local' };
function evidence(name: string, data: string | Uint8Array) {
  if (!process.env.MANAGER_QA_OUTPUT) return;
  const directory = join(process.env.MANAGER_QA_OUTPUT, 'export-evidence');
  mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, name), data);
}
beforeEach(() => { state.os = 'android'; state.available = true; state.files.clear(); state.shared = []; state.html = []; state.downloads = []; });
afterEach(() => vi.unstubAllGlobals());

const BrowserBlob = globalThis.Blob;
function restrictNativeRuntime() {
  vi.stubGlobal('Blob', class extends BrowserBlob {
    constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
      if (parts.some(part => part instanceof ArrayBuffer || ArrayBuffer.isView(part))) {
        throw new Error("Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported");
      }
      super(parts, options);
    }
  });
  vi.stubGlobal('Worker', class { constructor() { throw new Error('Workers are unavailable in React Native'); } });
}

it.each(['android', 'ios'])('%s exports recipe, cookbook and HR without binary Blobs or Workers', async os => {
  state.os = os;
  restrictNativeRuntime();
  const nativeBlob = globalThis.Blob;
  await Promise.all([
    exportRecipeExcel(recipe, context),
    exportCookbookExcel([recipe, demoRecipes[1]], context),
    exportHrExcel([employee], [shift], '2026-10', 'Locație QA'),
  ]);
  expect(globalThis.Blob).toBe(nativeBlob);
  expect(state.shared).toHaveLength(3);
  // Reopen the saved bytes with the desktop reader after native export completes.
  vi.unstubAllGlobals();
  for (const uri of state.shared) {
    const bytes = state.files.get(uri) as Uint8Array;
    const sheets = await readXlsxFile(new BrowserBlob([new Uint8Array(bytes)]));
    if (uri.includes('pontaj')) {
      expect(JSON.stringify(sheets)).toContain(employee.name);
      expect(JSON.stringify(sheets)).toContain('08:15');
      const archive = unzipSync(bytes);
      const logos = Object.entries(archive).filter(([name]) => name.startsWith('xl/media/'));
      expect(logos.length).toBeGreaterThan(0);
      for (const [, data] of logos) expect(Array.from(data.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      const drawings = Object.entries(archive).filter(([name]) => /^xl\/drawings\/drawing\d+\.xml$/.test(name));
      expect(drawings.length).toBeGreaterThan(0);
      for (const [name, data] of drawings) {
        const xml = new TextDecoder().decode(data);
        expect(xml).toContain('<xdr:col>0</xdr:col>');
        expect(xml).toContain('<xdr:row>0</xdr:row>');
        expect(xml).not.toMatch(/<xdr:(?:row|col)>-\d/);
        const relations = new TextDecoder().decode(archive[name.replace('xl/drawings/', 'xl/drawings/_rels/') + '.rels']);
        expect(relations).toContain('/image');
        expect(relations).toContain('../media/');
      }
    } else expect(JSON.stringify(sheets)).toContain(recipe.title);
  }
});

it('exports a large cookbook without a Worker and preserves the last recipe', async () => {
  restrictNativeRuntime();
  const recipes = Array.from({ length: 100 }, (_, index) => ({ ...recipe, id: `large-${index}`, title: `Rețetă mare ${index}` }));
  await exportCookbookExcel(recipes, context);
  vi.unstubAllGlobals();
  const bytes = state.files.get(state.shared[0]) as Uint8Array;
  const archive = unzipSync(bytes);
  expect(Object.values(archive).some(data => data.length > 160_000)).toBe(true);
  const sheets = await readXlsxFile(new BrowserBlob([new Uint8Array(bytes)]));
  expect(JSON.stringify(sheets)).toContain('Rețetă mare 99');
});

it('native recipe, cookbook and allergen PDFs use safe names and generated content', async () => {
  await exportRecipePdf(recipe, context); await exportCookbookPdf([recipe], context); await exportAllergenMenuPdf([recipe], context);
  expect(state.shared).toHaveLength(3); expect(state.shared[0]).toMatch(/reteta-qa-script-test-food-cost\.pdf$/);
  expect(state.html[0]).not.toContain('<script>'); expect(state.html[0]).toContain('&lt;script&gt;');
  ['recipe', 'cookbook', 'allergens'].forEach((name, i) => evidence(`${name}.html`, state.html[i]));
});
it('writes actual recipe and cookbook XLSX files that can be reopened', async () => {
  await exportRecipeExcel(recipe, context); await exportCookbookExcel([recipe, demoRecipes[1]], context);
  expect(state.shared).toHaveLength(2);
  for (const [index, uri] of state.shared.entries()) {
    const bytes = state.files.get(uri) as Uint8Array; expect(bytes[0]).toBe(0x50); expect(bytes[1]).toBe(0x4b);
    const rows = await readXlsxFile(new Blob([new Uint8Array(bytes)]));
    expect(JSON.stringify(rows)).toContain(recipe.title);
    evidence(index ? 'cookbook.xlsx' : 'recipe.xlsx', bytes);
  }
});
it('carries identical automatic ingredient nutrition into final PDF content and a real XLSX file', async () => {
  const draft = { ...createEmptyRecipe(), title: 'Pui și morcov QA', servings: 2,
    ingredients: [
      { ...createEmptyIngredient(), name: 'piept de pui', quantity: 200 },
      { ...createEmptyIngredient(), name: 'morcov', quantity: 100 },
    ],
    compliance: { finalWeightGrams: 250, finalWeightMeasured: true, isDefrosted: false, nutritionNotes: null, templateId: null, sourceReference: null },
  };
  const automaticRecipe = { ...draft, id: 'qa-automatic', allergens: [], totals: calculateRecipeTotals(draft), createdAt: '2026-10-04', updatedAt: '2026-10-04' };
  expect(calculateRecipeNutrition(automaticRecipe).perPortion.protein).toBe(23.79);
  await exportRecipePdf(automaticRecipe, context);
  await exportRecipeExcel(automaticRecipe, context);
  const bytes = state.files.get(state.shared[1]) as Uint8Array;
  const rows = await readXlsxFile(new Blob([new Uint8Array(bytes)]));
  for (const content of [state.html[0], JSON.stringify(rows)]) {
    expect(content).toContain('23,79');
    expect(content).toContain('Ciqual');
    expect(content).toContain('36017');
    expect(content).toContain('≈');
    expect(content).toContain('CALCUL ORIENTATIV');
  }
  evidence('nutrition-automatic.html', state.html[0]);
  evidence('nutrition-automatic.xlsx', bytes);
  evidence('nutrition-automatic.json', JSON.stringify({ draft, calculated: calculateRecipeNutrition(draft) }, null, 2));
});
it('exports HR to an actual monthly XLSX with start and end, and a PDF with total hours', async () => {
  await exportHrExcel([employee], [shift], '2026-10', 'Locație QA');
  const bytes = state.files.get(state.shared[0]) as Uint8Array;
  const sheets = await readXlsxFile(new Blob([new Uint8Array(bytes)]));
  expect(sheets).toHaveLength(2);
  const rows = sheets[1].data;
  expect(JSON.stringify(rows)).toContain('08:15'); expect(JSON.stringify(rows)).toContain('16:45');
  await exportHrPdf([employee], [shift], '2026-10', 'Locație QA');
  expect(state.html[0]).toContain('8,5'); expect(state.html[0]).toContain(employee.name);
  evidence('hr.xlsx', bytes); evidence('hr.html', state.html[0]);
});
it('every HACCP form and the inspection pack reach the PDF and share adapters', async () => {
  for (const form of HACCP_FORMS) {
    await exportHaccpDocumentPdf(documentFor(form.code), form, 'ro');
    expect(state.html.at(-1)).toContain(form.code); expect(state.shared.at(-1)).toMatch(/\.pdf$/);
    evidence(`haccp-${form.code}.html`, state.html.at(-1)!);
  }
  await exportHaccpControlPackPdf(HACCP_FORMS.map(form => documentFor(form.code)), 'ro', '10-2026');
  expect(state.shared).toHaveLength(HACCP_FORMS.length + 1); evidence('haccp-pack.html', state.html.at(-1)!);
});
it('exports all three waste documents with the intended file names', async () => {
  await exportWastePlanPdf(plan); await exportRedistributionPdf(2026, [], [], plan); await exportWasteDossierPdf(2026, plan, [], [], []);
  expect(state.shared).toHaveLength(3);
  ['waste-plan', 'redistribution', 'waste-dossier'].forEach((name, index) => evidence(`${name}.html`, state.html[index]));
});
it('native account export writes valid JSON and identifies incomplete cloud collection', async () => {
  const result = await exportAccountData('qa-user', [recipe], []);
  const json = state.files.get(result.uri) as string;
  expect(() => JSON.parse(json)).not.toThrow(); expect(json).toContain(recipe.title);
  expect(state.shared).toEqual([result.uri]); evidence('account.json', json);
});
it('web exports use browser printing and downloads without native file access', async () => {
  state.os = 'web'; await exportRecipePdf(recipe, context); await exportRecipeExcel(recipe, context); await exportAccountData('qa-user', [recipe], []);
  expect(state.html).toHaveLength(1); expect(state.downloads).toHaveLength(2); expect(state.files.size).toBe(0); expect(state.shared).toEqual([]);
});
it('unavailable native sharing never reports a completed export', async () => {
  state.available = false;
  for (const run of [() => exportRecipePdf(recipe, context), () => exportRecipeExcel(recipe, context), () => exportCookbookPdf([recipe], context), () => exportCookbookExcel([recipe], context), () => exportAllergenMenuPdf([recipe], context), () => exportHrExcel([employee], [shift], '2026-10'), () => exportHrPdf([employee], [shift], '2026-10'), () => exportHaccpDocumentPdf(documentFor(HACCP_FORMS[0].code), HACCP_FORMS[0], 'ro'), () => exportHaccpControlPackPdf([], 'ro', '10-2026'), () => exportWastePlanPdf(plan), () => exportRedistributionPdf(2026, [], [], plan), () => exportWasteDossierPdf(2026, plan, [], [], []), () => exportAccountData('qa-user', [recipe], [])]) {
    await expect(run()).rejects.toThrow('Partajarea');
  }
  expect(state.shared).toEqual([]);
});
