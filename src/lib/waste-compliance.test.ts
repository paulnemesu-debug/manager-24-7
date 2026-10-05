import { describe, expect, it } from 'vitest';
import { buildRedistributionReportHtml, buildWasteDossierHtml, buildWastePlanHtml } from './waste-compliance-sheet';
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
