/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import {
  displayHaccpValue,
  getHaccpForm,
  localize,
  type HaccpFieldDefinition,
  type HaccpFormDefinition,
} from '@/constants/haccp-forms';
import { clearUnconfirmedHeader, clearUnconfirmedMeasurements, haccpHeaderNeedsConfirmation, haccpRowNeedsConfirmation } from '@/lib/haccp-confirmation';
import type { Locale } from '@/i18n/translations';
import { productLegalNotice } from '@/constants/legal';
import { COMPANY_CONTACT_LINE } from '@/constants/paradim';
import type { HaccpDocument, HaccpDocumentRow } from '@/types/haccp';

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function shown(value: string | undefined) {
  return escapeHtml(value?.trim() || '—');
}

function valueFor(field: HaccpFieldDefinition, value: string | undefined, locale: Locale) {
  return shown(displayHaccpValue(field, value ?? '', locale));
}

function metaTable(document: HaccpDocument, form: HaccpFormDefinition, locale: Locale) {
  if (!form.documentFields.length) return '';
  return `<table class="meta"><tbody>${form.documentFields.map((field) => `
    <tr><th>${escapeHtml(localize(field.label, locale))}</th><td>${valueFor(field, document.headerValues[field.key], locale)}</td></tr>`).join('')}
  </tbody></table>`;
}

