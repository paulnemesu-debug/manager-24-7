import { PARADIM_LOGO_DATA_URI } from '@/constants/brand-logo';
import { getHaccpForm, localize } from '@/constants/haccp-forms';
import type { Locale } from '@/i18n/translations';
import { inspectionReadiness, readinessScore, type InspectionAuthority } from '@/lib/control-mode';
import { haccpHeaderNeedsConfirmation, haccpRowNeedsConfirmation } from '@/lib/haccp-confirmation';
import type { HaccpDocument } from '@/types/haccp';
import type { HaccpTodayTask } from '@/types/haccp-routine';
import type { HrAttendanceStatus } from '@/types/hr';
import type { OperationalDocument } from '@/types/operational-document';

export type ControlReportData = {
  date: string;
  updatedAt: string;
  location: string;
  pendingSync: number;
  input: Parameters<typeof inspectionReadiness>[1];
  documents: readonly (Omit<OperationalDocument, 'category'> & { categoryLabel: string; expiryLabel: string; expiryAttention: boolean })[];
  haccpDocuments: readonly HaccpDocument[];
  haccpTasks: readonly HaccpTodayTask[];
  employees: readonly {
    name: string; role: string; location: string; active: boolean; attendance: readonly HrAttendanceStatus[];
    lifecycleStatus: string; completed: number; total: number; pendingChecks: readonly string[]; notes: string;
  }[];
};

const labels = {
  ro: {
    title: 'Dosar de control', audit: 'Audit intern', date: 'Data evaluării', generated: 'Generat', snapshot: 'Date încărcate', location: 'Locație HACCP',
    disclaimer: 'Raport intern informativ, bazat pe datele disponibile în aplicație. Nu certifică respectarea obligațiilor legale și nu garantează rezultatul unui control. Scorul reflectă doar verificările automate afișate; documentele originale și cerințele aplicabile trebuie verificate separat.',
    scope: 'Registrul și situația HR includ toate înregistrările disponibile din cont. Sarcinile HACCP sunt pentru data și locația indicate. Formularele HACCP includ toate perioadele salvate. Acest sumar nu înlocuiește documentele originale.',
    checks: 'Verificări de pregătire', recorded: 'Înregistrat', review: 'Necesită verificare', issues: 'Probleme nerezolvate', noIssues: 'Nicio problemă semnalată de verificările incluse. Verifică în continuare documentele originale.',
    documents: 'Registrul documentelor', document: 'Document / categorie', owner: 'Responsabil', issueDate: 'Emis', expiryDate: 'Expiră', dates: 'Date', status: 'Stare', notes: 'Observații', empty: 'Nu există înregistrări disponibile',
    haccp: 'Dovezi HACCP', tasks: 'Sarcini obligatorii pentru ziua evaluată', task: 'Sarcină', progress: 'Progres', forms: 'Formulare înregistrate - toate perioadele', form: 'Formular', period: 'Perioadă', rows: 'Rânduri', confirmation: 'În așteptarea confirmării', headerConfirmation: 'Antet neconfirmat',
    hr: 'Dovezi HR', employee: 'Angajat / rol', attendance: 'Pontaj pentru ziua evaluată', lifecycle: 'Parcurs angajat', remaining: 'Verificări neconfirmate', active: 'Activ', inactive: 'Inactiv', missingAttendance: 'Pontaj neînregistrat',
    pendingSync: 'Înregistrări în așteptarea sincronizării în situația zilnică', local: 'Local', pending: 'În așteptare', synced: 'Sincronizat', conflict: 'Conflict', unknown: 'Nespecificat',
    conform: 'Conform în aplicație', nonconform: 'Neconformitate înregistrată', scheduled: 'Programat', present: 'Prezent', absent: 'Absent', leave: 'Concediu', day_off: 'Liber',
  },
  en: {
    title: 'Inspection dossier', audit: 'Internal audit', date: 'Assessment date', generated: 'Generated', snapshot: 'Data loaded', location: 'HACCP location',
    disclaimer: 'Internal information report based on records available in the application. It does not certify legal compliance or guarantee an inspection outcome. The score reflects only the automated checks shown; original documents and applicable requirements must be reviewed separately.',
    scope: 'The register and HR overview include all available account records. HACCP tasks apply to the stated date and location. HACCP forms include all saved periods. This summary does not replace original documents.',
    checks: 'Readiness checks', recorded: 'Recorded', review: 'Review required', issues: 'Unresolved issues', noIssues: 'No issues flagged by the included checks. Original documents still require review.',
    documents: 'Document register', document: 'Document / category', owner: 'Responsible person', issueDate: 'Issued', expiryDate: 'Expires', dates: 'Dates', status: 'Status', notes: 'Notes', empty: 'No records available',
    haccp: 'HACCP evidence', tasks: 'Required tasks for the assessment date', task: 'Task', progress: 'Progress', forms: 'Recorded forms - all periods', form: 'Form', period: 'Period', rows: 'Rows', confirmation: 'Awaiting confirmation', headerConfirmation: 'Unconfirmed header',
    hr: 'HR evidence', employee: 'Employee / role', attendance: 'Attendance for the assessment date', lifecycle: 'Employee lifecycle', remaining: 'Unconfirmed checks', active: 'Active', inactive: 'Inactive', missingAttendance: 'Attendance not recorded',
    pendingSync: 'Records awaiting synchronization in the daily overview', local: 'Local', pending: 'Pending', synced: 'Synchronized', conflict: 'Conflict', unknown: 'Not specified',
    conform: 'Conform in the application', nonconform: 'Recorded nonconformity', scheduled: 'Scheduled', present: 'Present', absent: 'Absent', leave: 'Leave', day_off: 'Day off',
  },
} as const;

