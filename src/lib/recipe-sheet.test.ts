/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';
import readXlsxFile from 'read-excel-file/universal';

import { translate } from '@/i18n/translations';
import { demoRecipes } from '@/lib/demo-data';
import { createFormatters } from '@/lib/format';
import { workbookToBlob } from '@/lib/excel-workbook';
import {
  buildRecipeHtml,
  buildRecipeWorkbook,
  type ExportContext,
  grossQuantity,
  safeFileName,
} from './recipe-sheet';

function context(overrides: Partial<ExportContext> = {}): ExportContext {
  return {
    locale: 'ro',
    t: (key, params) => translate('ro', key, params),
    format: createFormatters('ro'),
    userEmail: 'paul.nemesu@paradim.ro',
    pricesDate: '2026-08-28T10:00:00.000Z',
    plan: 'pro',
    ...overrides,
  };
}

const burger = demoRecipes.find((recipe) => recipe.id === 'demo-burger')!;

describe('fișa tehnică', () => {
  it('transformă cantitatea netă în necesar de achiziție', () => {
    expect(grossQuantity(900, 10)).toBe(1000);
    expect(grossQuantity(1, 0)).toBe(1);
  });

  it('curăță denumirea pentru numele fișierului', () => {
    expect(safeFileName('Ciorbă de burtă (mare)')).toBe('ciorba-de-burta-mare');
    expect(safeFileName('!!!')).toBe('reteta');
  });

  it('conține sigla, toate ingredientele și rezumatul economic', () => {
    const html = buildRecipeHtml(burger, context());
    expect(html).toContain('data:image/png;base64,');
    for (const ingredient of burger.ingredients) {
      expect(html).toContain(ingredient.name);
    }
    expect(html).toContain('Cost total rețetă');
    expect(html).toContain('Cost / porție');
    expect(html).toContain('Food Cost');
    expect(html).toContain('Preț meniu');
    expect(html).toContain('Preț recomandat cu TVA');
  });

  it('scrie categoria și porțiile, fără un al doilea scăzământ de rețetă', () => {
    const html = buildRecipeHtml(burger, context());
    expect(html).toContain('Fel principal');
    expect(html).toContain('Porții planificate');
    expect(html).not.toContain('Randament');
  });

  it('marchează rândurile de semipreparat', () => {
    expect(buildRecipeHtml(burger, context())).toContain('class="sub"');
  });

  it('pune alergenii pe fiecare rând, cu pictogramă', () => {
    const html = buildRecipeHtml(burger, context());
    expect(html).toContain('row-allergens');
    expect(html).toContain('<svg viewBox="0 0 24 24"');
    expect(html).toContain('Cereale cu gluten');
    expect(html).toContain('Muștar');
  });

  it('tipărește data prețurilor și contul care a generat fișa', () => {
    const html = buildRecipeHtml(burger, context());
    expect(html).toContain('Prețuri actualizate la');
    expect(html).toContain('paul.nemesu@paradim.ro');
  });

  it('pune filigran doar pe planul gratuit', () => {
    expect(buildRecipeHtml(burger, context({ plan: 'pro' }))).not.toContain('class="watermark"');
    const free = buildRecipeHtml(burger, context({ plan: 'free' }));
    expect(free).toContain('class="watermark"');
    expect(free).toContain('Manager 24/7 — plan gratuit');
  });

  it('scapă textul introdus de utilizator în loc să îl insereze ca marcaj', () => {
    const html = buildRecipeHtml({ ...burger, title: '<script>alert(1)</script>' }, context());
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('traduce fișa când se schimbă limba', () => {
    const english = buildRecipeHtml(burger, context({
      locale: 'en',
      t: (key, params) => translate('en', key, params),
      format: createFormatters('en'),
    }));
    expect(english).toContain('Recommended price incl. VAT');
    expect(english).not.toContain('Preț recomandat');
  });

  it('include declarația nutrițională și marchează datele incomplete drept ciornă', () => {
    const html = buildRecipeHtml(burger, context());
    expect(html).toContain('Declarație nutrițională');
    expect(html).toContain('CIORNĂ — date incomplete sau neconfirmate');
    expect(html).toContain('per 100 g');
    expect(html).toContain('per porție');
  });

  it('folosește un layout A4 compact, cu tabele care nu depășesc pagina', () => {
    const html = buildRecipeHtml(burger, context());
    expect(html).toContain('@page { size: A4 portrait; margin: 7mm 8mm 7mm; }');
    expect(html).toContain('table-layout: fixed');
    expect(html).toContain('class="ingredients-table"');
    expect(html).toContain('class="nutrition-table"');
    expect(html).toContain('page-break-inside: avoid');
  });
});

describe('exportul Excel', () => {
  it('are aceleași coloane, pe o singură foaie', () => {
    const workbook = buildRecipeWorkbook(burger, context());
    expect(workbook.SheetNames).toEqual(['Food Cost']);

    const rows = workbook.Sheets['Food Cost'].rows;
    const header = rows.find((row) => row[0] === 'Ingredient');

    expect(header).toEqual(['Ingredient', 'Cantitate', 'Unitate', 'Cost', 'Alergeni']);
  });

  it('scrie alergenii ca text pe fiecare rând', () => {
    const rows = buildRecipeWorkbook(burger, context()).Sheets['Food Cost'].rows;
    const bun = rows.find((row) => String(row[0]).includes('Chiflă'));
    expect(bun?.[4]).toContain('Cereale cu gluten');
  });

  it('include rezumatul, data prețurilor și utilizatorul', () => {
    const flat = buildRecipeWorkbook(burger, context()).Sheets['Food Cost'].rows
      .map((row) => row.join(' '))
      .join('\n');

    expect(flat).toContain(burger.title);
    expect(flat).toContain('Cost total rețetă');
    expect(flat).toContain('Prețuri actualizate la');
    expect(flat).toContain('paul.nemesu@paradim.ro');
  });

  it('include declarația nutrițională și în exportul Excel', () => {
    const flat = buildRecipeWorkbook(burger, context()).Sheets['Food Cost'].rows
      .map((row) => row.join(' '))
      .join('\n');
    expect(flat).toContain('Declarație nutrițională');
    expect(flat).toContain('CIORNĂ — date incomplete sau neconfirmate');
  });

  it('notează planul gratuit în fișier', () => {
    const flat = buildRecipeWorkbook(burger, context({ plan: 'free' })).Sheets['Food Cost'].rows
      .map((row) => row.join(' '))
      .join('\n');
    expect(flat).toContain('plan gratuit');
  });

  it('generează un fișier XLSX valid care poate fi citit din nou', async () => {
    const blob = await workbookToBlob(buildRecipeWorkbook(burger, context()));
    const sheets = await readXlsxFile(await blob.arrayBuffer());
    expect(sheets[0].sheet).toBe('Food Cost');
    expect(sheets[0].data.flat().join(' ')).toContain(burger.title);
  });
});