function standardTable(document: HaccpDocument, form: HaccpFormDefinition, locale: Locale) {
  const headers = form.rowFields.map((field) => `<th>${escapeHtml(localize(field.label, locale))}</th>`).join('');
  const rows = document.rows.length
    ? document.rows.map((row, index) => `<tr><td class="number">${index + 1}</td>${form.rowFields.map((field) => `<td>${valueFor(field, row.values[field.key], locale)}</td>`).join('')}</tr>`).join('')
    : `<tr><td class="number">1</td>${form.rowFields.map(() => '<td>&nbsp;</td>').join('')}</tr>`;
  return `<table class="records"><thead><tr><th class="number">Nr.</th>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

function orderedMatrixRows(document: HaccpDocument, form: HaccpFormDefinition) {
  const axis = form.rowFields[0];
  if (!axis) return [];
  const byAxis = new Map(document.rows.map((row) => [row.values[axis.key], row]));
  const order = form.axisOrder ?? document.rows.map((row) => row.values[axis.key]);
  return order.map((value) => ({ value, row: byAxis.get(value) }));
}

function matrixTable(document: HaccpDocument, form: HaccpFormDefinition, locale: Locale) {
  const [axis, ...fields] = form.rowFields;
  if (!axis) return '';
  const columns = orderedMatrixRows(document, form);
  const matrixFields = fields.filter((field) => field.type !== 'multiline');
  const noteFields = fields.filter((field) => field.type === 'multiline');
  const axisHeader = columns.map(({ value }) => `<th class="matrix-axis">${valueFor(axis, value, locale)}</th>`).join('');
  const body = matrixFields.map((field) => `<tr><th class="matrix-label">${escapeHtml(localize(field.label, locale))}</th>${columns.map(({ row }) => `<td>${valueFor(field, row?.values[field.key], locale)}</td>`).join('')}</tr>`).join('');
  const notes = noteFields.flatMap((field) => document.rows
    .filter((row) => row.values[field.key]?.trim())
    .map((row) => `<tr><td>${valueFor(axis, row.values[axis.key], locale)}</td><td>${escapeHtml(localize(field.label, locale))}</td><td>${valueFor(field, row.values[field.key], locale)}</td></tr>`))
    .join('');
  return `<table class="records matrix"><thead><tr><th class="matrix-label">${escapeHtml(localize(axis.label, locale))}</th>${axisHeader}</tr></thead><tbody>${body}</tbody></table>
    ${notes ? `<h2>${locale === 'ro' ? 'Observații și măsuri' : 'Notes and actions'}</h2><table class="records notes"><thead><tr><th>${locale === 'ro' ? 'Perioada' : 'Period'}</th><th>${locale === 'ro' ? 'Câmp' : 'Field'}</th><th>${locale === 'ro' ? 'Conținut' : 'Content'}</th></tr></thead><tbody>${notes}</tbody></table>` : ''}`;
}

function declaration(document: HaccpDocument, form: HaccpFormDefinition, locale: Locale) {
  const fields = form.documentFields.map((field) => {
    const raw = document.headerValues[field.key] ?? '';
    if (field.type === 'choice' && field.options?.length) {
      const options = field.options.map((item) => `${item.value === raw ? '☒' : '☐'} ${escapeHtml(localize(item.label, locale))}`).join('&nbsp;&nbsp;&nbsp;');
      return `<tr><th>${escapeHtml(localize(field.label, locale))}</th><td>${options}</td></tr>`;
    }
    return `<tr><th>${escapeHtml(localize(field.label, locale))}</th><td>${valueFor(field, raw, locale)}</td></tr>`;
  }).join('');
  const rules = form.rules?.length
    ? `<h2>${locale === 'ro' ? 'Reguli interne' : 'Internal rules'}</h2><ol class="rules">${form.rules.map((rule) => `<li>${escapeHtml(localize(rule, locale))}</li>`).join('')}</ol>`
    : '';
  return `<table class="declaration"><tbody>${fields}</tbody></table>${rules}`;
}

export function buildHaccpDocumentHtml(
  document: HaccpDocument,
  form: HaccpFormDefinition,
  locale: Locale,
  logoDataUri?: string | null,
) {
  const pending = document.rows.filter((row) => haccpRowNeedsConfirmation(row.values)).length;
  const headerPending = haccpHeaderNeedsConfirmation(document.headerValues);
  document = { ...document, headerValues: clearUnconfirmedHeader(document.headerValues, form), rows: document.rows.map((row) => ({ ...row, values: clearUnconfirmedMeasurements(row.values) })) };
  const title = localize(form.title, locale);
  const body = form.layout === 'matrix'
    ? matrixTable(document, form, locale)
    : form.layout === 'declaration'
      ? declaration(document, form, locale)
      : standardTable(document, form, locale);
  const generated = new Date().toLocaleString(locale === 'ro' ? 'ro-RO' : 'en-GB');
  const logo = logoDataUri
    ? `<img class="logo" src="${escapeHtml(logoDataUri)}" alt="Manager 24/7" />`
    : '<div class="brand">Manager 24/7</div>';

  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><style>
    @page { size: A4 ${form.orientation}; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #031b33; font-family: Arial, Helvetica, sans-serif; font-size: 9px; }
    .document-header { display: flex; justify-content: space-between; align-items: center; min-height: 62px; margin-bottom: 8px; }
    .logo { width: 62px; height: 62px; border-radius: 50%; object-fit: cover; }
    .brand { color: #062544; font-size: 22px; font-weight: 700; letter-spacing: 1px; }
    .code { text-align: right; font-weight: 700; font-size: 10px; }
    .company { color: #667482; font-size: 8px; margin-top: 3px; }
    h1 { margin: 0 0 7px; padding: 7px 9px; color: #fff; background: #062544; font-size: 15px; line-height: 1.2; text-align: center; }
    h2 { margin: 12px 0 6px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
    tr { page-break-inside: avoid; }
    th, td { border: 0.7px solid #d2a440; padding: 4px 5px; vertical-align: middle; overflow-wrap: anywhere; }
    th { background: #062544; color: #fff; font-weight: 700; }
    .meta { margin-bottom: 8px; }
    .meta th { width: 19%; text-align: left; background: #f2e3bd; color: #031b33; }
    .meta td { width: 31%; min-height: 20px; }
    .records { table-layout: fixed; font-size: ${form.rowFields.length > 8 ? '6.5px' : '8px'}; }
    .records thead { display: table-header-group; }
    .records tbody tr:nth-child(even) td { background: #fbf8f1; }
    .number { width: 25px; text-align: center; }
    .matrix { font-size: 5.7px; table-layout: fixed; }
    .matrix-label { width: 155px; text-align: left; }
    .matrix-axis { width: auto; text-align: center; padding: 3px 1px; }
    .matrix td { padding: 3px 1px; text-align: center; }
    .notes { margin-top: 5px; }
    .declaration th { width: 58%; text-align: left; background: #f2e3bd; color: #031b33; }
    .declaration td { font-size: 9px; }
    .rules { margin: 6px 0 0 18px; padding: 0; }
    .rules li { margin-bottom: 5px; }
    .instructions { margin-top: 9px; color: #4f5f6d; font-size: 8px; line-height: 1.35; }
    .footer { margin-top: 10px; padding-top: 5px; border-top: 1px solid #d2a440; color: #667482; font-size: 7px; display: flex; justify-content: space-between; }
  </style></head><body>
    <header class="document-header"><div>${logo}</div><div class="code">${escapeHtml(form.code)}<div class="company">Manager 24/7 · PARADIM Operations<br>${escapeHtml(COMPANY_CONTACT_LINE)}</div></div></header>
    <h1>${escapeHtml(title.toUpperCase())}</h1>
    ${form.layout === 'declaration' ? '' : metaTable(document, form, locale)}
    ${pending || headerPending ? `<p><strong>${locale === 'ro' ? 'SCHIȚĂ - confirmarea operatorului este necesară' : 'DRAFT - operator confirmation required'}${pending ? ` (${pending})` : ''}</strong></p>` : ''}
    ${body}
    ${form.instructions ? `<p class="instructions">${escapeHtml(localize(form.instructions, locale))}</p>` : ''}
    <footer class="footer"><span>Manager 24/7 by PARADIM Operations · ${escapeHtml(COMPANY_CONTACT_LINE)}<br>${escapeHtml(productLegalNotice(locale))}</span><span>${locale === 'ro' ? 'Generat' : 'Generated'}: ${escapeHtml(generated)}</span></footer>
  </body></html>`;
}

