import type { Locale } from '@/i18n/translations';
import { workforceTranslator } from '@/i18n/workforce-translations';
import { PARADIM_LOGO_DATA_URI } from '@/constants/brand-logo';
import { COMPANY_CONTACT_LINE } from '@/constants/paradim';
import { totalMonthlyGrossSalary } from '@/lib/hr';
import { calculateWorkHours } from '@/lib/hr-hours';
import type { HrEmployee, HrShift } from '@/types/hr';

export const HR_STATUS_LABELS = {
  scheduled: 'Programat',
  present: 'Prezent',
  absent: 'Absent',
  leave: 'Concediu',
  day_off: 'Liber',
} as const;

export const HR_STATUS_CODES = {
  scheduled: 'PR',
  present: 'P',
  absent: 'A',
  leave: 'CO',
  day_off: 'L',
} as const;

export type HrMonthlyRow = {
  employee: HrEmployee;
  shiftsByDay: Map<number, HrShift>;
  totalHours: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  dayOffDays: number;
  scheduledDays: number;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] ?? character));
}

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function hrPeriodParts(period: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) : now.getMonth() + 1;
  return { year, month, days: new Date(year, month, 0).getDate() };
}

export function hrPeriodLabel(period: string, locale: Locale = 'ro') {
  const { year, month } = hrPeriodParts(period);
  return new Intl.DateTimeFormat(locale === 'ro' ? 'ro-RO' : 'en-GB', { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1));
}

