import { translate, INTL_LOCALE, type Locale, type TranslationKey } from '@/i18n/translations';
import { PARADIM_LOGO_DATA_URI } from '@/constants/brand-logo';
import { COMPANY_CONTACT_LINE } from '@/constants/paradim';
import {
  getFoodOriginLabels,
  getWasteDossierChecklist,
  getWasteReasonLabels,
} from '@/lib/waste-compliance-model';
import type { WasteEntry } from '@/types/operations-control';
import type { FoodRedistribution, WastePreventionPlan, WasteReceiver } from '@/types/waste-compliance';

function createWasteSheet(locale: Locale) {
  const t = (key: TranslationKey) => translate(locale, key);
  const FOOD_ORIGIN_LABELS = getFoodOriginLabels(locale);
  const WASTE_REASON_LABELS = getWasteReasonLabels(locale);
  const WASTE_DOSSIER_CHECKLIST = getWasteDossierChecklist(locale);
  const esc = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const formatDate = (value: string | null | undefined) => value
    ? new Intl.DateTimeFormat(INTL_LOCALE[locale]).format(new Date(`${value.slice(0, 10)}T12:00:00`))
    : '—';
  const money = (value: number) => locale === 'ro' ? `${value.toFixed(2).replace('.', ',')} lei` : `${value.toFixed(2)} RON`;
  const decimal = (value: number, digits = 3) => locale === 'ro' ? value.toFixed(digits).replace('.', ',') : value.toFixed(digits);

  const labels: Record<string, string> = {
    staff_training: t('waste.measure.staff_training'), production_planning: t('waste.measure.production_planning'),
    fifo: t('waste.measure.fifo'), discount_sale: t('waste.measure.discount_sale'),
    consumer_redistribution: t('waste.measure.consumer_redistribution'), receiver_donation: t('waste.measure.receiver_donation'),
    animal_feed: t('waste.measure.animal_feed'), compost_biogas: t('waste.measure.compost_biogas'),
  };

  const css = `<style>
    @page{size:A4;margin:13mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#17212b;font-size:9pt;margin:0}
    header{display:flex;align-items:center;gap:10px;border-bottom:2px solid #d8aa37;padding-bottom:7px;margin-bottom:10px}header img{width:52px;height:52px;object-fit:contain}.brand{flex:1}.brand b{display:block;color:#062544;font-size:14pt}.brand small,.doc-meta{color:#667482;font-size:7pt;line-height:1.5}.doc-meta{text-align:right}
    h1{color:#062544;font-size:18pt;text-align:center;margin:12px 0 4px}h2{color:#0b6a68;font-size:12pt;margin:17px 0 6px;border-bottom:1px solid #dde4e8;padding-bottom:4px}.subtitle{text-align:center;color:#667482;margin:0 0 12px}.box{border:1px solid #dde4e8;border-radius:8px;padding:10px;margin:8px 0;line-height:1.55}.grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.metric{background:#eef7f6;border:1px solid #d6e9e7;border-radius:7px;padding:8px}.metric b{display:block;color:#062544;font-size:12pt}.metric small{color:#667482;text-transform:uppercase}
    table{width:100%;border-collapse:collapse;table-layout:auto;font-size:7.2pt}th,td{border:1px solid #cfd8dd;padding:4px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#062544;color:#fff;text-align:center}td.num{text-align:right;font-variant-numeric:tabular-nums}.notice{background:#fff3dc;border-left:4px solid #d8aa37;padding:9px;margin:10px 0}.ok{color:#126845;font-weight:bold}.danger{color:#a12e37;font-weight:bold}.page{break-before:page}.signature{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:28px}.signature div{border-top:1px solid #667482;padding-top:5px;color:#667482}.footer{margin-top:20px;padding-top:7px;border-top:1px solid #dde4e8;font-size:7pt;color:#667482;display:flex;justify-content:space-between}
  </style>`;

  function header(title: string, generatedAt = new Date()) {
    return `<header><img src="${PARADIM_LOGO_DATA_URI}" alt="${t('waste.pdf.logo')}"><div class="brand"><b>MANAGER 24/7 by PARADIM</b><small>PARADIM Operations SRL · Iași, ${t('waste.pdf.romania')}<br>${esc(COMPANY_CONTACT_LINE)}</small></div><div class="doc-meta"><strong>${esc(title)}</strong><br>${t('waste.pdf.generated')} ${esc(new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: 'medium', timeStyle: 'short' }).format(generatedAt))}</div></header>`;
  }

  function footer() {
    return `<div class="footer"><span>${t('waste.pdf.footer')}</span><span>PARADIM Operations SRL · ${esc(COMPANY_CONTACT_LINE)}</span></div>`;
  }

  function operatorBox(plan?: WastePreventionPlan | null) {
    if (!plan) return `<div class="notice">${t('waste.pdf.noOperator')}</div>`;
    return `<div class="box"><b>${t('waste.pdf.operator')}</b> ${esc(plan.companyName)} &nbsp; <b>${t('waste.pdf.taxId')}</b> ${esc(plan.companyTaxId)}<br><b>${t('waste.pdf.address')}</b> ${esc(plan.companyAddress || '—')}<br><b>${t('waste.pdf.authorization')}</b> ${esc(plan.companyAuthorization || '—')}<br><b>${t('waste.pdf.representative')}</b> ${esc(plan.legalRepresentative || '—')} &nbsp; <b>${t('waste.pdf.responsible')}</b> ${esc(plan.responsiblePerson || '—')}<br><b>${t('waste.pdf.contact')}</b> ${esc(plan.companyPhone || '—')} · ${esc(plan.companyEmail || '—')}</div>`;
  }

  function receiverFor(id: string | null, receivers: readonly WasteReceiver[]) {
    return receivers.find((receiver) => receiver.id === id) ?? null;
  }

  function annualReportRows(year: number, transfers: readonly FoodRedistribution[], receivers: readonly WasteReceiver[]) {
    return transfers.filter((transfer) => transfer.transferDate.startsWith(String(year))).map((transfer, index) => {
      const receiver = receiverFor(transfer.receiverId, receivers);
      const destination = transfer.destinationType === 'consumer' ? t('waste.finalConsumers') : receiver?.name ?? t('waste.pdf.noReceiver');
      return `<tr><td class="num">${index + 1}</td><td>${esc(FOOD_ORIGIN_LABELS[transfer.productOrigin])}<br><small>${esc(transfer.productName)}${transfer.productCategory ? ` · ${esc(transfer.productCategory)}` : ''}</small></td><td>${esc(destination)}</td><td>${esc(receiver?.taxId || '—')}</td><td class="num">${decimal(transfer.quantityKg)}</td><td>${esc(receiver?.contractReference || transfer.documentReference || '—')}</td><td class="num">${esc(money(transfer.estimatedValue))}</td></tr>`;
    }).join('');
  }

  function redistributionDetailRows(year: number, transfers: readonly FoodRedistribution[], receivers: readonly WasteReceiver[]) {
    return transfers.filter((transfer) => transfer.transferDate.startsWith(String(year))).map((transfer) => {
      const receiver = receiverFor(transfer.receiverId, receivers);
      return `<tr><td>${esc(formatDate(transfer.transferDate))}</td><td>${esc(transfer.productName)}</td><td class="num">${esc(transfer.quantity)} ${esc(transfer.unit === 'buc' && locale === 'en' ? 'pcs' : transfer.unit)}<br>${decimal(transfer.quantityKg)} kg</td><td>${esc(receiver?.name ?? t('waste.finalConsumers'))}</td><td>${esc(formatDate(transfer.expiryDate))}</td><td class="num">${transfer.temperatureC === null ? '—' : `${decimal(transfer.temperatureC, 1)} °C`}</td><td>${esc(transfer.traceabilityReference || '—')}</td><td>${esc(transfer.documentReference || '—')}</td><td>${transfer.safetyCheck === 'compliant' ? `<span class="ok">${t('waste.pdf.compliant')}</span>` : `<span class="danger">${t('waste.pdf.blocked')}</span>`}</td></tr>`;
    }).join('');
  }

  function wasteRows(year: number, entries: readonly WasteEntry[]) {
    return entries.filter((entry) => entry.eventDate.startsWith(String(year))).map((entry) => `<tr><td>${esc(formatDate(entry.eventDate))}</td><td>${esc(entry.itemName)}</td><td class="num">${esc(entry.quantity)} ${esc(entry.unit === 'buc' && locale === 'en' ? 'pcs' : entry.unit)}</td><td>${esc(WASTE_REASON_LABELS[entry.reason] ?? entry.reason)}</td><td class="num">${esc(money(entry.value))}</td><td>${esc(entry.notes || '—')}</td></tr>`).join('');
  }

  function buildWastePlanHtml(plan: WastePreventionPlan) {
    return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">${css}</head><body>${header(t('waste.pdf.planHeader'))}<h1>${t('waste.pdf.planTitle')}</h1><p class="subtitle">${t('waste.pdf.reportingYear')} ${plan.reportingYear} · Status: ${esc(plan.status)}</p>${operatorBox(plan)}<h2>${t('waste.pdf.selectedMeasures')}</h2><ol>${plan.measures.map((measure) => `<li>${esc(labels[measure] ?? measure)}</li>`).join('')}</ol><h2>${t('waste.pdf.objectives')}</h2><div class="box">${esc(plan.objectives).replace(/\n/g, '<br>')}</div><div class="notice">${t('waste.pdf.planNotice')}</div><div class="signature"><div>${t('waste.pdf.legalSignature')}</div><div>${t('waste.pdf.signature')}</div></div>${footer()}</body></html>`;
  }

  function buildRedistributionReportHtml(
    year: number,
    transfers: FoodRedistribution[],
    receivers: WasteReceiver[],
    plan?: WastePreventionPlan | null,
  ) {
    const yearTransfers = transfers.filter((transfer) => transfer.transferDate.startsWith(String(year)));
    const rows = annualReportRows(year, transfers, receivers);
    const totalKg = yearTransfers.reduce((sum, transfer) => sum + transfer.quantityKg, 0);
    const totalValue = yearTransfers.reduce((sum, transfer) => sum + transfer.estimatedValue, 0);
    return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">${css}</head><body>${header(t('waste.pdf.reportHeader'))}<h1>${t('waste.pdf.reportTitle')}</h1><p class="subtitle">${t('waste.pdf.reportSubtitle')} 01.01.${year}–31.12.${year}</p>${operatorBox(plan)}<div class="grid"><div class="metric"><b>${yearTransfers.length}</b><small>${t('waste.pdf.transfers')}</small></div><div class="metric"><b>${decimal(totalKg)} kg</b><small>${t('waste.pdf.redistributedQuantity')}</small></div><div class="metric"><b>${money(totalValue)}</b><small>${t('waste.pdf.estimatedValue')}</small></div><div class="metric"><b>${t('waste.pdf.deadlineDate')} ${year + 1}</b><small>${t('waste.pdf.deadline')}</small></div></div><h2>${t('waste.pdf.annualSummary')}</h2><table><thead><tr><th>${t('waste.pdf.number')}</th><th>${t('waste.pdf.category')}</th><th>${t('waste.pdf.destination')}</th><th>${t('waste.pdf.receiverTaxId')}</th><th>${t('waste.pdf.kg')}</th><th>${t('waste.pdf.contract')}</th><th>${t('waste.pdf.value')}</th></tr></thead><tbody>${rows || `<tr><td colspan="7">${t('waste.pdf.noPeriodTransfers')}</td></tr>`}</tbody></table><div class="notice">${t('waste.pdf.reportNotice')}</div><div class="signature"><div>${t('waste.pdf.preparedSignature')}</div><div>${t('waste.pdf.legalSignature')}</div></div>${footer()}</body></html>`;
  }

  function buildWasteDossierHtml(
    year: number,
    plan: WastePreventionPlan | null,
    transfers: FoodRedistribution[],
    receivers: WasteReceiver[],
    wasteEntries: WasteEntry[],
  ) {
    const yearTransfers = transfers.filter((transfer) => transfer.transferDate.startsWith(String(year)));
    const yearWaste = wasteEntries.filter((entry) => entry.eventDate.startsWith(String(year)));
    const totalKg = yearTransfers.reduce((sum, transfer) => sum + transfer.quantityKg, 0);
    const donatedValue = yearTransfers.reduce((sum, transfer) => sum + transfer.estimatedValue, 0);
    const wasteValue = yearWaste.reduce((sum, entry) => sum + entry.value, 0);
    const activeReceivers = receivers.filter((receiver) => receiver.active);
    return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">${css}</head><body>
      ${header(t('waste.pdf.dossierHeader'))}<h1>${t('waste.pdf.dossierTitle')}</h1><p class="subtitle">${t('waste.pdf.dossierSubtitle')} ${year}</p>${operatorBox(plan)}
      <div class="grid"><div class="metric"><b>${yearWaste.length}</b><small>${t('waste.pdf.wasteRecords')}</small></div><div class="metric"><b>${money(wasteValue)}</b><small>${t('waste.pdf.wasteValue')}</small></div><div class="metric"><b>${decimal(totalKg)} kg</b><small>${t('waste.pdf.redistributed')}</small></div><div class="metric"><b>${money(donatedValue)}</b><small>${t('waste.pdf.redistributedValue')}</small></div></div>
      <h2>${t('waste.pdf.contents')}</h2><ol>${WASTE_DOSSIER_CHECKLIST.map((item) => `<li>${esc(item)}</li>`).join('')}</ol>
      <div class="notice"><b>${t('waste.pdf.basis')}</b> ${t('waste.pdf.legalBasis')}</div>

      <section class="page">${header(t('waste.pdf.annualPlan'))}<h1>${t('waste.annualPlan')}</h1>${operatorBox(plan)}<h2>${t('waste.pdf.measures')}</h2><ol>${plan?.measures.map((measure) => `<li>${esc(labels[measure] ?? measure)}</li>`).join('') || `<li>${t('waste.pdf.incompletePlan')}</li>`}</ol><h2>${t('waste.pdf.application')}</h2><div class="box">${esc(plan?.objectives || t('waste.pdf.incompletePlan')).replace(/\n/g, '<br>')}</div></section>

      <section class="page">${header(t('waste.pdf.wasteHeader'))}<h1>${t('waste.pdf.wasteTitle')}</h1><p class="subtitle">${t('waste.pdf.wasteSubtitle')} · ${year}</p><table><thead><tr><th>${t('waste.pdf.date')}</th><th>${t('waste.pdf.product')}</th><th>${t('waste.quantity')}</th><th>${t('waste.pdf.reason')}</th><th>${t('waste.pdf.value')}</th><th>${t('waste.pdf.notes')}</th></tr></thead><tbody>${wasteRows(year, wasteEntries) || `<tr><td colspan="6">${t('waste.pdf.emptyWaste')}</td></tr>`}</tbody></table></section>

      <section class="page">${header(t('waste.pdf.detailsHeader'))}<h1>${t('waste.pdf.detailsTitle')}</h1><p class="subtitle">${t('waste.pdf.detailsSubtitle')} · ${year}</p><table><thead><tr><th>${t('waste.pdf.date')}</th><th>${t('waste.pdf.product')}</th><th>${t('waste.quantity')}</th><th>${t('waste.destination')}</th><th>${t('waste.pdf.expiry')}</th><th>${t('waste.pdf.temperature')}</th><th>${t('waste.pdf.traceability')}</th><th>${t('operational.documents.document')}</th><th>Control</th></tr></thead><tbody>${redistributionDetailRows(year, transfers, receivers) || `<tr><td colspan="9">${t('waste.pdf.emptyTransfers')}</td></tr>`}</tbody></table></section>

      <section class="page">${header(t('waste.pdf.reportHeader'))}<h1>${t('waste.pdf.annexTitle')}</h1><p class="subtitle">${t('waste.pdf.donorSummary')} · ${year}</p>${operatorBox(plan)}<table><thead><tr><th>${t('waste.pdf.number')}</th><th>${t('waste.pdf.category')}</th><th>${t('waste.pdf.destination')}</th><th>${t('waste.pdf.receiverTaxId')}</th><th>${t('waste.pdf.kg')}</th><th>${t('waste.pdf.contract')}</th><th>${t('waste.pdf.value')}</th></tr></thead><tbody>${annualReportRows(year, transfers, receivers) || `<tr><td colspan="7">${t('waste.pdf.noRecordedTransfers')}</td></tr>`}</tbody></table></section>

      <section class="page">${header(t('waste.pdf.receiversHeader'))}<h1>${t('waste.pdf.receiversTitle')}</h1><table><thead><tr><th>${t('waste.name')}</th><th>${t('waste.taxId')}</th><th>${t('waste.county')}</th><th>${t('waste.pdf.receiverAuthorization')}</th><th>Contract</th><th>Contact</th></tr></thead><tbody>${activeReceivers.map((receiver) => `<tr><td>${esc(receiver.name)}</td><td>${esc(receiver.taxId || '—')}</td><td>${esc(receiver.county || '—')}</td><td>${esc(receiver.authorization || '—')}</td><td>${esc(receiver.contractReference || '—')}${receiver.contractDate ? `<br>${esc(formatDate(receiver.contractDate))}` : ''}</td><td>${esc(receiver.contact || '—')}</td></tr>`).join('') || `<tr><td colspan="6">${t('waste.pdf.emptyReceivers')}</td></tr>`}</tbody></table><div class="signature"><div>${t('waste.pdf.dossierSignature')}</div><div>${t('waste.pdf.legalSignature')}</div></div>${footer()}</section>
    </body></html>`;
  }

  return { buildWastePlanHtml, buildRedistributionReportHtml, buildWasteDossierHtml };
}

export const buildWastePlanHtml = (plan: WastePreventionPlan, locale: Locale = 'ro') => createWasteSheet(locale).buildWastePlanHtml(plan);
export const buildRedistributionReportHtml = (year: number, transfers: FoodRedistribution[], receivers: WasteReceiver[], plan?: WastePreventionPlan | null, locale: Locale = 'ro') => createWasteSheet(locale).buildRedistributionReportHtml(year, transfers, receivers, plan);
export const buildWasteDossierHtml = (year: number, plan: WastePreventionPlan | null, transfers: FoodRedistribution[], receivers: WasteReceiver[], wasteEntries: WasteEntry[], locale: Locale = 'ro') => createWasteSheet(locale).buildWasteDossierHtml(year, plan, transfers, receivers, wasteEntries);
