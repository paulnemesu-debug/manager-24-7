import { describe, expect, it } from 'vitest';
import { buildHrPdfHtml, hrPeriodLabel, hrWeekdayLabel } from './hr-report';

describe('English workforce reporting', () => {
  it('formats the selected month and calendar weekdays in the active language', () => {
    expect(hrPeriodLabel('2026-10', 'en')).toBe('October 2026');
    expect(hrWeekdayLabel('2026-10', 5, 'en')).toBe('MO');
    expect(hrPeriodLabel('2026-10', 'ro')).toContain('octombrie');
  });
  it('exports English headings without changing employee names', () => {
    const employee = { id:'e1', name:'Ștefan Popescu', role:'Bucătar', locationId:null, locationName:'Bucătărie', grossSalary:null, netSalary:null, active:true, createdAt:'2026-10-05', updatedAt:'2026-10-05' };
    const html = buildHrPdfHtml([employee], [], '2026-10', 'Bucătărie', new Date('2026-10-05T12:00:00Z'), 'en');
    expect(html).toContain('MONTHLY TIMESHEET');
    expect(html).toContain('Ștefan Popescu');
    expect(html).toContain('Bucătar');
    expect(html).not.toContain('PONTAJ LUNAR');
  });
});
