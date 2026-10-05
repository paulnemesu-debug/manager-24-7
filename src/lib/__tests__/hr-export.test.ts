import { describe, expect, it } from 'vitest';

import { buildHrPdfHtml, buildHrRows, hrReportFileName } from '@/lib/hr-report';
import { calculateWorkHours } from '@/lib/hr-hours';
import { dedupeShiftsByEmployeeDay, normalizeHrEmployee, totalMonthlyGrossSalary } from '@/lib/hr';
import type { HrEmployee, HrShift } from '@/types/hr';

const employee: HrEmployee = {
  id: 'employee-1',
  name: 'Ana Popescu',
  role: 'Bucătar',
  locationId: null,
  locationName: 'Bucătărie centrală',
  grossSalary: 6_000,
  netSalary: 3_510,
  active: true,
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
};

const shift: HrShift = {
  id: 'shift-1',
  employeeId: employee.id,
  workDate: '2026-10-03',
  plannedStart: '08:00',
  plannedEnd: '16:00',
  actualStart: '08:05',
  actualEnd: '16:35',
  status: 'present',
  notes: 'Tură completă',
  updatedAt: '2026-10-03T17:00:00.000Z',
};

describe('calculateWorkHours', () => {
  it('calculează o tură în aceeași zi', () => expect(calculateWorkHours('08:00', '16:30')).toBe(8.5));
  it('calculează o tură care trece de miezul nopții', () => expect(calculateWorkHours('22:00', '06:00')).toBe(8));
  it('acceptă început și sfârșit identice', () => expect(calculateWorkHours('08:00', '08:00')).toBe(0));
  it('respinge orele invalide', () => expect(calculateWorkHours('25:00', '16:00')).toBe(0));
});

describe('HR persistence and reports', () => {
  it('keeps legacy employees while migrating away from hourly rate', () => {
    const migrated = normalizeHrEmployee({
      ...employee,
      grossSalary: undefined,
      netSalary: undefined,
      hourlyRate: 35,
    });
    expect(migrated?.name).toBe('Ana Popescu');
    expect(migrated?.grossSalary).toBeNull();
    expect(migrated?.netSalary).toBeNull();
  });

  it('calculates active gross salaries for P&L', () => {
    expect(totalMonthlyGrossSalary([employee, { ...employee, id: 'employee-2', grossSalary: 4_500 }])).toBe(10_500);
    expect(totalMonthlyGrossSalary([{ ...employee, active: false }])).toBe(0);
  });

  it('keeps only the newest attendance row for an employee and day', () => {
    const newest = { ...shift, id: 'shift-2', notes: 'Corectat', updatedAt: '2026-10-03T18:00:00.000Z' };
    expect(dedupeShiftsByEmployeeDay([shift, newest])).toEqual([newest]);
  });

  it('builds a branded PARADIM attendance PDF with report metadata', () => {
    const generatedAt = new Date('2026-10-03T10:15:00.000Z');
    const html = buildHrPdfHtml([employee], [shift], '2026-10', 'Bucătărie centrală', generatedAt);
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('PARADIM Operations SRL');
    expect(html).toContain('Nume raport:');
    expect(html).toContain('Data generării:');
    expect(html).toContain('Ana Popescu');
    expect(buildHrRows([employee], [shift])[0]?.worked).toBe(8.5);
  });

  it('uses the report name, month and generation date in exported filenames', () => {
    expect(hrReportFileName('2026-10', 'pdf', new Date('2026-10-03T10:15:00.000Z')))
      .toBe('raport-prezenta-pontaj-2026-10-generat-2026-10-03.pdf');
  });
});
