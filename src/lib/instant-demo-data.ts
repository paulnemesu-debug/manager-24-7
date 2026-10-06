import type { Locale } from '@/i18n/translations';
import type { HrLifecycle } from '@/lib/hr-lifecycle';
import { localIsoDate } from '@/lib/local-date-time';
import type { OperationsControlData } from '@/lib/operations-control-repository';
import type { HrData } from '@/types/hr';
import type { OperationalDocument } from '@/types/operational-document';
import type { PnlReport } from '@/types/pnl';

export type InstantDemoData = {
  hr: HrData;
  lifecycle: HrLifecycle[];
  documents: OperationalDocument[];
  pnl: PnlReport[];
  operations: OperationsControlData;
};

/** Pure fictional examples, dated for this visit; no storage, cloud or real-account data. */
export function buildInstantDemoData(locale: Locale, now: Date): InstantDemoData {
  const text = (ro: string, en: string) => locale === 'ro' ? ro : en;
  const stamp = now.toISOString();
  const today = localIsoDate(now);
  const relativeDate = (days: number) => {
    const date = new Date(now.getTime());
    date.setDate(date.getDate() + days);
    return localIsoDate(date);
  };
  const note = text(
    'DEMO — date fictive pentru demonstrație. Nu reprezintă persoane, documente sau verificări reale.',
    'DEMO — fictional demonstration data. These are not real people, documents or checks.',
  );
  const location = text('[DEMO] Bistro exemplu', '[DEMO] Example bistro');
  const hr: HrData = {
    employees: [
      { id: 'demo-employee-alex', name: '[DEMO] Alex', role: 'Manager', grossSalary: 9000, netSalary: 5200 },
      { id: 'demo-employee-dana', name: '[DEMO] Dana', role: text('Bucătar', 'Cook'), grossSalary: 6500, netSalary: 3900 },
      { id: 'demo-employee-luca', name: '[DEMO] Luca', role: text('Ospătar', 'Server'), grossSalary: 5000, netSalary: 3000 },
    ].map((employee) => ({
      ...employee, locationId: null, locationName: location, active: true,
      createdAt: stamp, updatedAt: stamp, syncState: 'local',
    })),
    shifts: [
      { id: 'demo-shift-alex', employeeId: 'demo-employee-alex', workDate: today, plannedStart: '08:00', plannedEnd: '16:00', actualStart: '08:03', actualEnd: '', status: 'present', notes: note, updatedAt: stamp, syncState: 'local' },
      { id: 'demo-shift-dana', employeeId: 'demo-employee-dana', workDate: today, plannedStart: '10:00', plannedEnd: '18:00', actualStart: '', actualEnd: '', status: 'scheduled', notes: note, updatedAt: stamp, syncState: 'local' },
      { id: 'demo-shift-luca', employeeId: 'demo-employee-luca', workDate: today, plannedStart: '09:00', plannedEnd: '17:00', actualStart: '', actualEnd: '', status: 'leave', notes: note, updatedAt: stamp, syncState: 'local' },
    ],
  };
  const lifecycle: HrLifecycle[] = hr.employees.map((employee, index) => ({
    employeeId: employee.id, status: index === 1 ? 'onboarding' : 'active', hireDate: relativeDate(index === 1 ? -2 : -60), exitDate: '',
    documents: true, medical: true, training: index !== 1, equipmentIssued: index !== 1, accessGranted: index !== 1,
    equipmentReturned: false, keysReturned: false, accessRevoked: false, handover: false, finalDocuments: false,
    notes: index === 1 ? `${note} ${text('Exemplu: instruirea și predarea echipamentului rămân de completat.', 'Example: training and equipment handover are still incomplete.')}` : note,
    updatedAt: stamp, syncState: 'local',
  }));
  const documents: OperationalDocument[] = [
    { id: 'demo-document-permit', title: text('[DEMO] Autorizație — exemplu', '[DEMO] Permit — example'), category: 'authorization', owner: hr.employees[0].name, issueDate: relativeDate(-60), expiryDate: relativeDate(120), notes: note, updatedAt: stamp, syncState: 'local' },
    { id: 'demo-document-training', title: text('[DEMO] Instruire igienă — de reînnoit', '[DEMO] Hygiene training — renewal due'), category: 'training', owner: hr.employees[1].name, issueDate: relativeDate(-60), expiryDate: relativeDate(14), notes: note, updatedAt: stamp, syncState: 'local' },
    { id: 'demo-document-medical', title: text('[DEMO] Fișă de aptitudine — exemplu', '[DEMO] Fitness certificate — example'), category: 'medical', owner: hr.employees[2].name, issueDate: relativeDate(-30), expiryDate: relativeDate(90), notes: note, updatedAt: stamp, syncState: 'local' },
  ];
  const pnl: PnlReport[] = [{
    id: 'demo-pnl-current', period: today.slice(0, 7),
    revenueFood: 120000, revenueBeverage: 30000, revenueOther: 2000,
    cogsFood: 46000, cogsBeverage: 9000, packagingCost: 2000, payrollCost: 32000,
    rentCost: 14000, utilitiesCost: 6000, deliveryCommissions: 5000, marketingCost: 2500,
    maintenanceCost: 1500, adminSoftwareCost: 1000, otherOperatingCost: 2000, taxesInterestDepreciation: 5000,
    notes: `${note} ${text('Scenariu lunar ilustrativ; nu este o evidență contabilă.', 'Illustrative monthly scenario; this is not an accounting record.')}`,
    createdAt: stamp, updatedAt: stamp, syncState: 'local',
  }];
  const operations: OperationsControlData = {
    policies: [], orders: [],
    schedules: [{ id: 'demo-inventory-weekly', locationId: null, frequency: 'weekly', weekday: now.getDay(), monthDay: null, enabled: true, nextDueDate: today, updatedAt: stamp, syncState: 'local' }],
    waste: [{ id: 'demo-waste-preparation', locationId: null, eventDate: today, catalogId: null,
      itemName: text('[DEMO] Legume pentru pregătire', '[DEMO] Vegetables for preparation'), quantity: 1.5, unit: 'kg', unitCost: 8,
      reason: 'preparation', notes: note, value: 12, createdAt: stamp, updatedAt: stamp, syncState: 'local' }],
  };
  return { hr, lifecycle, documents, pnl, operations };
}
