import type { Locale } from '@/i18n/translations';
import { workforceTranslator } from '@/i18n/workforce-translations';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { printHtmlInBrowser } from '@/lib/web-print';
import type { Cell } from 'write-excel-file/universal';

import { PARADIM_LOGO_DATA_URI } from '@/constants/brand-logo';
import { COMPANY_CONTACT_LINE } from '@/constants/paradim';
import { createExcelWorkbook, workbookToBlob, workbookToBytes, type ExcelImage, type ExcelSheet } from '@/lib/excel-workbook';
import { totalMonthlyGrossSalary } from '@/lib/hr';
import {
  buildHrMonthlyRows,
  buildHrPdfHtml,
  buildHrRows,
  HR_STATUS_LABELS,
  hrDayCellValue,
  hrDayIsWeekend,
  hrGeneratedAtLabel,
  hrPeriodLabel,
  hrPeriodParts,
  hrReportFileName,
  hrWeekdayLabel,
  type HrMonthlyRow,
} from '@/lib/hr-report';
import type { HrEmployee, HrShift } from '@/types/hr';

const NAVY = '#062544';
const LINE = '#C7D0D6';
const SOFT = '#F3F6F7';

function downloadOnWeb(data: BlobPart, fileName: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function logoBytes() {
  const [, encoded = ''] = PARADIM_LOGO_DATA_URI.split(',', 2);
  const binary = globalThis.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function logoImage(content: Uint8Array): ExcelImage {
  return {
    content,
    contentType: 'image/png',
    width: 48,
    height: 48,
    dpi: 96,
    anchor: { row: 1, column: 1 },
    offsetX: 4,
    offsetY: 3,
    title: 'Sigla PARADIM',
    description: 'Sigla oficială PARADIM',
  };
}

function cell(value: string | number, extras: Omit<Exclude<Cell, string | number | boolean | Date | null | undefined>, 'value'> = {}): Cell {
  return { value, fontFamily: 'Arial', fontSize: 9, alignVertical: 'center', ...extras };
}

function heading(value: string, extras: Omit<Exclude<Cell, string | number | boolean | Date | null | undefined>, 'value'> = {}): Cell {
  return cell(value, {
    fontWeight: 'bold', backgroundColor: NAVY, textColor: '#FFFFFF', align: 'center',
    borderColor: '#FFFFFF', borderStyle: 'thin', wrap: true, height: 34, ...extras,
  });
}

function statusCell(shift?: HrShift): Cell {
  const value = hrDayCellValue(shift);
  if (!shift) return cell('', { align: 'center', borderColor: LINE, borderStyle: 'thin' });
  const colors = {
    present: ['#E2F4EA', '#126845'], absent: ['#FDE6E6', '#A12E37'], leave: ['#E8F0FB', '#235B9E'],
    day_off: ['#ECEFF1', '#52626F'], scheduled: ['#FFF2CC', '#7D5A00'],
  } as const;
  return cell(value, {
    align: 'center', fontWeight: 'bold', backgroundColor: colors[shift.status][0], textColor: colors[shift.status][1],
    borderColor: LINE, borderStyle: 'thin',
  });
}

function matrixSheet(
  employees: readonly HrEmployee[],
  shifts: readonly HrShift[],
  period: string,
  locationName: string,
  generatedAt: Date,
  logo: Uint8Array,
  locale: Locale,
): ExcelSheet {
  const tr = workforceTranslator(locale);
  const { days } = hrPeriodParts(period);
  const rows = buildHrMonthlyRows(employees, shifts, period);
  const records = buildHrRows(employees, shifts.filter((shift) => shift.workDate.startsWith(`${period}-`)));
  const totalHours = rows.reduce((sum, row) => sum + row.totalHours, 0);
  const totalGross = totalMonthlyGrossSalary(employees);
  const totalNet = employees.filter((employee) => employee.active).reduce((sum, employee) => sum + (employee.netSalary ?? 0), 0);
  const width = days + 7;
  const data: Cell[][] = [
    [cell('MANAGER 24/7 by PARADIM', { columnSpan: width, height: 54, align: 'center', fontWeight: 'bold', fontSize: 15, textColor: NAVY })],
    [cell(`PARADIM Operations SRL · Iași, România · ${COMPANY_CONTACT_LINE}`, { columnSpan: width, align: 'center', textColor: '#52626F', fontSize: 8 })],
    [cell(tr("PONTAJ LUNAR"), { columnSpan: width, align: 'center', fontWeight: 'bold', fontSize: 16, textColor: '#D67B31', height: 30 })],
    [cell(`${hrPeriodLabel(period, locale)} · ${locationName}`, { columnSpan: width, align: 'center', fontWeight: 'bold', textColor: NAVY })],
    [cell(`${tr("Nume raport:")} ${tr("Pontaj lunar")} · ${tr("Data generării:")} ${hrGeneratedAtLabel(generatedAt, locale)} · ${locale === 'ro' ? 'Perioada' : 'Period'}: ${period}`, { columnSpan: width, align: 'center', textColor: '#52626F', fontSize: 8 })],
    [cell(`${tr("Angajați")}: ${rows.length} · ${tr("Înregistrări")}: ${records.length} · ${tr("Ore lucrate")}: ${totalHours.toFixed(1)} · ${tr("Salarii brute")}: ${totalGross.toFixed(2)} RON · ${tr("Salarii nete")}: ${totalNet.toFixed(2)} RON`, { columnSpan: width, align: 'center', backgroundColor: SOFT, fontWeight: 'bold', textColor: NAVY, height: 24 })],
    [
      heading(tr("Angajat")), heading(tr("Funcție")),
      ...Array.from({ length: days }, (_, index) => {
        const day = index + 1;
        return heading(`${day}\n${hrWeekdayLabel(period, day, locale)}`, hrDayIsWeekend(period, day) ? { backgroundColor: '#8E3E46' } : {});
      }),
      heading(tr("Ore")), heading('P'), heading('A'), heading('CO'), heading('L'),
    ],
  ];
  for (const row of rows) {
    data.push([
      cell(row.employee.name, { fontWeight: 'bold', borderColor: LINE, borderStyle: 'thin' }),
      cell(row.employee.role || '—', { borderColor: LINE, borderStyle: 'thin' }),
      ...Array.from({ length: days }, (_, index) => statusCell(row.shiftsByDay.get(index + 1))),
      cell(row.totalHours, { align: 'right', fontWeight: 'bold', backgroundColor: SOFT, borderColor: LINE, borderStyle: 'thin', format: '0.0' }),
      cell(row.presentDays, { align: 'center', fontWeight: 'bold', backgroundColor: SOFT, borderColor: LINE, borderStyle: 'thin' }),
      cell(row.absentDays, { align: 'center', fontWeight: 'bold', backgroundColor: SOFT, borderColor: LINE, borderStyle: 'thin' }),
      cell(row.leaveDays, { align: 'center', fontWeight: 'bold', backgroundColor: SOFT, borderColor: LINE, borderStyle: 'thin' }),
      cell(row.dayOffDays, { align: 'center', fontWeight: 'bold', backgroundColor: SOFT, borderColor: LINE, borderStyle: 'thin' }),
    ]);
  }
  data.push([cell(tr("Legendă: număr = ore lucrate · PR = programat · A = absent · CO = concediu · L = liber."), { columnSpan: width, fontStyle: 'italic', textColor: '#52626F', fontSize: 8, height: 22 })]);
  return {
    rows: data,
    columns: [{ width: 25 }, { width: 18 }, ...Array.from({ length: days }, () => ({ width: 5 })), ...Array.from({ length: 5 }, () => ({ width: 8 }))],
    images: [logoImage(logo)],
    orientation: 'landscape', showGridLines: false, stickyRowsCount: 7, stickyColumnsCount: 2, zoomScale: 70,
  };
}

function employeeSheet(row: HrMonthlyRow, period: string, generatedAt: Date, logo: Uint8Array, locale: Locale): ExcelSheet {
  const tr = workforceTranslator(locale);
  const { days } = hrPeriodParts(period);
  const data: Cell[][] = [
    [cell('MANAGER 24/7 by PARADIM', { columnSpan: 8, height: 54, align: 'center', fontWeight: 'bold', fontSize: 14, textColor: NAVY })],
    [cell(`PARADIM Operations SRL · ${COMPANY_CONTACT_LINE}`, { columnSpan: 8, align: 'center', textColor: '#52626F', fontSize: 8 })],
    [cell(tr("FIȘĂ LUNARĂ DE PONTAJ"), { columnSpan: 8, align: 'center', fontWeight: 'bold', fontSize: 15, textColor: '#D67B31', height: 30 })],
    [cell(`${row.employee.name} · ${row.employee.role || tr("Fără funcție")} · ${row.employee.locationName || tr("Fără locație")}`, { columnSpan: 8, align: 'center', fontWeight: 'bold', textColor: NAVY })],
    [cell(`${hrPeriodLabel(period, locale)} · ${locale === 'ro' ? 'generat' : 'generated'} ${hrGeneratedAtLabel(generatedAt, locale)}`, { columnSpan: 8, align: 'center', textColor: '#52626F', fontSize: 8 })],
    [tr("Data"), tr("Zi"), tr("Program"), tr("Intrare"), tr("Ieșire"), tr("Status"), tr("Ore"), tr("Observații")].map((value) => heading(value)),
  ];
  for (let day = 1; day <= days; day += 1) {
    const shift = row.shiftsByDay.get(day);
    data.push([
      cell(`${period}-${String(day).padStart(2, '0')}`, { borderColor: LINE, borderStyle: 'thin' }),
      cell(hrWeekdayLabel(period, day, locale), { align: 'center', backgroundColor: hrDayIsWeekend(period, day) ? '#F5E5E7' : undefined, borderColor: LINE, borderStyle: 'thin' }),
      cell(shift ? `${shift.plannedStart}–${shift.plannedEnd}` : '', { align: 'center', borderColor: LINE, borderStyle: 'thin' }),
      cell(shift?.actualStart ?? '', { align: 'center', borderColor: LINE, borderStyle: 'thin' }),
      cell(shift?.actualEnd ?? '', { align: 'center', borderColor: LINE, borderStyle: 'thin' }),
      cell(shift ? tr(HR_STATUS_LABELS[shift.status]) : '', { align: 'center', borderColor: LINE, borderStyle: 'thin' }),
      cell(shift ? row.shiftsByDay.get(day)?.status === 'present' ? Number(hrDayCellValue(shift).replace(',', '.')) : 0 : 0, { align: 'right', format: '0.0', borderColor: LINE, borderStyle: 'thin' }),
      cell(shift?.notes ?? '', { wrap: true, borderColor: LINE, borderStyle: 'thin' }),
    ]);
  }
  data.push([cell(tr("TOTAL LUNĂ"), { columnSpan: 6, align: 'right', fontWeight: 'bold', backgroundColor: SOFT, borderColor: LINE, borderStyle: 'thin' }), null, null, null, null, null, cell(row.totalHours, { align: 'right', fontWeight: 'bold', backgroundColor: SOFT, borderColor: LINE, borderStyle: 'thin', format: '0.0' }), cell(`P ${row.presentDays} · A ${row.absentDays} · CO ${row.leaveDays} · L ${row.dayOffDays}`, { fontWeight: 'bold', backgroundColor: SOFT, borderColor: LINE, borderStyle: 'thin' })]);
  return {
    rows: data,
    columns: [{ width: 14 }, { width: 7 }, { width: 15 }, { width: 11 }, { width: 11 }, { width: 13 }, { width: 10 }, { width: 34 }],
    images: [logoImage(logo)], showGridLines: false, stickyRowsCount: 6, zoomScale: 90,
  };
}

export async function exportHrExcel(
  employees: readonly HrEmployee[],
  shifts: readonly HrShift[],
  period: string,
  locationName = 'Toate locațiile',
  locale: Locale = 'ro',
) {
  const tr = workforceTranslator(locale);
  const selectedLocation = locationName === 'Toate locațiile' ? tr('Toate locațiile') : locationName;
  const generatedAt = new Date();
  const logo = logoBytes();
  const monthlyRows = buildHrMonthlyRows(employees, shifts, period);
  const sheets = [
    { name: tr("Pontaj lunar"), ...matrixSheet(employees, shifts, period, selectedLocation, generatedAt, logo, locale) },
    ...monthlyRows.map((row, index) => ({ name: `${locale === 'ro' ? 'Fisa' : 'Sheet'} ${String(index + 1).padStart(2, '0')}`, ...employeeSheet(row, period, generatedAt, logo, locale) })),
  ];
  const workbook = createExcelWorkbook(sheets);
  const fileName = hrReportFileName(period, 'xlsx', generatedAt);
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (Platform.OS === 'web') return downloadOnWeb(await workbookToBlob(workbook), fileName, mime);
  const bytes = await workbookToBytes(workbook);
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  if (!(await Sharing.isAvailableAsync())) throw new Error(tr("Partajarea fișierelor nu este disponibilă pe acest dispozitiv."));
  await Sharing.shareAsync(file.uri, { mimeType: mime, UTI: 'org.openxmlformats.spreadsheetml.sheet', dialogTitle: `${tr("Pontaj lunar")} · ${period}` });
}

export async function exportHrPdf(
  employees: readonly HrEmployee[],
  shifts: readonly HrShift[],
  period: string,
  locationName = 'Toate locațiile',
  locale: Locale = 'ro',
) {
  const tr = workforceTranslator(locale);
  const selectedLocation = locationName === 'Toate locațiile' ? tr('Toate locațiile') : locationName;
  const generatedAt = new Date();
  const html = buildHrPdfHtml(employees, shifts, period, selectedLocation, generatedAt, locale);
  if (Platform.OS === 'web') return printHtmlInBrowser(html);
  const { uri } = await Print.printToFileAsync({ html });
  const source = new File(uri);
  const target = new File(Paths.cache, hrReportFileName(period, 'pdf', generatedAt));
  if (target.exists) target.delete();
  await source.copy(target);
  if (!(await Sharing.isAvailableAsync())) throw new Error(tr("Partajarea fișierelor nu este disponibilă pe acest dispozitiv."));
  await Sharing.shareAsync(target.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `${tr("Pontaj lunar")} · ${period}` });
}
