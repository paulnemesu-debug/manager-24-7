/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { ALLERGEN_LABELS } from '@/constants/allergens';
import { PARADIM_LOGO_DATA_URI } from '@/constants/brand-logo';
import { productLegalNotice } from '@/constants/legal';
import { CATEGORY_LABEL_KEY, type RecipeCategory } from '@/constants/categories';
import type { ExportContext } from '@/lib/recipe-sheet';
import { buildNutritionRows, buildRecipeRows, buildRecipeSummary } from '@/lib/recipe-sheet';
import { createExcelWorkbook, type ExcelWorkbook } from '@/lib/excel-workbook';
import { calculateRecipeNutrition } from '@/lib/nutrition';
import type { Recipe } from '@/types/recipe';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function categoryLabel(recipe: Recipe, context: ExportContext) {
  return recipe.category ? context.t(CATEGORY_LABEL_KEY[recipe.category]) : context.t('category.none');
}

function groupedRecipes(recipes: readonly Recipe[]) {
  const groups = new Map<RecipeCategory | 'none', Recipe[]>();
  for (const recipe of recipes.filter((item) => !item.isSubRecipe)) {
    const key = recipe.category ?? 'none';
    groups.set(key, [...(groups.get(key) ?? []), recipe]);
  }
  return groups;
}