export function buildHaccpControlPackHtml(
  documents: readonly HaccpDocument[],
  locale: Locale,
  periodLabel: string,
  logoDataUri?: string | null,
) {
  const entries = [...documents].sort((left, right) => (
    left.formCode.localeCompare(right.formCode) || left.updatedAt.localeCompare(right.updatedAt)
  )).flatMap((document) => {
    const form = getHaccpForm(document.formCode);
    return form ? [{ document, form }] : [];
  });
  const generated = new Date().toLocaleString(locale === 'ro' ? 'ro-RO' : 'en-GB');
  const logo = logoDataUri
    ? `<img class="logo" src="${escapeHtml(logoDataUri)}" alt="Manager 24/7" />`
    : '<div class="brand">Manager 24/7</div>';
  const sections = entries.map(({ document, form }) => {
    const pending = document.rows.filter((row) => haccpRowNeedsConfirmation(row.values)).length;
    const headerPending = haccpHeaderNeedsConfirmation(document.headerValues);
    document = { ...document, headerValues: clearUnconfirmedHeader(document.headerValues, form), rows: document.rows.map((row) => ({ ...row, values: clearUnconfirmedMeasurements(row.values) })) };
    const body = form.layout === 'matrix'
      ? matrixTable(document, form, locale)
      : form.layout === 'declaration'
        ? declaration(document, form, locale)
        : standardTable(document, form, locale);
    return `<section class="document">
      <header class="document-header"><div>${logo}</div><div class="code">${escapeHtml(form.code)}<div class="company">Manager 24/7 · PARADIM Operations<br>${escapeHtml(COMPANY_CONTACT_LINE)}</div></div></header>
      <h1>${escapeHtml(localize(form.title, locale).toUpperCase())}</h1>
      ${form.layout === 'declaration' ? '' : metaTable(document, form, locale)}
      ${pending || headerPending ? `<p><strong>${locale === 'ro' ? 'SCHIȚĂ - confirmarea operatorului este necesară' : 'DRAFT - operator confirmation required'}${pending ? ` (${pending})` : ''}</strong></p>` : ''}
      ${body}
      ${form.instructions ? `<p class="instructions">${escapeHtml(localize(form.instructions, locale))}</p>` : ''}
      <footer><span>${escapeHtml(periodLabel)}</span><span>${locale === 'ro' ? 'Generat' : 'Generated'}: ${escapeHtml(generated)}</span></footer>
    </section>`;
  }).join('');

  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><style>
    @page { size: A4 landscape; margin: 9mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #031b33; font-family: Arial, Helvetica, sans-serif; font-size: 8px; }
    .cover { min-height: 180mm; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; break-after: page; page-break-after: always; }
    .cover .logo { width: 90px; height: 90px; object-fit: contain; }
    .cover h1 { width: 100%; font-size: 24px; margin: 16px 0 8px; }
    .cover p { font-size: 12px; color: #4f5f6d; margin: 4px; }
    .document { break-after: page; page-break-after: always; }
    .document:last-child { break-after: auto; page-break-after: auto; }
    .document-header { display: flex; justify-content: space-between; align-items: center; min-height: 50px; margin-bottom: 6px; }
    .logo { width: 48px; height: 48px; object-fit: contain; }
    .brand { color: #062544; font-size: 18px; font-weight: 700; }
    .code { text-align: right; font-weight: 700; font-size: 9px; }
    .company { color: #667482; font-size: 7px; margin-top: 2px; }
    h1 { margin: 0 0 6px; padding: 6px 8px; color: #fff; background: #062544; font-size: 13px; text-align: center; }
    h2 { margin: 9px 0 5px; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    tr { page-break-inside: avoid; }
    th, td { border: .6px solid #d2a440; padding: 3px 4px; vertical-align: middle; overflow-wrap: anywhere; }
    th { background: #062544; color: #fff; font-weight: 700; }
    .meta { margin-bottom: 6px; }
    .meta th { width: 17%; text-align: left; background: #f2e3bd; color: #031b33; }
    .meta td { width: 33%; }
    .records { font-size: 7px; }
    .records thead { display: table-header-group; }
    .records tbody tr:nth-child(even) td { background: #fbf8f1; }
    .number { width: 22px; text-align: center; }
    .matrix { font-size: 5.2px; }
    .matrix-label { width: 145px; text-align: left; }
    .matrix-axis { text-align: center; padding: 2px 1px; }
    .matrix td { text-align: center; padding: 2px 1px; }
    .declaration th { width: 55%; text-align: left; background: #f2e3bd; color: #031b33; }
    .rules { margin: 5px 0 0 16px; padding: 0; }
    .instructions { margin-top: 7px; color: #4f5f6d; font-size: 7px; }
    footer { margin-top: 7px; padding-top: 4px; border-top: 1px solid #d2a440; color: #667482; font-size: 6.5px; display: flex; justify-content: space-between; }
  </style></head><body>
    <section class="cover">${logo}<h1>${locale === 'ro' ? 'PACHET HACCP PENTRU CONTROL' : 'HACCP INSPECTION PACK'}</h1><p>${escapeHtml(periodLabel)}</p><p>${entries.length} ${locale === 'ro' ? 'documente incluse' : 'documents included'}</p><p>Manager 24/7 · PARADIM Operations<br>${escapeHtml(COMPANY_CONTACT_LINE)}</p></section>
    ${sections || `<section class="document"><h1>${locale === 'ro' ? 'NU EXISTĂ DOCUMENTE ÎN PERIOADA SELECTATĂ' : 'NO DOCUMENTS IN SELECTED PERIOD'}</h1></section>`}
  </body></html>`;
}

/** Selects the logical HACCP period rather than only the record's sync timestamp. */
export function haccpDocumentMatchesMonth(document: HaccpDocument, selectedDate: string) {
  const target = selectedDate.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(target)) return false;
  const [year, month] = target.split('-');
  const header = document.headerValues;
  if (header.year === year && header.month?.padStart(2, '0') === month) return true;

  const periodValues = Object.entries(header)
    .filter(([key]) => /date|period|month|year/i.test(key))
    .map(([, value]) => value.trim());
  const rowDateValues = document.rows.flatMap((row) => Object.entries(row.values)
    .filter(([key]) => /date/i.test(key))
    .map(([, value]) => value.trim()));
  const explicitValues = [...periodValues, ...rowDateValues];
  if (explicitValues.some((value) => (
    value.startsWith(target)
    || value.includes(`${month}/${year}`)
    || value.includes(`${month}.${year}`)
  ))) return true;

  return explicitValues.length === 0
    && (document.createdAt.startsWith(target) || document.updatedAt.startsWith(target));
}

export function haccpDocumentSummary(document: HaccpDocument, form: HaccpFormDefinition, locale: Locale) {
  const values = document.headerValues;
  const location = values.location || values.cold_room || '';
  const period = values.date || values.period || [values.month, values.year].filter(Boolean).join('/') || document.updatedAt.slice(0, 10);
  return [localize(form.shortTitle, locale), location, period].filter(Boolean).join(' · ');
}

export function sortHaccpRows(rows: readonly HaccpDocumentRow[], form: HaccpFormDefinition) {
  const axis = form.rowFields[0];
  if (!axis) return [...rows];
  if (form.axisOrder) {
    const position = new Map(form.axisOrder.map((value, index) => [value, index]));
    return [...rows].sort((left, right) => (position.get(left.values[axis.key]) ?? 999) - (position.get(right.values[axis.key]) ?? 999));
  }
  return [...rows].sort((left, right) => (left.values[axis.key] ?? '').localeCompare(right.values[axis.key] ?? ''));
}