const escapeHtml = (value: string | number) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const shown = (value: string | number | undefined) => escapeHtml(value === undefined || value === '' ? '—' : value);

/** A summary of recorded evidence, never a compliance certificate. */
export function buildControlReportHtml(data: ControlReportData, authority: InspectionAuthority, locale: Locale, generatedAt = new Date()) {
  const l = labels[locale];
  const checks = inspectionReadiness(authority, data.input, locale);
  const includeHaccp = authority !== 'ITM';
  const includeHr = authority === 'ITM' || authority === 'AUDIT';
  const authorityLabel = authority === 'AUDIT' ? l.audit : authority;
  const syncLabel = (state?: OperationalDocument['syncState']) => state ? l[state] : l.unknown;
  const table = (headings: readonly string[], rows: string[][]) => `<table><thead><tr>${headings.map((heading) => `<th>${escapeHtml(heading)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headings.length}">${l.empty}</td></tr>`}</tbody></table>`;
  const issues = checks.filter((check) => !check.ok).map((check) => check.label);
  if (data.pendingSync) issues.push(`${l.pendingSync}: ${data.pendingSync}`);
  for (const doc of data.documents) {
    if (doc.expiryAttention) issues.push(`${doc.title}: ${doc.expiryLabel} (${doc.expiryDate || '—'})`);
    if (doc.syncState === 'conflict' || doc.syncState === 'pending') issues.push(`${doc.title}: ${syncLabel(doc.syncState)}`);
  }
  if (includeHaccp) {
    for (const task of data.haccpTasks.filter((task) => task.status !== 'conform')) issues.push(`${task.title}: ${l[task.status]} (${task.completedSteps}/${task.totalSteps})`);
    for (const doc of data.haccpDocuments) {
      const unconfirmed = doc.rows.filter((row) => haccpRowNeedsConfirmation(row.values)).length;
      if (unconfirmed) issues.push(`${doc.formCode}: ${l.confirmation} (${unconfirmed})`);
      if (haccpHeaderNeedsConfirmation(doc.headerValues)) issues.push(`${doc.formCode}: ${l.headerConfirmation}`);
    }
  }
  if (includeHr) {
    for (const employee of data.employees) {
      if (employee.active && !employee.attendance.some((status) => status !== 'scheduled')) issues.push(`${employee.name}: ${l.missingAttendance}`);
      if (employee.pendingChecks.length) issues.push(`${employee.name}: ${employee.pendingChecks.join('; ')}`);
    }
  }
  const documents = table([l.document, l.owner, l.dates, l.status, l.notes], data.documents.map((doc) => [
    `<strong>${shown(doc.title)}</strong><br>${shown(doc.categoryLabel)}`, shown(doc.owner),
    `${l.issueDate}: ${shown(doc.issueDate)}<br>${l.expiryDate}: ${shown(doc.expiryDate)}`,
    `${shown(doc.expiryLabel)}<br>${shown(syncLabel(doc.syncState))}`, shown(doc.notes),
  ]));
  const haccp = includeHaccp ? `<section><h2>${l.haccp}</h2><h3>${l.tasks}</h3>${table([l.task, l.progress, l.status], data.haccpTasks.map((task) => [
    `<strong>${shown(task.title)}</strong><br>${shown(task.subtitle)}<br>${shown(task.formCode)}`, `${task.completedSteps}/${task.totalSteps}`, l[task.status],
  ]))}<h3>${l.forms}</h3>${table([l.form, l.period, l.location, l.rows, l.status], data.haccpDocuments.map((doc) => {
    const form = getHaccpForm(doc.formCode);
    const unconfirmed = doc.rows.filter((row) => haccpRowNeedsConfirmation(row.values)).length;
    const period = doc.headerValues.date || doc.headerValues.period || [doc.headerValues.month, doc.headerValues.year].filter(Boolean).join('/');
    return [`${shown(doc.formCode)}<br>${shown(form ? localize(form.shortTitle, locale) : '')}`, shown(period), shown(doc.headerValues._location_name || doc.headerValues.location), String(doc.rows.length),
      `${l.confirmation}: ${unconfirmed}<br>${haccpHeaderNeedsConfirmation(doc.headerValues) ? `${l.headerConfirmation}<br>` : ''}${shown(syncLabel(doc.syncState))}`];
  }))}</section>` : '';
  const hr = includeHr ? `<section><h2>${l.hr}</h2>${table([l.employee, l.attendance, l.lifecycle, l.remaining, l.notes], data.employees.map((employee) => [
    `<strong>${shown(employee.name)}</strong><br>${shown(employee.role)}<br>${shown(employee.location)}<br>${employee.active ? l.active : l.inactive}`,
    employee.attendance.length ? employee.attendance.map((status) => l[status]).join('<br>') : l.missingAttendance,
    `${shown(employee.lifecycleStatus)}<br>${employee.completed}/${employee.total}`, employee.pendingChecks.map(escapeHtml).join('<br>') || '—', shown(employee.notes),
  ]))}</section>` : '';
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${l.title} - ${authorityLabel}</title><style>
    @page { size: A4 portrait; margin: 14mm; } * { box-sizing: border-box; }
    body { font: 10px Arial, sans-serif; color: #142c40; line-height: 1.45; margin: 0; }
    header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #c69536; padding-bottom: 12px; }
    .logo { width: 180px; max-height: 65px; object-fit: contain; } .brand { text-align: right; font-weight: bold; }
    h1 { font-size: 23px; margin: 17px 0 4px; } h2 { font-size: 15px; margin: 20px 0 8px; } h3 { font-size: 11px; margin: 12px 0 7px; }
    h1, h2, h3 { break-after: avoid; } p { margin: 6px 0; } .notice { background: #eef4f3; border-left: 3px solid #c69536; padding: 10px; }
    .meta { color: #3f5869; } table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 7px 0 12px; }
    th, td { border: 1px solid #ccd6db; padding: 6px; vertical-align: top; overflow-wrap: anywhere; white-space: pre-wrap; }
    th { background: #ecf1f3; text-align: left; font-size: 9px; } td { font-size: 9px; } thead { display: table-header-group; }
    tr { break-inside: avoid; } li { margin-bottom: 5px; overflow-wrap: anywhere; } footer { border-top: 1px solid #ccd6db; margin-top: 18px; padding-top: 8px; color: #526575; }
  </style></head><body><header><img class="logo" src="${PARADIM_LOGO_DATA_URI}" alt="Manager 24/7"><div class="brand">MANAGER 24/7<br>PARADIM Operations SRL</div></header>
  <h1>${l.title} · ${authorityLabel}</h1><p class="meta">${l.date}: ${shown(data.date)} · ${l.location}: ${shown(data.location)}</p>
  <p class="meta">${l.generated}: ${escapeHtml(generatedAt.toLocaleString(locale === 'ro' ? 'ro-RO' : 'en-GB'))}<br>${l.snapshot}: ${shown(data.updatedAt)}</p>
  <p class="notice">${l.disclaimer}</p><p>${l.scope}</p>
  <section><h2>${l.checks} · ${readinessScore(checks)}%</h2>${table([l.checks, l.status], checks.map((check) => [escapeHtml(check.label), check.ok ? l.recorded : l.review]))}</section>
  <section><h2>${l.issues}</h2>${issues.length ? `<ul>${[...new Set(issues)].map((issue) => `<li>${escapeHtml(issue)}</li>`).join('')}</ul>` : `<p>${l.noIssues}</p>`}</section>
  <section><h2>${l.documents}</h2>${documents}</section>${haccp}${hr}<footer>MANAGER 24/7 · PARADIM Operations SRL · ${l.title} · ${authorityLabel} · ${shown(data.date)}</footer></body></html>`;
}
