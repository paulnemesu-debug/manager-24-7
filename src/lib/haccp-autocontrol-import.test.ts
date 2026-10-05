/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { parseHaccpAutocontrolImport } from '@/lib/haccp-autocontrol-import';
import { splitLocalDateTime } from '@/lib/local-date-time';

describe('HACCP autocontrol import', () => {
  it('imports Romanian CSV rows and preserves reminder date and time', async () => {
    const csv = [
      'Tip;Denumire;Data;Ora;Data reamintire;Ora reamintire;Locație;Responsabil;Laborator',
      'Probe alimentare;Probă meniu prânz;21.09.2026;11:30;20.09.2026;17:00;Bucătărie;Ana;Lab Test',
      'Teste apă;Analiză apă;2026-10-02;09:00;;;Bar;Mihai;DSP',
    ].join('\n');
    const rows = await parseHaccpAutocontrolImport(csv, 'plan.csv');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.controlType).toBe('food_sample');
    expect(splitLocalDateTime(rows[0]!.scheduledAt)).toEqual({ date: '2026-09-21', time: '11:30' });
    expect(splitLocalDateTime(rows[0]!.reminderAt!)).toEqual({ date: '2026-09-20', time: '17:00' });
    expect(rows[1]?.controlType).toBe('water_test');
    expect(rows[1]?.reminderAt).toBeNull();
  });

  it('does not guess rows without a recognized control type or date', async () => {
    const csv = 'Tip;Data;Ora\nAltceva;2026-09-21;10:00\nTeste igiena;data greșită;10:00';
    expect(await parseHaccpAutocontrolImport(csv, 'bad.csv')).toEqual([]);
  });
});
