/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { HACCP_FORMS, localize } from '@/constants/haccp-forms';

const EXPECTED_CODES = [
  'FO-H-04-01', 'FO-H-05-01', 'FO-H-05-02', 'FO-H-06-02', 'FO-H-06-03',
  'FO-H-06-04', 'FO-H-07-01', 'FO-H-10-01', 'FO-H-11-01', 'FO-H-14-01',
  'FO-H-14-02', 'FO-H-16-01', 'FO-H-17-01', 'FO-H-17-02', 'FO-H-18-01',
  'FO-H-18-02', 'FO-H-20-01', 'FO-H-20-02', 'FO-H-20-03',
];

describe('HACCP form catalogue', () => {
  it('contains every supplied PARADIM form exactly once', () => {
    expect(HACCP_FORMS.map((form) => form.code)).toEqual(EXPECTED_CODES);
    expect(new Set(HACCP_FORMS.map((form) => form.code)).size).toBe(19);
  });

  it('has complete RO and EN labels and unique field keys', () => {
    for (const form of HACCP_FORMS) {
      expect(localize(form.title, 'ro').trim()).not.toBe('');
      expect(localize(form.title, 'en').trim()).not.toBe('');
      const allFields = [...form.documentFields, ...form.rowFields];
      expect(new Set(allFields.map((field) => field.key)).size).toBe(allFields.length);
      for (const field of allFields) {
        expect(localize(field.label, 'ro').trim()).not.toBe('');
        expect(localize(field.label, 'en').trim()).not.toBe('');
        if (field.type === 'choice') expect(field.options?.length).toBeGreaterThan(1);
      }
    }
  });

  it('keeps matrix axes in their source period', () => {
    const daily = HACCP_FORMS.find((form) => form.code === 'FO-H-04-01');
    const annual = HACCP_FORMS.find((form) => form.code === 'FO-H-11-01');
    expect(daily?.axisOrder).toHaveLength(31);
    expect(annual?.axisOrder).toHaveLength(12);
  });

  it('requires an explicit selectable date on every HACCP document', () => {
    for (const form of HACCP_FORMS) {
      const date = form.documentFields.find((field) => field.key === 'form_date');
      expect(date, form.code).toMatchObject({
        type: 'date',
        required: true,
        defaultValue: '@today',
      });
    }
  });
});
