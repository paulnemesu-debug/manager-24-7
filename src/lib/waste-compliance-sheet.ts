import { PARADIM_LOGO_DATA_URI } from '@/constants/brand-logo';
import { COMPANY_CONTACT_LINE } from '@/constants/paradim';
import {
  FOOD_ORIGIN_LABELS,
  WASTE_DOSSIER_CHECKLIST,
  WASTE_REASON_LABELS,
} from '@/lib/waste-compliance-model';
import type { WasteEntry } from '@/types/operations-control';
import type { FoodRedistribution, WastePreventionPlan, WasteReceiver } from '@/types/waste-compliance';

const esc = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dateRo = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat('ro-RO').format(new Date(`${value.slice(0, 10)}T12:00:00`))
  : '—';
const money = (value: number) => `${value.toFixed(2).replace('.', ',')} lei`;
const decimal = (value: number, digits = 3) => value.toFixed(digits).replace('.', ',');

const labels: Record<string, string> = {
  staff_training: 'Informarea și instruirea angajaților', production_planning: 'Planificarea producției și porționării',
  fifo: 'FIFO/FEFO și controlul termenelor', discount_sale: 'Vânzare la preț redus înainte de expirare',
  consumer_redistribution: 'Redistribuire gratuită către consumatori', receiver_donation: 'Transfer către operatori receptori',
  animal_feed: 'Valorificare pentru hrana animalelor', compost_biogas: 'Compostare sau biogaz',
};

const css = `<style>
  @page{size:A4;margin:13mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#17212b;font-size:9pt;margin:0}
  header{display:flex;align-items:center;gap:10px;border-bottom:2px solid #d8aa37;padding-bottom:7px;margin-bottom:10px}header img{width:52px;height:52px;object-fit:contain}.brand{flex:1}.brand b{display:block;color:#062544;font-size:14pt}.brand small,.doc-meta{color:#667482;font-size:7pt;line-height:1.5}.doc-meta{text-align:right}
  h1{color:#062544;font-size:18pt;text-align:center;margin:12px 0 4px}h2{color:#0b6a68;font-size:12pt;margin:17px 0 6px;border-bottom:1px solid #dde4e8;padding-bottom:4px}.subtitle{text-align:center;color:#667482;margin:0 0 12px}.box{border:1px solid #dde4e8;border-radius:8px;padding:10px;margin:8px 0;line-height:1.55}.grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.metric{background:#eef7f6;border:1px solid #d6e9e7;border-radius:7px;padding:8px}.metric b{display:block;color:#062544;font-size:12pt}.metric small{color:#667482;text-transform:uppercase}
  table{width:100%;border-collapse:collapse;table-layout:auto;font-size:7.2pt}th,td{border:1px solid #cfd8dd;padding:4px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#062544;color:#fff;text-align:center}td.num{text-align:right;font-variant-numeric:tabular-nums}.notice{background:#fff3dc;border-left:4px solid #d8aa37;padding:9px;margin:10px 0}.ok{color:#126845;font-weight:bold}.danger{color:#a12e37;font-weight:bold}.page{break-before:page}.signature{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:28px}.signature div{border-top:1px solid #667482;padding-top:5px;color:#667482}.footer{margin-top:20px;padding-top:7px;border-top:1px solid #dde4e8;font-size:7pt;color:#667482;display:flex;justify-content:space-between}
</style>`;

function header(title: string, generatedAt = new Date()) {
  return `<header><img src="${PARADIM_LOGO_DATA_URI}" alt="Sigla PARADIM"><div class="brand"><b>MANAGER 24/7 by PARADIM</b><small>PARADIM Operations SRL · Iași, România<br>${esc(COMPANY_CONTACT_LINE)}</small></div><div class="doc-meta"><strong>${esc(title)}</strong><br>Generat: ${esc(new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short' }).format(generatedAt))}</div></header>`;
}

function footer() {
  return `<div class="footer"><span>Document generat de MANAGER 24/7</span><span>PARADIM Operations SRL · ${esc(COMPANY_CONTACT_LINE)}</span></div>`;
}

function operatorBox(plan?: WastePreventionPlan | null) {
  if (!plan) return '<div class="notice">Datele operatorului nu au fost încă salvate în planul anual.</div>';
  return `<div class="box"><b>Operator:</b> ${esc(plan.companyName)} &nbsp; <b>CUI:</b> ${esc(plan.companyTaxId)}<br><b>Sediu/punct de lucru:</b> ${esc(plan.companyAddress || '—')}<br><b>Autorizație/înregistrare:</b> ${esc(plan.companyAuthorization || '—')}<br><b>Reprezentant legal:</b> ${esc(plan.legalRepresentative || '—')} &nbsp; <b>Responsabil:</b> ${esc(plan.responsiblePerson || '—')}<br><b>Contact operator:</b> ${esc(plan.companyPhone || '—')} · ${esc(plan.companyEmail || '—')}</div>`;
}

function receiverFor(id: string | null, receivers: readonly WasteReceiver[]) {
  return receivers.find((receiver) => receiver.id === id) ?? null;
}

