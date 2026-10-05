/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { getHaccpForm } from '@/constants/haccp-forms';
import { buildHaccpControlPackHtml, buildHaccpDocumentHtml, haccpDocumentMatchesMonth } from '@/lib/haccp-sheet';
import type { HaccpDocument } from '@/types/haccp';

const base = (formCode: string): HaccpDocument => ({
  id: '8d3a0739-8361-4392-b31c-4a7d0d246998',
  formCode,
  headerValues: { location: 'Bucătărie PARADIM', period: '09/2026' },
  rows: [],
  createdAt: '2026-09-13T10:00:00.000Z',
  updatedAt: '2026-09-13T10:00:00.000Z',
  syncState: 'synced',
});

describe('HACCP PDF sheet', () => {
  it('labels auto-generated readings as drafts and removes unconfirmed measurements and signatures', () => {
    const form = getHaccpForm('FO-H-20-01')!;
    const document = base(form.code);
    document.rows = [{ id: 'draft-row', values: { _auto_date: '2026-09-13', _requires_confirmation: 'true',
      date: '2026-09-13', vehicle_temperature: '4.321', product_temperature: '3.987', signature: 'Invented signature' },
      createdAt: document.createdAt, updatedAt: document.updatedAt }];
    const html = buildHaccpDocumentHtml(document, form, 'ro');
    expect(html).toContain('SCHIȚĂ');
    expect(html).not.toContain('4.321');
    expect(html).not.toContain('3.987');
    expect(html).not.toContain('Invented signature');
  });
  it('renders and escapes a table document', () => {
    const form = getHaccpForm('FO-H-20-01')!;
    const document = base(form.code);
    document.rows = [{
      id: 'row-1',
      values: {
        supplier: '<Metro & Co>', date: '2026-09-13', order_number: '42', category: 'meat',
        product: 'Pui', vehicle_condition: 'conform', vehicle_temperature: '4', product_temperature: '3.5',
        receiver: 'Paul Nemeșu', corrective_action: '',
      },
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    }];
    const html = buildHaccpDocumentHtml(document, form, 'ro');
    expect(html).toContain('FO-H-20-01');
    expect(html).toContain('&lt;Metro &amp; Co&gt;');
    expect(html).not.toContain('<Metro & Co>');
    expect(html).toContain('3.5 °C');
    expect(html).toContain('@page { size: A4 landscape');
  });

  it('renders all 31 source days in a daily matrix', () => {
    const form = getHaccpForm('FO-H-06-03')!;
    const document = base(form.code);
    document.headerValues = { location: 'Iași', month: '09', year: '2026' };
    document.rows = [{
      id: 'row-1',
      values: { day: '1', colour_ok: 'yes', smell_ok: 'yes', taste_ok: 'yes', turbidity_ok: 'yes', operator_code: 'PN', signature: 'Paul' },
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    }];
    const html = buildHaccpDocumentHtml(document, form, 'ro');
    expect(html).toContain('>31<');
    expect(html).toContain('>Da<');
    expect(html).toContain('FIȘĂ POTABILITATE APĂ');
  });

  it('renders selected declaration boxes and internal rules', () => {
    const form = getHaccpForm('FO-H-10-01')!;
    const document = base(form.code);
    document.headerValues = {
      visitor_name: 'Vizitator', organisation: 'Companie', date: '2026-09-13',
      foodborne_disease: 'no', pathogens: 'no', infected_wounds: 'no', skin_infections: 'no',
      diarrhoea: 'no', vomiting: 'no', sore_throat: 'no', discharge: 'no', other_disease: 'no',
      rules_acknowledged: 'yes', visitor_signature: 'Vizitator',
    };
    const html = buildHaccpDocumentHtml(document, form, 'ro');
    expect(html).toContain('☒ Nu am');
    expect(html).toContain('REGULI INTERNE');
    expect(html).toContain('@page { size: A4 portrait');
  });

  it('builds a landscape inspection pack and selects the logical month', () => {
    const september = base('FO-H-06-03');
    september.headerValues = { location: 'Iași', month: '9', year: '2026' };
    const august = base('FO-H-20-01');
    august.headerValues = { location: 'Iași', date: '2026-08-31' };

    expect(haccpDocumentMatchesMonth(september, '2026-09-19')).toBe(true);
    expect(haccpDocumentMatchesMonth(august, '2026-09-19')).toBe(false);

    const html = buildHaccpControlPackHtml([september], 'ro', 'septembrie 2026');
    expect(html).toContain('PACHET HACCP PENTRU CONTROL');
    expect(html).toContain('FO-H-06-03');
    expect(html).toContain('1 documente incluse');
    expect(html).toContain('@page { size: A4 landscape');
  });
});
