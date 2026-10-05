/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { allergenIconSvg } from '@/constants/allergen-icons';
import { ALLERGEN_LABELS } from '@/constants/allergens';
import { PARADIM_LOGO_DATA_URI } from '@/constants/brand-logo';
import { productLegalNotice } from '@/constants/legal';
import { CATEGORY_LABEL_KEY } from '@/constants/categories';
import { SITE_URL } from '@/constants/paradim';
import type { Locale, TranslationKey } from '@/i18n/translations';
import { calculateIngredientCost } from '@/lib/calculations';
import { createExcelWorkbook, type ExcelWorkbook } from '@/lib/excel-workbook';
import type { Formatters } from '@/lib/format';
import {
  aggregateRecipeAdditives,
  calculateRecipeNutrition,
  DECLARED_NUTRIENT_KEYS,
  normalizeRecipeCompliance,
  type NutrientKey,
} from '@/lib/nutrition';
import type { Recipe } from '@/types/recipe';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

const NUTRIENT_LABEL_KEYS: Record<NutrientKey, TranslationKey> = {
  energyKj: 'nutrition.energyKj',
  energyKcal: 'nutrition.energyKcal',
  fat: 'nutrition.fat',
  saturates: 'nutrition.saturates',
  carbohydrates: 'nutrition.carbohydrates',
  sugars: 'nutrition.sugars',
  fibre: 'nutrition.fibre',
  protein: 'nutrition.protein',
  salt: 'nutrition.salt',
};

const NUTRIENT_UNITS: Record<NutrientKey, string> = {
  energyKj: 'kJ', energyKcal: 'kcal', fat: 'g', saturates: 'g',
  carbohydrates: 'g', sugars: 'g', fibre: 'g', protein: 'g', salt: 'g',
};