function annualReportRows(year: number, transfers: readonly FoodRedistribution[], receivers: readonly WasteReceiver[]) {
  return transfers.filter((transfer) => transfer.transferDate.startsWith(String(year))).map((transfer, index) => {
    const receiver = receiverFor(transfer.receiverId, receivers);
    const destination = transfer.destinationType === 'consumer' ? 'Consumatori finali' : receiver?.name ?? 'Receptor nespecificat';
    return `<tr><td class="num">${index + 1}</td><td>${esc(FOOD_ORIGIN_LABELS[transfer.productOrigin])}<br><small>${esc(transfer.productName)}${transfer.productCategory ? ` · ${esc(transfer.productCategory)}` : ''}</small></td><td>${esc(destination)}</td><td>${esc(receiver?.taxId || '—')}</td><td class="num">${decimal(transfer.quantityKg)}</td><td>${esc(receiver?.contractReference || transfer.documentReference || '—')}</td><td class="num">${esc(money(transfer.estimatedValue))}</td></tr>`;
  }).join('');
}

function redistributionDetailRows(year: number, transfers: readonly FoodRedistribution[], receivers: readonly WasteReceiver[]) {
  return transfers.filter((transfer) => transfer.transferDate.startsWith(String(year))).map((transfer) => {
    const receiver = receiverFor(transfer.receiverId, receivers);
    return `<tr><td>${esc(dateRo(transfer.transferDate))}</td><td>${esc(transfer.productName)}</td><td class="num">${esc(transfer.quantity)} ${esc(transfer.unit)}<br>${decimal(transfer.quantityKg)} kg</td><td>${esc(receiver?.name ?? 'Consumatori finali')}</td><td>${esc(dateRo(transfer.expiryDate))}</td><td class="num">${transfer.temperatureC === null ? '—' : `${decimal(transfer.temperatureC, 1)} °C`}</td><td>${esc(transfer.traceabilityReference || '—')}</td><td>${esc(transfer.documentReference || '—')}</td><td>${transfer.safetyCheck === 'compliant' ? '<span class="ok">Conform</span>' : '<span class="danger">Blocat</span>'}</td></tr>`;
  }).join('');
}

function wasteRows(year: number, entries: readonly WasteEntry[]) {
  return entries.filter((entry) => entry.eventDate.startsWith(String(year))).map((entry) => `<tr><td>${esc(dateRo(entry.eventDate))}</td><td>${esc(entry.itemName)}</td><td class="num">${esc(entry.quantity)} ${esc(entry.unit)}</td><td>${esc(WASTE_REASON_LABELS[entry.reason] ?? entry.reason)}</td><td class="num">${esc(money(entry.value))}</td><td>${esc(entry.notes || '—')}</td></tr>`).join('');
}

export function buildWastePlanHtml(plan: WastePreventionPlan) {
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8">${css}</head><body>${header('Plan anual de diminuare a risipei')}<h1>PLAN ANUAL DE DIMINUARE A RISIPEI ALIMENTARE</h1><p class="subtitle">An de raportare: ${plan.reportingYear} · Status: ${esc(plan.status)}</p>${operatorBox(plan)}<h2>Măsuri selectate</h2><ol>${plan.measures.map((measure) => `<li>${esc(labels[measure] ?? measure)}</li>`).join('')}</ol><h2>Obiective, responsabilități și dovezi</h2><div class="box">${esc(plan.objectives).replace(/\n/g, '<br>')}</div><div class="notice">Model de lucru: operatorul verifică măsurile aplicabile, aprobă planul și îndeplinește obligațiile de publicare/raportare care îi revin.</div><div class="signature"><div>Reprezentant legal / semnătură</div><div>Responsabil / semnătură</div></div>${footer()}</body></html>`;
}

export function buildRedistributionReportHtml(
  year: number,
  transfers: FoodRedistribution[],
  receivers: WasteReceiver[],
  plan?: WastePreventionPlan | null,
) {
  const yearTransfers = transfers.filter((transfer) => transfer.transferDate.startsWith(String(year)));
  const rows = annualReportRows(year, transfers, receivers);
  const totalKg = yearTransfers.reduce((sum, transfer) => sum + transfer.quantityKg, 0);
  const totalValue = yearTransfers.reduce((sum, transfer) => sum + transfer.estimatedValue, 0);
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8">${css}</head><body>${header('Raport anual operator donator')}<h1>RAPORT ANUAL PRIVIND REDISTRIBUIREA ALIMENTELOR</h1><p class="subtitle">Model operator donator · Anexa nr. 2 · perioada 01.01.${year}–31.12.${year}</p>${operatorBox(plan)}<div class="grid"><div class="metric"><b>${yearTransfers.length}</b><small>transferuri</small></div><div class="metric"><b>${decimal(totalKg)} kg</b><small>cantitate redistribuită</small></div><div class="metric"><b>${money(totalValue)}</b><small>valoare estimată</small></div><div class="metric"><b>31 martie ${year + 1}</b><small>termen de verificat pentru raportare</small></div></div><h2>Centralizator anual</h2><table><thead><tr><th>Nr.</th><th>Tip/categorie produs</th><th>Operator receptor / destinație</th><th>CUI receptor</th><th>Cantitate (kg)</th><th>Contract / document</th><th>Valoare</th></tr></thead><tbody>${rows || '<tr><td colspan="7">Nu există transferuri înregistrate pentru perioada selectată.</td></tr>'}</tbody></table><div class="notice">Raportul se verifică și se semnează de operator înainte de încărcare/transmitere. Pentru fiecare transfer se păstrează documentele de trasabilitate și predare-primire.</div><div class="signature"><div>Întocmit / semnătură</div><div>Reprezentant legal / semnătură</div></div>${footer()}</body></html>`;
}