export function hrDateForDay(period: string, day: number) {
  const { year, month } = hrPeriodParts(period);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function hrWeekdayLabel(period: string, day: number, locale: Locale = 'ro') {
  const { year, month } = hrPeriodParts(period);
  const label = new Intl.DateTimeFormat(locale === 'ro' ? 'ro-RO' : 'en-GB', { weekday: 'short' })
    .format(new Date(year, month - 1, day));
  return label.replace('.', '').slice(0, 2).toUpperCase();
}

export function hrDayIsWeekend(period: string, day: number) {
  const { year, month } = hrPeriodParts(period);
  const weekday = new Date(year, month - 1, day).getDay();
  return weekday === 0 || weekday === 6;
}

export function changeHrPeriod(period: string, delta: number) {
  const { year, month } = hrPeriodParts(period);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function hrShiftWorkedHours(shift: HrShift) {
  return shift.status === 'present'
    ? calculateWorkHours(shift.actualStart || shift.plannedStart, shift.actualEnd || shift.plannedEnd)
    : 0;
}

export function hrDayCellValue(shift?: HrShift) {
  if (!shift) return '';
  if (shift.status !== 'present') return HR_STATUS_CODES[shift.status];
  const worked = hrShiftWorkedHours(shift);
  return Number.isInteger(worked) ? String(worked) : worked.toFixed(1).replace('.', ',');
}

export function buildHrRows(employees: readonly HrEmployee[], shifts: readonly HrShift[]) {
  const byId = new Map(employees.map((item) => [item.id, item]));
  return [...shifts]
    .sort((left, right) => left.workDate.localeCompare(right.workDate) || (
      byId.get(left.employeeId)?.name ?? ''
    ).localeCompare(byId.get(right.employeeId)?.name ?? '', 'ro-RO'))
    .map((shift) => ({ shift, employee: byId.get(shift.employeeId), worked: hrShiftWorkedHours(shift) }));
}

export function buildHrMonthlyRows(
  employees: readonly HrEmployee[],
  shifts: readonly HrShift[],
  period: string,
): HrMonthlyRow[] {
  const relevant = shifts.filter((shift) => shift.workDate.startsWith(`${period}-`));
  return [...employees]
    .sort((left, right) => left.name.localeCompare(right.name, 'ro-RO'))
    .map((employee) => {
      const employeeShifts = relevant.filter((shift) => shift.employeeId === employee.id);
      const shiftsByDay = new Map<number, HrShift>();
      for (const shift of employeeShifts) shiftsByDay.set(Number(shift.workDate.slice(8, 10)), shift);
      return {
        employee,
        shiftsByDay,
        totalHours: employeeShifts.reduce((sum, shift) => sum + hrShiftWorkedHours(shift), 0),
        presentDays: employeeShifts.filter((shift) => shift.status === 'present').length,
        absentDays: employeeShifts.filter((shift) => shift.status === 'absent').length,
        leaveDays: employeeShifts.filter((shift) => shift.status === 'leave').length,
        dayOffDays: employeeShifts.filter((shift) => shift.status === 'day_off').length,
        scheduledDays: employeeShifts.filter((shift) => shift.status === 'scheduled').length,
      };
    });
}

export function hrGeneratedAtLabel(date: Date, locale: Locale = 'ro') {
  return new Intl.DateTimeFormat(locale === 'ro' ? 'ro-RO' : 'en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export function hrReportFileName(period: string, extension: 'pdf' | 'xlsx', generatedAt = new Date()) {
  return `raport-prezenta-pontaj-${period}-generat-${localIsoDate(generatedAt)}.${extension}`;
}

function dayCellClass(shift?: HrShift) {
  return shift ? `status-${shift.status}` : '';
}

export function buildHrPdfHtml(
  employees: readonly HrEmployee[],
  shifts: readonly HrShift[],
  period: string,
  locationName = 'Toate locațiile',
  generatedAt = new Date(),
  locale: Locale = 'ro',
) {
  const tr = workforceTranslator(locale);
  const selectedLocation = locationName === 'Toate locațiile' ? tr('Toate locațiile') : locationName;
  const { days } = hrPeriodParts(period);
  const rows = buildHrMonthlyRows(employees, shifts, period);
  const detailRows = buildHrRows(employees, shifts.filter((shift) => shift.workDate.startsWith(`${period}-`)));
  const totalHours = rows.reduce((sum, row) => sum + row.totalHours, 0);
  const totalGross = totalMonthlyGrossSalary(employees);
  const totalNet = employees.filter((employee) => employee.active)
    .reduce((sum, employee) => sum + (employee.netSalary ?? 0), 0);
  const fileName = hrReportFileName(period, 'pdf', generatedAt);
  const dayHeaders = Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    return `<th class="day ${hrDayIsWeekend(period, day) ? 'weekend' : ''}"><b>${day}</b><small>${hrWeekdayLabel(period, day, locale)}</small></th>`;
  }).join('');
  const body = rows.map((row) => {
    const dayCells = Array.from({ length: days }, (_, index) => {
      const shift = row.shiftsByDay.get(index + 1);
      return `<td class="day ${dayCellClass(shift)}">${escapeHtml(hrDayCellValue(shift))}</td>`;
    }).join('');
    return `<tr><td class="employee"><strong>${escapeHtml(row.employee.name)}</strong><small>${escapeHtml(row.employee.locationName || tr('Fără locație'))}</small></td><td class="role">${escapeHtml(row.employee.role || '—')}</td>${dayCells}<td class="total">${row.totalHours.toFixed(1)}</td><td class="total">${row.presentDays}</td><td class="total">${row.absentDays}</td><td class="total">${row.leaveDays}</td><td class="total">${row.dayOffDays}</td></tr>`;
  }).join('');

  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${fileName}</title><style>
    @page{size:A4 landscape;margin:8mm 7mm 10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#17212B;margin:0}
    .brand{display:flex;align-items:center;gap:10px;border-bottom:2px solid #D8AA37;padding-bottom:6px;margin-bottom:7px}.brand img{width:48px;height:48px;object-fit:contain}
    .brand-copy{flex:1}.brand-name{font-size:15px;font-weight:800;color:#062544}.brand-details{font-size:7px;line-height:1.45;color:#52626F;margin-top:2px}.report-meta{text-align:right;font-size:7px;line-height:1.45;color:#52626F}
    h1{text-align:center;color:#D67B31;font-size:18px;letter-spacing:.8px;margin:5px 0 2px}.subtitle{text-align:center;color:#667482;font-size:8px;margin:0 0 7px;text-transform:capitalize}
    .summary{display:flex;gap:5px;margin:6px 0}.metric{flex:1;border:1px solid #DDE4E8;border-radius:5px;padding:5px;background:#F7F9FA}.metric-label{font-size:6px;text-transform:uppercase;color:#667482}.metric-value{font-size:10px;font-weight:800;color:#062544;margin-top:2px}
    table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:5.6px}th{background:#062544;color:white;border:1px solid white;padding:3px 1px;text-align:center;vertical-align:middle}th.name{width:88px}th.role{width:54px}th.day{width:17px}th.summary{width:31px}th.weekend{background:#8E3E46}th small{display:block;font-size:4.8px;margin-top:1px}
    td{border:1px solid #C8D0D5;padding:3px 2px;text-align:center;height:22px}td.employee{text-align:left;width:88px}td.employee small{display:block;color:#667482;font-size:4.8px;margin-top:1px}td.role{text-align:left;width:54px}td.day{width:17px;font-weight:700;font-variant-numeric:tabular-nums}td.total{background:#EEF3F6;font-weight:800;color:#062544}
    .status-present{background:#E2F4EA;color:#126845}.status-absent{background:#FDE6E6;color:#A12E37}.status-leave{background:#E8F0FB;color:#235B9E}.status-day_off{background:#ECEFF1;color:#52626F}.status-scheduled{background:#FFF2CC;color:#7D5A00}
    .legend{font-size:6px;color:#52626F;margin-top:6px}.footer{margin-top:6px;padding-top:5px;border-top:1px solid #DDE4E8;color:#667482;font-size:6px;display:flex;justify-content:space-between}
  </style></head><body>
    <header class="brand"><img src="${PARADIM_LOGO_DATA_URI}" alt="${tr("Sigla oficială PARADIM")}"><div class="brand-copy"><div class="brand-name">MANAGER 24/7 by PARADIM</div><div class="brand-details">PARADIM Operations SRL · Iași, România<br>${escapeHtml(COMPANY_CONTACT_LINE)}</div></div><div class="report-meta"><strong>${tr("Nume raport:")}</strong> ${tr("Pontaj lunar")}<br><strong>${tr("Data generării:")}</strong> ${escapeHtml(hrGeneratedAtLabel(generatedAt, locale))}<br><strong>${locale === "ro" ? "Perioada:" : "Period:"}</strong> ${escapeHtml(period)}</div></header>
    <h1>${tr("PONTAJ LUNAR")}</h1><p class="subtitle">${escapeHtml(hrPeriodLabel(period, locale))} · ${escapeHtml(selectedLocation)}</p>
    <section class="summary"><div class="metric"><div class="metric-label">${tr("Angajați")}</div><div class="metric-value">${rows.length}</div></div><div class="metric"><div class="metric-label">${tr("Înregistrări")}</div><div class="metric-value">${detailRows.length}</div></div><div class="metric"><div class="metric-label">${tr("Ore lucrate")}</div><div class="metric-value">${totalHours.toFixed(1)}</div></div><div class="metric"><div class="metric-label">${tr("Salarii brute")}</div><div class="metric-value">${totalGross.toFixed(2)} RON</div></div><div class="metric"><div class="metric-label">${tr("Salarii nete")}</div><div class="metric-value">${totalNet.toFixed(2)} RON</div></div></section>
    <table><thead><tr><th class="name">${tr("Angajat")}</th><th class="role">${tr("Funcție")}</th>${dayHeaders}<th class="summary">${tr("Ore")}</th><th class="summary">P</th><th class="summary">A</th><th class="summary">CO</th><th class="summary">L</th></tr></thead><tbody>${body || `<tr><td colspan="${days + 7}">${tr("Nu există angajați în filtrul selectat.")}</td></tr>`}</tbody></table>
    <div class="legend"><strong>${tr("Legendă:")}</strong> ${tr("număr = ore lucrate · PR = programat · A = absent · CO = concediu · L = liber. Fiecare angajat are o singură fișă lunară, iar fiecare zi o singură înregistrare.")}</div>
    <footer class="footer"><span>${tr("Document generat de Manager 24/7")}</span><span>PARADIM Operations SRL · ${escapeHtml(fileName)}</span></footer>
  </body></html>`;
}
