import { describe, expect, it } from 'vitest';
import { buildControlReportHtml, type ControlReportData } from './control-report';

export const controlFixture: ControlReportData = {
  date: '2026-10-05', updatedAt: '2026-10-05T10:00:00Z', location: 'Bucătărie <Nord>', pendingSync: 1,
  input: { documentCount: 1, expiredDocuments: 1, expiringDocuments: 0, invalidDocuments: 0, haccpDocuments: 1, haccpPending: 1, activeEmployees: 1, attendanceRecorded: 0, pendingLifecycle: 1 },
  documents: [{ id: 'doc-1', title: 'Autorizație <script>alert(1)</script>', categoryLabel: 'Authorization', owner: 'Ana & Ioan', issueDate: '2025-10-01', expiryDate: '2026-10-01', expiryLabel: 'Expired', expiryAttention: true, notes: 'Original "semnat"', updatedAt: '2026-10-05', syncState: 'pending' }],
  haccpDocuments: [{ id: 'h-1', formCode: 'FO-H-04-01', headerValues: { month: '10', year: '2026', location: 'Bucătărie <Nord>' }, rows: [{ id: 'row-1', values: { day: '5', temperature_1: '4', _requires_confirmation: 'true' }, createdAt: '2026-10-05', updatedAt: '2026-10-05' }], createdAt: '2026-10-01', updatedAt: '2026-10-05', syncState: 'local' }],
  haccpTasks: [{ key: 'temperature', title: 'Frigider <A>', subtitle: 'Trei citiri', formCode: 'FO-H-04-01', kind: 'temperature', completedSteps: 0, totalSteps: 3, status: 'pending', required: true }],
  employees: [{ name: 'Ștefan <Popescu>', role: 'Bucătar', location: 'Bucătărie <Nord>', active: true, attendance: ['scheduled'], lifecycleStatus: 'Active', completed: 2, total: 5, pendingChecks: ['Employment documents'], notes: 'Păstrează & verifică' }],
};
const generatedAt = new Date('2026-10-05T11:00:00Z');

describe('inspection dossier', () => {
  it('escapes user values while preserving their language and records unresolved evidence', () => {
    const html = buildControlReportHtml(controlFixture, 'AUDIT', 'en', generatedAt);
    expect(html).toContain('Autorizație &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Ana &amp; Ioan');
    expect(html).toContain('Original &quot;semnat&quot;');
    expect(html).toContain('Ștefan &lt;Popescu&gt;');
    expect(html).toContain('Bucătar');
    expect(html).toContain('2026-10-01');
    expect(html).toContain('FO-H-04-01');
    expect(html).toContain('Awaiting confirmation');
    expect(html).toContain('Unresolved issues');
    expect(html).toContain('does not certify legal compliance');
    expect(html).toContain('Employment documents');
  });

  it.each([
    ['DSVSA', true, false], ['DSP', true, false], ['ITM', false, true], ['AUDIT', true, true],
  ] as const)('includes only authority-relevant evidence for %s', (authority, haccp, hr) => {
    const html = buildControlReportHtml(controlFixture, authority, 'en', generatedAt);
    expect(html.includes('HACCP evidence')).toBe(haccp);
    expect(html.includes('HR evidence')).toBe(hr);
    expect(html.includes('Ștefan &lt;Popescu&gt;')).toBe(hr);
    expect(html).toContain('Document register');
    expect(html).toContain(authority === 'AUDIT' ? 'Internal audit' : authority);
  });

  it('localizes generated report labels without translating user-entered content', () => {
    const ro = buildControlReportHtml(controlFixture, 'ITM', 'ro', generatedAt);
    const en = buildControlReportHtml(controlFixture, 'ITM', 'en', generatedAt);
    expect(ro).toContain('Dosar de control');
    expect(ro).toContain('Registrul documentelor');
    expect(ro).toContain('Nu certifică respectarea obligațiilor legale');
    expect(ro).not.toContain('Inspection dossier');
    expect(en).toContain('Inspection dossier');
    expect(en).not.toContain('Registrul documentelor');
    expect(ro).toContain('Ștefan &lt;Popescu&gt;');
    expect(en).toContain('Ștefan &lt;Popescu&gt;');
  });

  it('labels an empty snapshot as missing evidence rather than inspection-ready', () => {
    const empty = { ...controlFixture, pendingSync: 0, documents: [], haccpDocuments: [], haccpTasks: [], employees: [], input: { documentCount: 0, expiredDocuments: 0, expiringDocuments: 0, haccpDocuments: 0, haccpPending: 0, activeEmployees: 0, attendanceRecorded: 0, pendingLifecycle: 0 } };
    const html = buildControlReportHtml(empty, 'AUDIT', 'en', generatedAt);
    expect(html).toContain('0%');
    expect(html).toContain('No records available');
    expect(html).toContain('Review required');
  });
});