export function buildCookbookHtml(recipes: readonly Recipe[], context: ExportContext): string {
  const visible = recipes.filter((recipe) => !recipe.isSubRecipe);
  const generated = context.format.date(new Date().toISOString());
  const watermark = context.plan === 'free'
    ? `<div class="watermark">${escapeHtml(context.t('sheet.watermark'))}</div>`
    : '';

  return `<!doctype html><html lang="${context.locale}"><head><meta charset="utf-8" />
<title>${escapeHtml(context.t('cookbook.title'))}</title><style>
@page{size:A4 portrait;margin:7mm 8mm 7mm}*{box-sizing:border-box}html,body{width:100%}body{font-family:-apple-system,"Segoe UI",Arial,sans-serif;color:#17212B;margin:0;padding:18px;background:#fff;font-size:9px;line-height:1.25}
.cover{min-height:88vh;display:flex;flex-direction:column;justify-content:center;border-bottom:4px solid #D5A640;page-break-after:always}.cover .logo{width:165px;height:auto}.eyebrow{color:#8F6614;text-transform:uppercase;letter-spacing:1.2px;font-weight:800;font-size:9px;margin-top:22px}h1{font-size:32px;color:#031B33;margin:6px 0}.lead{color:#667482;font-size:12px}.contents{margin-top:20px;padding:14px;background:#F7F5EF;border-radius:10px}.contents h2{margin-top:0}.contents li{margin:4px 0}
.recipe{page-break-before:always;break-after:page;page-break-after:always}.recipe-head{display:flex;justify-content:space-between;gap:12px;border-bottom:2px solid #D5A640;padding-bottom:7px}.recipe-head .logo{width:76px;height:76px;object-fit:contain;flex:0 0 76px}.recipe h2{font-size:18px;line-height:1.08;color:#031B33;margin:0}.category{color:#667482;font-size:7.5px;text-transform:uppercase;letter-spacing:.7px}.facts{font-size:8px;color:#667482;margin-top:4px}.section-title{break-after:avoid-page;page-break-after:avoid;color:#8F6614;font-size:8px;text-transform:uppercase;letter-spacing:.6px;margin:9px 0 4px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8px}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th{background:#EFF4F4;color:#062544;text-align:left;padding:4px 5px;font-size:7.25px}td{padding:3.5px 5px;border-bottom:1px solid #E6EAEC;overflow-wrap:anywhere}.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.summary{break-inside:avoid;page-break-inside:avoid;display:grid;grid-template-columns:1fr 1fr;gap:0 18px}.summary div{display:flex;justify-content:space-between;border-bottom:1px dotted #DDE4E8;padding:3px 0;font-size:8px}.allergens{break-inside:avoid;page-break-inside:avoid;padding:5px 7px;background:#F3E4BD;border-radius:6px;font-size:8px}.watermark{position:fixed;inset:45% 0 auto;text-align:center;transform:rotate(-25deg);font-size:28px;font-weight:900;color:rgba(3,27,51,.06);z-index:-1}.footer{break-inside:avoid;page-break-inside:avoid;color:#7A8792;font-size:6.5px;margin-top:7px;border-top:1px solid #DDE4E8;padding-top:4px}.nutrition-status{break-inside:avoid;page-break-inside:avoid;padding:4px 7px;border-radius:5px;font-size:7.25px;font-weight:800;margin-bottom:4px}.nutrition-status.ok{color:#166A45;background:#EAF7F0}.nutrition-status.draft{color:#8A5200;background:#FFF3DC}@media print{body{padding:0}.cover{min-height:94vh}}
</style></head><body>${watermark}
<section class="cover"><img class="logo" src="${PARADIM_LOGO_DATA_URI}" alt="PARADIM"/><div class="eyebrow">Manager 24/7</div><h1>${escapeHtml(context.t('cookbook.title'))}</h1><p class="lead">${escapeHtml(context.t('cookbook.subtitle', { count: visible.length }))}</p><div class="contents"><h2>${escapeHtml(context.t('cookbook.contents'))}</h2><ol>${visible.map((recipe) => `<li>${escapeHtml(recipe.title)} — ${escapeHtml(categoryLabel(recipe, context))}</li>`).join('')}</ol></div><p class="footer">${escapeHtml(context.t('sheet.generated', { date: generated }))}${context.userEmail ? ` · ${escapeHtml(context.t('sheet.generatedBy', { user: context.userEmail }))}` : ''}<br>${escapeHtml(productLegalNotice(context.locale))}</p></section>
${visible.map((recipe) => {
  const rows = buildRecipeRows(recipe, context);
  const summary = buildRecipeSummary(recipe, context);
  const nutrition = calculateRecipeNutrition(recipe);
  const nutritionRows = buildNutritionRows(recipe, context);
  const allergens = recipe.allergens.length
    ? recipe.allergens.map((item) => ALLERGEN_LABELS[context.locale][item]).join(', ')
    : context.t('sheet.allergensNone');
  return `<section class="recipe"><div class="recipe-head"><div><div class="category">${escapeHtml(categoryLabel(recipe, context))}</div><h2>${escapeHtml(recipe.title)}</h2><div class="facts">${escapeHtml(context.t('sheet.servings'))}: ${context.format.number(recipe.servings, 0)} · ${escapeHtml(context.t('sheet.vat'))}: ${context.format.percent(recipe.vatPercent)}</div></div><img class="logo" src="${PARADIM_LOGO_DATA_URI}" alt="PARADIM"/></div><h3 class="section-title">${escapeHtml(context.t('sheet.ingredients'))}</h3><table><thead><tr><th>${escapeHtml(context.t('sheet.ingredient'))}</th><th class="num">${escapeHtml(context.t('sheet.quantity'))}</th><th>${escapeHtml(context.t('sheet.unit'))}</th><th class="num">${escapeHtml(context.t('sheet.lineCost'))}</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${row.isSubRecipe ? '↳ ' : ''}${escapeHtml(row.name)}</td><td class="num">${escapeHtml(row.quantity)}${row.gross ? ` (${escapeHtml(context.t('sheet.grossShort'))} ${escapeHtml(row.gross)})` : ''}</td><td>${escapeHtml(row.unit)}</td><td class="num">${escapeHtml(row.cost)}</td></tr>`).join('')}</tbody></table><h3 class="section-title">${escapeHtml(context.t('sheet.summary'))}</h3><div class="summary">${summary.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div><h3 class="section-title">${escapeHtml(context.t('sheet.allergens'))}</h3><div class="allergens">${escapeHtml(allergens)}</div><h3 class="section-title">${escapeHtml(context.t('nutrition.exportTitle'))}</h3><div class="nutrition-status ${nutrition.complete ? 'ok' : 'draft'}">${escapeHtml(nutrition.complete ? context.t('nutrition.exportStatusComplete') : context.t('nutrition.exportStatusDraft'))}</div><table><thead><tr><th>${escapeHtml(context.t('nutrition.value'))}</th><th class="num">${escapeHtml(context.t('nutrition.per100g'))}</th><th class="num">${escapeHtml(context.t('nutrition.perPortion'))}</th></tr></thead><tbody>${nutritionRows.map(([label, per100g, perPortion]) => `<tr><td>${escapeHtml(label)}</td><td class="num">${escapeHtml(per100g)}</td><td class="num">${escapeHtml(perPortion)}</td></tr>`).join('')}</tbody></table><p class="footer">${escapeHtml(context.t('sheet.footer'))}</p></section>`;
}).join('')}</body></html>`;
}

export function buildCookbookWorkbook(recipes: readonly Recipe[], context: ExportContext): ExcelWorkbook {
  const visible = recipes.filter((recipe) => !recipe.isSubRecipe);
  const sheets: Parameters<typeof createExcelWorkbook>[0] = [{
    name: context.t('cookbook.contents').slice(0, 31),
    rows: [
      [context.t('cookbook.title')],
      [context.t('cookbook.subtitle', { count: visible.length })],
      [],
      [context.t('sheet.category'), context.t('sheet.title'), context.t('sheet.foodCost'), context.t('sheet.portionCost')],
      ...visible.map((recipe) => [
        categoryLabel(recipe, context), recipe.title,
        context.format.percent(recipe.totals.foodCostPercent), context.format.money(recipe.totals.portionCost),
      ]),
    ],
    columns: [{ width: 20 }, { width: 34 }, { width: 16 }, { width: 18 }],
  }];

  for (const [, categoryRecipes] of groupedRecipes(visible)) {
    const title = categoryLabel(categoryRecipes[0], context).replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31) || 'Other';
    const rows: (string | number)[][] = [];
    for (const recipe of categoryRecipes) {
      rows.push([recipe.title], [
        context.t('sheet.servings'), recipe.servings,
        context.t('sheet.foodCost'), context.format.percent(recipe.totals.foodCostPercent),
      ], [
        context.t('sheet.ingredient'), context.t('sheet.quantity'), context.t('sheet.unit'),
        context.t('sheet.lineCost'), context.t('sheet.allergens'),
      ]);
      for (const ingredient of buildRecipeRows(recipe, context)) {
        rows.push([
          ingredient.isSubRecipe ? `↳ ${ingredient.name}` : ingredient.name,
          ingredient.gross ? `${ingredient.quantity} (${context.t('sheet.grossShort')} ${ingredient.gross})` : ingredient.quantity,
          ingredient.unit,
          ingredient.cost,
          ingredient.allergens.join(', ') || '—',
        ]);
      }
      const nutrition = calculateRecipeNutrition(recipe);
      rows.push(
        [],
        ...buildRecipeSummary(recipe, context).map(([label, value]) => [label, value]),
        [],
        [context.t('nutrition.exportTitle'), nutrition.complete
          ? context.t('nutrition.exportStatusComplete')
          : context.t('nutrition.exportStatusDraft')],
        [context.t('nutrition.value'), context.t('nutrition.per100g'), context.t('nutrition.perPortion')],
        ...buildNutritionRows(recipe, context),
        [],
        [],
      );
    }
    sheets.push({
      name: title,
      rows,
      columns: [{ width: 38 }, { width: 22 }, { width: 10 }, { width: 18 }, { width: 42 }],
    });
  }

  return createExcelWorkbook(sheets);
}