export function buildWasteDossierHtml(
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
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8">${css}</head><body>
    ${header('Dosar risipă și redistribuire')}<h1>DOSAR DE PREVENIRE A RISIPEI ȘI REDISTRIBUIRE</h1><p class="subtitle">Model complet · anul ${year}</p>${operatorBox(plan)}
    <div class="grid"><div class="metric"><b>${yearWaste.length}</b><small>înregistrări risipă</small></div><div class="metric"><b>${money(wasteValue)}</b><small>valoare risipă</small></div><div class="metric"><b>${decimal(totalKg)} kg</b><small>redistribuite</small></div><div class="metric"><b>${money(donatedValue)}</b><small>valoare redistribuită</small></div></div>
    <h2>Cuprins și verificare</h2><ol>${WASTE_DOSSIER_CHECKLIST.map((item) => `<li>${esc(item)}</li>`).join('')}</ol>
    <div class="notice"><b>Bază de lucru:</b> Legea nr. 217/2016 privind diminuarea risipei alimentare și normele metodologice aprobate prin H.G. nr. 51/2019, cu modificările ulterioare. Verificați forma în vigoare și instrucțiunile platformei autorității la data depunerii.</div>

    <section class="page">${header('Plan anual')}<h1>PLAN ANUAL</h1>${operatorBox(plan)}<h2>Măsuri</h2><ol>${plan?.measures.map((measure) => `<li>${esc(labels[measure] ?? measure)}</li>`).join('') || '<li>Planul anual nu este completat.</li>'}</ol><h2>Obiective și aplicare</h2><div class="box">${esc(plan?.objectives || 'Planul anual nu este completat.').replace(/\n/g, '<br>')}</div></section>

    <section class="page">${header('Registru intern de risipă')}<h1>REGISTRU INTERN DE RISIPĂ</h1><p class="subtitle">Pierderi și deșeuri alimentare · ${year}</p><table><thead><tr><th>Data</th><th>Produs</th><th>Cantitate</th><th>Cauză</th><th>Valoare</th><th>Observații/acțiune</th></tr></thead><tbody>${wasteRows(year, wasteEntries) || '<tr><td colspan="6">Nu există înregistrări de risipă pentru perioada selectată.</td></tr>'}</tbody></table></section>

    <section class="page">${header('Registru detaliat de redistribuire')}<h1>REGISTRU DE REDISTRIBUIRE</h1><p class="subtitle">Trasabilitate și verificarea siguranței · ${year}</p><table><thead><tr><th>Data</th><th>Produs</th><th>Cantitate</th><th>Destinație</th><th>Termen</th><th>Temperatură</th><th>Lot/trasabilitate</th><th>Document</th><th>Control</th></tr></thead><tbody>${redistributionDetailRows(year, transfers, receivers) || '<tr><td colspan="9">Nu există transferuri pentru perioada selectată.</td></tr>'}</tbody></table></section>

    <section class="page">${header('Raport anual operator donator')}<h1>RAPORT ANUAL · ANEXA NR. 2</h1><p class="subtitle">Centralizator operator donator · ${year}</p>${operatorBox(plan)}<table><thead><tr><th>Nr.</th><th>Tip/categorie produs</th><th>Operator receptor / destinație</th><th>CUI receptor</th><th>Cantitate (kg)</th><th>Contract / document</th><th>Valoare</th></tr></thead><tbody>${annualReportRows(year, transfers, receivers) || '<tr><td colspan="7">Nu există transferuri înregistrate.</td></tr>'}</tbody></table></section>

    <section class="page">${header('Nomenclator receptori')}<h1>OPERATORI RECEPTORI</h1><table><thead><tr><th>Denumire</th><th>CUI</th><th>Județ</th><th>Autorizație/înregistrare</th><th>Contract</th><th>Contact</th></tr></thead><tbody>${activeReceivers.map((receiver) => `<tr><td>${esc(receiver.name)}</td><td>${esc(receiver.taxId || '—')}</td><td>${esc(receiver.county || '—')}</td><td>${esc(receiver.authorization || '—')}</td><td>${esc(receiver.contractReference || '—')}${receiver.contractDate ? `<br>${esc(dateRo(receiver.contractDate))}` : ''}</td><td>${esc(receiver.contact || '—')}</td></tr>`).join('') || '<tr><td colspan="6">Nu există operatori receptori activi salvați.</td></tr>'}</tbody></table><div class="signature"><div>Responsabil dosar / semnătură</div><div>Reprezentant legal / semnătură</div></div>${footer()}</section>
  </body></html>`;
}
