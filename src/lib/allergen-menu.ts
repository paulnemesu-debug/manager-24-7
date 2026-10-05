/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { ALLERGEN_LABELS, ALLERGENS } from '@/constants/allergens';
import { PARADIM_LOGO_DATA_URI } from '@/constants/brand-logo';
import { productLegalNotice } from '@/constants/legal';
import type { Locale } from '@/i18n/translations';
import type { Recipe } from '@/types/recipe';

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

export function recipeAllergensConfirmed(recipe: Recipe) {
  return recipe.ingredients
    .filter((ingredient) => ingredient.kind === 'product')
    .every((ingredient) => ingredient.allergensConfirmed === true);
}

export function buildAllergenMenuHtml(
  recipes: readonly Recipe[],
  locale: Locale,
  generatedBy: string | null = null,
) {
  const sellable = recipes.filter((recipe) => !recipe.isSubRecipe).sort((a, b) => a.title.localeCompare(b.title, locale === 'ro' ? 'ro-RO' : 'en-GB'));
  const unverified = sellable.filter((recipe) => !recipeAllergensConfirmed(recipe));
  const contains = locale === 'ro' ? 'Conține' : 'Contains';
  const none = locale === 'ro' ? 'Niciun alergen declarat' : 'No declared allergens';
  const rows = sellable.map((recipe, index) => {
    const allergens = recipe.allergens.length
      ? recipe.allergens.map((allergen) => `<strong>${escapeHtml(ALLERGEN_LABELS[locale][allergen])}</strong>`).join(', ')
      : none;
    return `<tr class="${index % 2 ? 'alt' : ''}"><td class="dish">${escapeHtml(recipe.title)}${recipeAllergensConfirmed(recipe) ? '' : '<sup>*</sup>'}</td><td>${contains}: ${allergens}</td></tr>`;
  }).join('');
  const legend = ALLERGENS.map((allergen, index) => `<span><b>${index + 1}.</b> ${escapeHtml(ALLERGEN_LABELS[locale][allergen])}</span>`).join('');
  const generated = new Date().toLocaleString(locale === 'ro' ? 'ro-RO' : 'en-GB');

  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><style>
    @page { size: A4 portrait; margin: 11mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #031B33; font-family: Arial, Helvetica, sans-serif; font-size: 9.5px; line-height: 1.35; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 14px; border-bottom: 2px solid #D5A640; padding-bottom: 8px; }
    .logo { width: 54px; height: 54px; object-fit: contain; }
    .eyebrow { color: #8F6614; font-weight: 800; font-size: 7.5px; letter-spacing: .7px; }
    h1 { margin: 4px 0 0; font-size: 17px; line-height: 1.15; }
    .lead { margin: 10px 0; color: #4F5F6D; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    th { background: #062544; color: #fff; padding: 6px 7px; text-align: left; }
    th:first-child { width: 36%; }
    td { border-bottom: 1px solid #DDE4E8; padding: 6px 7px; vertical-align: top; }
    tr.alt td { background: #F8FAFB; }
    .dish { font-size: 10.5px; font-weight: 800; }
    sup { color: #B43D35; font-size: 8px; }
    h2 { margin: 13px 0 6px; color: #062544; font-size: 11px; }
    .legend { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 14px; padding: 8px; border: 1px solid #D5A640; border-radius: 7px; }
    .warning { margin-top: 9px; padding: 7px 9px; border-radius: 6px; background: ${unverified.length ? '#FFF1E0' : '#EAF7F0'}; color: ${unverified.length ? '#7A4700' : '#166A45'}; font-weight: 700; }
    footer { margin-top: 10px; border-top: 1px solid #DDE4E8; padding-top: 6px; color: #667482; font-size: 7px; }
  </style></head><body>
    <header><div><div class="eyebrow">MANAGER 24/7 · PARADIM OPERATIONS</div><h1>${locale === 'ro' ? 'INFORMAȚII PRIVIND ALERGENII' : 'ALLERGEN INFORMATION'}</h1></div><img class="logo" src="${PARADIM_LOGO_DATA_URI}" alt="Manager 24/7"></header>
    <p class="lead">${locale === 'ro'
      ? 'Informare pentru preparate nepreambalate, structurată după Regulamentul (UE) nr. 1169/2011, art. 21 și 44, cu lista din Anexa II.'
      : 'Information for non-prepacked dishes, structured under Regulation (EU) No 1169/2011, Articles 21 and 44, using the Annex II list.'}</p>
    <table><thead><tr><th>${locale === 'ro' ? 'Preparat' : 'Dish'}</th><th>${locale === 'ro' ? 'Alergeni declarați' : 'Declared allergens'}</th></tr></thead><tbody>${rows || `<tr><td colspan="2">${locale === 'ro' ? 'Nu există preparate exportabile.' : 'There are no dishes to export.'}</td></tr>`}</tbody></table>
    <h2>${locale === 'ro' ? 'Lista celor 14 alergeni din Anexa II' : 'The 14 allergens in Annex II'}</h2>
    <div class="legend">${legend}</div>
    <div class="warning">${unverified.length
      ? (locale === 'ro' ? `* Date neconfirmate pentru ${unverified.length} preparate. Verificați etichetele furnizorilor și riscul de contaminare încrucișată înainte de afișare.` : `* Unconfirmed data for ${unverified.length} dishes. Check supplier labels and cross-contamination risk before display.`)
      : (locale === 'ro' ? 'Ingredientele au marcaj de verificare în aplicație. Responsabilul unității confirmă în continuare rețeta și contaminarea încrucișată.' : 'Ingredients are marked as reviewed in the app. The site responsible person must still confirm recipes and cross-contamination.')}</div>
    <footer>Manager 24/7 · ${locale === 'ro' ? 'Generat' : 'Generated'}: ${escapeHtml(generated)}${generatedBy ? ` · ${escapeHtml(generatedBy)}` : ''}<br>${escapeHtml(productLegalNotice(locale))}</footer>
  </body></html>`;
}
