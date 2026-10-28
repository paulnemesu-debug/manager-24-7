import { describe, expect, it } from 'vitest';
import { buildRedistributionReportHtml, buildWasteDossierHtml, buildWastePlanHtml } from './waste-compliance-sheet';
import { getWasteModelObjectives, wasteObjectivesForDraft } from './waste-compliance-model';
import type { WasteEntry } from '@/types/operations-control';
import type { FoodRedistribution, WastePreventionPlan, WasteReceiver } from '@/types/waste-compliance';

const plan: WastePreventionPlan = {
  id: 'p1', locationId: null, reportingYear: 2026, companyName: 'PARADIM & Test', companyTaxId: 'RO123',
  companyAddress: 'Iași', companyAuthorization: 'ANSVSA-1', companyPhone: '0700000000', companyEmail: 'contact@paradim.ro', legalRepresentative: 'Marius', responsiblePerson: 'Manager',
  measures: ['fifo', 'production_planning'], objectives: 'Reducere cu 10%', status: 'final', submittedAt: null,
  updatedAt: '2026-09-26T00:00:00Z', syncState: 'synced',
};
const receiver: WasteReceiver = { id: 'r1', name: 'Banca locală', taxId: '', county: 'Iași', authorization: 'A1', contact: '', contractReference: '', contractDate: null, notes: '', active: true, updatedAt: '', syncState: 'synced' };
const transfer: FoodRedistribution = { id: 't1', locationId: null, transferDate: '2026-09-26', destinationType: 'receiver', receiverId: 'r1', productName: 'Supă', productCategory: 'Preparat', productOrigin: 'prepared_food', quantity: 5, unit: 'kg', quantityKg: 5, estimatedValue: 100, temperatureC: 4, expiryDate: '2026-09-27', consumerCount: null, documentReference: 'PV-1', traceabilityReference: 'LOT-1', safetyCheck: 'compliant', correctiveAction: '', handedOverBy: 'Marius', receivedBy: 'Ana', notes: '', createdAt: '', updatedAt: '', syncState: 'synced' };
const waste: WasteEntry = { id: 'w1', locationId: null, eventDate: '2026-09-26', catalogId: null, itemName: 'Cartofi', quantity: 2, unit: 'kg', unitCost: 4, reason: 'preparation', notes: 'Coji', value: 8, createdAt: '', updatedAt: '', syncState: 'synced' };

describe('waste compliance documents', () => {
  it('changes untouched model objectives with locale and preserves explicit drafts', () => {
    expect(wasteObjectivesForDraft(null, 'en')).toBe(getWasteModelObjectives('en'));
    expect(wasteObjectivesForDraft(null, 'ro')).toBe(getWasteModelObjectives('ro'));
    expect(getWasteModelObjectives('en')).not.toBe(getWasteModelObjectives('ro'));
    for (const draft of ['', 'Obiectiv ales de utilizator', getWasteModelObjectives('ro')]) {
      expect(wasteObjectivesForDraft(draft, 'en')).toBe(draft);
    }
  });
  it('localizes the annual plan without translating or interpreting user text', () => {
    const html = buildWastePlanHtml({ ...plan, objectives: 'Obiectiv scris de utilizator <script>' }, 'en');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('ANNUAL FOOD WASTE REDUCTION PLAN');
    expect(html).toContain('Production and portion planning');
    expect(html).toContain('Obiectiv scris de utilizator &lt;script&gt;');
    expect(html).not.toContain('Măsuri selectate');
  });
  it('localizes annual report categories, totals and fallback destinations', () => {
    const html = buildRedistributionReportHtml(2026, [{ ...transfer, destinationType: 'consumer' }], [], plan, 'en');
    expect(html).toContain('ANNUAL FOOD REDISTRIBUTION REPORT');
    expect(html).toContain('Food donated by the catering business');
    expect(html).toContain('Final consumers');
    expect(html).toContain('5.000');
    expect(html).toContain('100.00 RON');
    expect(html).toContain('Supă');
  });
  it('localizes every dossier section, statuses and waste reasons', () => {
    const html = buildWasteDossierHtml(2026, plan, [transfer], [receiver], [waste], 'en');
    for (const title of ['FOOD WASTE PREVENTION AND REDISTRIBUTION DOSSIER', 'ANNUAL PLAN', 'INTERNAL WASTE REGISTER', 'REDISTRIBUTION REGISTER', 'ANNUAL REPORT · ANNEX NO. 2', 'RECEIVING OPERATORS']) expect(html).toContain(title);
    expect(html).toContain('Preparation loss');
    expect(html).toContain('Compliant');
    expect(html).toContain('Cartofi');
    expect(html).toContain('Banca locală');
    expect(html).not.toContain('REGISTRU INTERN DE RISIPĂ');
  });
  it('builds a safe annual plan with selected measures', () => {
    const html = buildWastePlanHtml(plan);
    expect(html).toContain('PLAN ANUAL DE DIMINUARE');
    expect(html).toContain('FIFO/FEFO');
    expect(html).toContain('PARADIM &amp; Test');
  });
  it('builds the annual redistribution register', () => {
    const html = buildRedistributionReportHtml(2026, [transfer], [receiver]);
    expect(html).toContain('RAPORT ANUAL PRIVIND REDISTRIBUIREA');
    expect(html).toContain('Banca locală');
    expect(html).toContain('PV-1');
    expect(html).toContain('5,000');
  });
  it('builds the complete dossier with waste and contact identity', () => {
    const html = buildWasteDossierHtml(2026, plan, [transfer], [receiver], [waste]);
    expect(html).toContain('DOSAR DE PREVENIRE A RISIPEI');
    expect(html).toContain('REGISTRU INTERN DE RISIPĂ');
    expect(html).toContain('Cartofi');
    expect(html).toContain('contact@paradim.ro');
    expect(html).toContain('ANEXA NR. 2');
  });
});