export type ExportContext = {
  t: Translate;
  format: Formatters;
  locale: Locale;
  /** Adresa contului care a generat fișa, tipărită în subsol. */
  userEmail: string | null;
  /** Ultima actualizare a prețurilor folosite în calcul. */
  pricesDate: string | null;
  /** Fișele generate pe planul gratuit poartă filigran. */
  plan: 'free' | 'pro';
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function safeFileName(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return base || 'reteta';
}

/** Cantitatea care trebuie cumpărată ca să rămână cantitatea netă după curățare. */
export function grossQuantity(quantity: number, lossPercent: number): number {
  const usable = Math.max(0.01, 1 - Math.min(99, Math.max(0, lossPercent)) / 100);
  return Math.round((quantity / usable) * 100) / 100;
}

export type SheetRow = {
  name: string;
  quantity: string;
  gross: string | null;
  unit: string;
  cost: string;
  allergens: string[];
  allergenCodes: string[];
  isSubRecipe: boolean;
};

export function buildRecipeRows(recipe: Recipe, context: ExportContext): SheetRow[] {
  const { format, locale } = context;
  return recipe.ingredients
    .filter((ingredient) => ingredient.name.trim())
    .map((ingredient) => ({
      name: ingredient.name,
      quantity: format.number(ingredient.quantity),
      gross: ingredient.lossPercent > 0
        ? format.number(grossQuantity(ingredient.quantity, ingredient.lossPercent))
        : null,
      unit: ingredient.unit,
      cost: format.money(calculateIngredientCost(ingredient)),
      allergens: ingredient.allergens.map((allergen) => ALLERGEN_LABELS[locale][allergen]),
      allergenCodes: [...ingredient.allergens],
      isSubRecipe: ingredient.kind === 'sub_recipe',
    }));
}

/** Perechile etichetă–valoare din rezumatul economic, în ordinea cerută pe fișă. */
export function buildRecipeSummary(recipe: Recipe, context: ExportContext): [string, string][] {
  const { t, format } = context;
  return [
    [t('sheet.totalCost'), format.money(recipe.totals.totalCost)],
    [t('sheet.portionCost'), format.money(recipe.totals.portionCost)],
    [t('sheet.foodCost'), format.percent(recipe.totals.foodCostPercent)],
    [t('sheet.menuPrice'), format.money(recipe.salePriceGross)],
    [t('sheet.recommended'), format.money(recipe.totals.recommendedPriceGross)],
  ];
}

export function buildNutritionRows(recipe: Recipe, context: ExportContext): [string, string, string][] {
  const nutrition = calculateRecipeNutrition(recipe);
  return DECLARED_NUTRIENT_KEYS.map((key) => {
    const render = (amount: number | null) => amount === null
      ? '—'
      : `${nutrition.approximateKeys.includes(key) ? '≈ ' : ''}${context.format.number(amount, key.startsWith('energy') ? 0 : 2)} ${NUTRIENT_UNITS[key]}`;
    return [
      context.t(NUTRIENT_LABEL_KEYS[key]),
      render(nutrition.per100g[key]),
      render(nutrition.perPortion[key]),
    ];
  });
}

function headerFacts(recipe: Recipe, context: ExportContext): [string, string][] {
  const { t, format } = context;
  return [
    [t('sheet.category'), recipe.category ? t(CATEGORY_LABEL_KEY[recipe.category]) : '—'],
    [t('sheet.servings'), format.number(recipe.servings, 0)],
    [t('sheet.vat'), format.percent(recipe.vatPercent)],
  ];
}

export function buildRecipeHtml(recipe: Recipe, context: ExportContext): string {
  const { t, format, locale, plan, userEmail, pricesDate } = context;
  const rows = buildRecipeRows(recipe, context);
  const summary = buildRecipeSummary(recipe, context);
  const facts = headerFacts(recipe, context);
  const nutrition = calculateRecipeNutrition(recipe);
  const nutritionRows = buildNutritionRows(recipe, context);
  const compliance = normalizeRecipeCompliance(recipe.compliance);
  const additives = aggregateRecipeAdditives(recipe);

  const allergenList = recipe.allergens.length
    ? recipe.allergens.map((allergen) => `<span class="allergen">${allergenIconSvg(allergen, 15)}${escapeHtml(ALLERGEN_LABELS[locale][allergen])}</span>`).join('')
    : `<span class="allergen-none">${escapeHtml(t('sheet.allergensNone'))}</span>`;

  const footerBits = [
    pricesDate ? t('sheet.pricesDate', { date: format.date(pricesDate) }) : null,
    userEmail ? t('sheet.generatedBy', { user: userEmail }) : null,
    t('sheet.generated', { date: format.date(new Date().toISOString()) }),
  ].filter(Boolean) as string[];

  const watermark = plan === 'free'
    ? `<div class="watermark" aria-hidden="true">
         <img src="${PARADIM_LOGO_DATA_URI}" alt="" />
         <span>${escapeHtml(t('sheet.watermark'))}</span>
       </div>`
    : '';

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(recipe.title)}</title>
<style>
  @page { size: A4 portrait; margin: 7mm 8mm 7mm; }
  * { box-sizing: border-box; }
  html, body { width: 100%; }
  body { margin: 0; padding: 18px; position: relative;
         font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
         color: #17212B; background: #FFFFFF; font-size: 9px; line-height: 1.25; }
  header { display: flex; align-items: flex-start; justify-content: space-between;
           gap: 12px; border-bottom: 2px solid #D5A640; padding-bottom: 7px; }
  header img.logo { width: 88px; height: 88px; object-fit: contain; flex: 0 0 88px; }
  h1 { margin: 2px 0 4px; font-size: 18px; color: #031B33; line-height: 1.08; }
  .doc-type { color: #667482; font-size: 8px; font-weight: 800; letter-spacing: .8px;
              text-transform: uppercase; }
  .facts { display: flex; flex-wrap: wrap; gap: 3px 14px; margin-top: 6px; }
  .facts div { font-size: 8.5px; color: #667482; }
  .facts strong { color: #031B33; font-weight: 800; }
  h2 { break-after: avoid-page; page-break-after: avoid; font-size: 8.5px; text-transform: uppercase;
       letter-spacing: .65px; color: #8F6614; margin: 10px 0 4px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.25px; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th { text-align: left; background: #F0F4F6; color: #062544; padding: 4px 5px;
       border-bottom: 1px solid #DDE4E8; font-size: 7.5px; text-transform: uppercase;
       letter-spacing: .2px; }
  td { padding: 3.5px 5px; border-bottom: 1px solid #EDF1F4; vertical-align: top;
       overflow-wrap: anywhere; }
  .ingredients-table th:nth-child(1) { width: 29%; }
  .ingredients-table th:nth-child(2) { width: 15%; }
  .ingredients-table th:nth-child(3) { width: 8%; }
  .ingredients-table th:nth-child(4) { width: 16%; }
  .ingredients-table th:nth-child(5) { width: 32%; }
  .nutrition-table th:nth-child(1) { width: 46%; }
  .nutrition-table th:nth-child(2), .nutrition-table th:nth-child(3) { width: 27%; }
  td.num, th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .gross { display: block; color: #667482; font-size: 7px; margin-top: 1px; }
  .sub td:first-child::before { content: "\\21B3 "; color: #D5A640; }
  .row-allergens { display: flex; flex-wrap: wrap; gap: 1px 5px; }
  .row-allergens span { display: inline-flex; align-items: center; gap: 2px;
                        color: #062544; font-size: 7.25px; white-space: normal; }
  .row-allergens svg { width: 10px; height: 10px; flex: 0 0 10px; }
  .dash { color: #B4C0C9; }
  .summary { break-inside: avoid; page-break-inside: avoid; display: grid;
             grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; }
  .summary div { display: flex; justify-content: space-between; gap: 12px;
                 border-bottom: 1px dotted #DDE4E8; padding: 3.5px 0; font-size: 8.5px; }
  .summary span:last-child { font-weight: 800; color: #031B33;
                             font-variant-numeric: tabular-nums; }
  .allergens { break-inside: avoid; page-break-inside: avoid; display: flex; flex-wrap: wrap;
               gap: 4px; background: #F3E4BD; border-radius: 6px; padding: 5px 7px; }
  .allergen { display: inline-flex; align-items: center; gap: 3px; background: #FFFFFF;
              border-radius: 999px; padding: 2px 6px 2px 4px; font-size: 7.5px;
              font-weight: 700; color: #031B33; }
  .allergen svg { width: 11px; height: 11px; }
  .allergen-none { font-size: 8px; font-weight: 700; color: #031B33; }
  .nutrition-status { break-inside: avoid; page-break-inside: avoid; padding: 4px 7px;
                      border-radius: 5px; font-size: 7.5px; font-weight: 800; margin-bottom: 4px; }
  .nutrition-status.ok { color: #166A45; background: #EAF7F0; }
  .nutrition-status.draft { color: #8A5200; background: #FFF3DC; }
  .compliance-facts { break-inside: avoid; page-break-inside: avoid; color: #667482;
                      font-size: 7px; line-height: 1.28; margin: 4px 0; }
  .legal-note { break-inside: avoid; page-break-inside: avoid; color: #667482;
                font-size: 6.5px; line-height: 1.25; margin: 4px 0 0; }
  footer { break-inside: avoid; page-break-inside: avoid; margin-top: 8px; padding-top: 5px;
           border-top: 1px solid #DDE4E8; color: #667482; font-size: 6.5px; line-height: 1.3; }
  .watermark { position: fixed; inset: 0; display: flex; flex-direction: column;
               align-items: center; justify-content: center; gap: 14px;
               transform: rotate(-28deg); opacity: .07; pointer-events: none; z-index: 0; }
  .watermark img { width: 230px; height: auto; }
  .watermark span { font-size: 22px; font-weight: 900; color: #031B33;
                    letter-spacing: 1px; text-align: center; }
  body > *:not(.watermark) { position: relative; z-index: 1; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  ${watermark}

  <header>
    <div>
      <div class="doc-type">${escapeHtml(t('sheet.title'))}</div>
      <h1>${escapeHtml(recipe.title)}</h1>
      <div class="facts">
        ${facts.map(([label, value]) => `<div>${escapeHtml(label)}: <strong>${escapeHtml(value)}</strong></div>`).join('')}
      </div>
    </div>
    <img class="logo" src="${PARADIM_LOGO_DATA_URI}" alt="Manager 24/7" />
  </header>

  <h2>${escapeHtml(t('sheet.ingredients'))}</h2>
  <table class="ingredients-table">
    <thead>
      <tr>
        <th>${escapeHtml(t('sheet.ingredient'))}</th>
        <th class="num">${escapeHtml(t('sheet.quantity'))}</th>
        <th>${escapeHtml(t('sheet.unit'))}</th>
        <th class="num">${escapeHtml(t('sheet.lineCost'))}</th>
        <th>${escapeHtml(t('sheet.allergens'))}</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((row) => `<tr${row.isSubRecipe ? ' class="sub"' : ''}>
        <td>${escapeHtml(row.name)}</td>
        <td class="num">${escapeHtml(row.quantity)}${row.gross ? `<span class="gross">${escapeHtml(t('sheet.grossShort'))} ${escapeHtml(row.gross)}</span>` : ''}</td>
        <td>${escapeHtml(row.unit)}</td>
        <td class="num">${escapeHtml(row.cost)}</td>
        <td>${row.allergenCodes.length
          ? `<div class="row-allergens">${row.allergenCodes.map((code, index) => `<span>${allergenIconSvg(code as never, 13)}${escapeHtml(row.allergens[index])}</span>`).join('')}</div>`
          : '<span class="dash">—</span>'}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <h2>${escapeHtml(t('sheet.summary'))}</h2>
  <div class="summary">
    ${summary.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`).join('')}
  </div>

  <h2>${escapeHtml(t('sheet.allergens'))}</h2>
  <div class="allergens">${allergenList}</div>

  <h2>${escapeHtml(t('nutrition.exportTitle'))}</h2>
  <div class="nutrition-status ${nutrition.complete ? 'ok' : 'draft'}">
    ${escapeHtml(nutrition.complete ? t('nutrition.exportStatusComplete') : nutrition.missingRequired.length === 0 ? t('nutrition.exportStatusEstimated') : t('nutrition.exportStatusDraft'))}
  </div>
  <table class="nutrition-table">
    <thead><tr><th>${escapeHtml(t('nutrition.value'))}</th><th class="num">${escapeHtml(t('nutrition.per100g'))}</th><th class="num">${escapeHtml(t('nutrition.perPortion'))}</th></tr></thead>
    <tbody>${nutritionRows.map(([label, per100g, perPortion]) => `<tr><td>${escapeHtml(label)}</td><td class="num">${escapeHtml(per100g)}</td><td class="num">${escapeHtml(perPortion)}</td></tr>`).join('')}</tbody>
  </table>
  <div class="compliance-facts">
    ${nutrition.approximateKeys.length ? `${escapeHtml(t('nutrition.approximationNote'))}<br />` : ''}
    ${nutrition.finalWeightGrams ? escapeHtml(t('nutrition.exportFinalWeight', {
      weight: format.number(nutrition.finalWeightGrams, 2),
      status: nutrition.finalWeightMeasured ? t('nutrition.exportMeasured') : t('nutrition.exportEstimated'),
    })) : ''}
    ${compliance.sourceReference ? ` · ${escapeHtml(t('nutrition.exportSource', { source: compliance.sourceReference }))}` : ''}
    ${compliance.isDefrosted ? ` · <strong>${escapeHtml(t('nutrition.exportDefrosted'))}</strong>` : ''}
    <br />${escapeHtml(t('nutrition.recipeAdditives'))}: ${escapeHtml(additives.join(', ') || t('common.none'))}
    ${compliance.nutritionNotes ? `<br />${escapeHtml(compliance.nutritionNotes)}` : ''}
  </div>
  <p class="legal-note">${escapeHtml(t('nutrition.legalNotice'))}</p>
  ${nutrition.sources.length ? `<div style="color:#667482;font-size:8px;overflow-wrap:anywhere"><strong>${escapeHtml(t('nutrition.ingredientSources'))}</strong>${nutrition.sources.map((source) => `<p style="break-inside:avoid;margin:3px 0">${escapeHtml(source)}</p>`).join('')}</div>` : ''}

  <footer>
    ${footerBits.map((bit) => escapeHtml(bit)).join(' · ')}<br />
    ${escapeHtml(t('sheet.footer'))} · ${escapeHtml(SITE_URL)}
    <br />${escapeHtml(productLegalNotice(locale))}
  </footer>
</body>
</html>`;
}

export function buildRecipeWorkbook(recipe: Recipe, context: ExportContext): ExcelWorkbook {
  const { t, format, locale, userEmail, pricesDate, plan } = context;
  const rows = buildRecipeRows(recipe, context);
  const facts = headerFacts(recipe, context);
  const summary = buildRecipeSummary(recipe, context);
  const nutrition = calculateRecipeNutrition(recipe);
  const nutritionRows = buildNutritionRows(recipe, context);
  const compliance = normalizeRecipeCompliance(recipe.compliance);
  const additives = aggregateRecipeAdditives(recipe);

  const sheetRows: (string | number)[][] = [
    [t('sheet.title'), recipe.title],
    ...facts.map(([label, value]) => [label, value]),
    [],
    [
      t('sheet.ingredient'),
      t('sheet.quantity'),
      t('sheet.unit'),
      t('sheet.lineCost'),
      t('sheet.allergens'),
    ],
    ...rows.map((row) => [
      row.isSubRecipe ? `↳ ${row.name}` : row.name,
      row.gross ? `${row.quantity} (${t('sheet.grossShort')} ${row.gross})` : row.quantity,
      row.unit,
      row.cost,
      row.allergens.join(', ') || '—',
    ]),
    [],
    [t('sheet.summary')],
    ...summary.map(([label, value]) => [label, value]),
    [],
    [
      t('sheet.allergens'),
      recipe.allergens.length
        ? recipe.allergens.map((allergen) => ALLERGEN_LABELS[locale][allergen]).join(', ')
        : t('sheet.allergensNone'),
    ],
    [],
    [t('nutrition.exportTitle'), nutrition.complete
      ? t('nutrition.exportStatusComplete')
      : nutrition.missingRequired.length === 0 ? t('nutrition.exportStatusEstimated') : t('nutrition.exportStatusDraft')],
    [t('nutrition.value'), t('nutrition.per100g'), t('nutrition.perPortion')],
    ...nutritionRows,
    ...(nutrition.approximateKeys.length ? [[t('nutrition.approximationNote')]] : []),
    ...(nutrition.sources.length ? [[t('nutrition.ingredientSources')], ...nutrition.sources.map((source) => [source])] : []),
    ...(nutrition.finalWeightGrams ? [[t('nutrition.exportFinalWeight', {
      weight: format.number(nutrition.finalWeightGrams, 2),
      status: nutrition.finalWeightMeasured ? t('nutrition.exportMeasured') : t('nutrition.exportEstimated'),
    })]] : []),
    ...(compliance.sourceReference ? [[t('nutrition.exportSource', { source: compliance.sourceReference })]] : []),
    ...(compliance.isDefrosted ? [[t('nutrition.exportDefrosted')]] : []),
    [t('nutrition.recipeAdditives'), additives.join(', ') || t('common.none')],
    ...(compliance.nutritionNotes ? [[compliance.nutritionNotes]] : []),
    [t('nutrition.legalNotice')],
    [],
    ...(pricesDate ? [[t('sheet.pricesDate', { date: format.date(pricesDate) })]] : []),
    ...(userEmail ? [[t('sheet.generatedBy', { user: userEmail })]] : []),
    [t('sheet.generated', { date: format.date(new Date().toISOString()) })],
    ...(plan === 'free' ? [[t('sheet.watermark')]] : []),
    [t('sheet.footer')],
  ];

  return createExcelWorkbook([{
    name: 'Food Cost',
    rows: sheetRows,
    columns: [{ width: 36 }, { width: 22 }, { width: 8 }, { width: 14 }, { width: 46 }],
  }]);
}
