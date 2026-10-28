/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { combineLocalDateTime, isIsoDate, isIsoTime, splitLocalDateTime } from '@/lib/local-date-time';

describe('local date and time helpers', () => {
  it('round-trips a valid local date and time', () => {
    expect(splitLocalDateTime(combineLocalDateTime('2026-09-21', '08:35'))).toEqual({
      date: '2026-09-21',
      time: '08:35',
    });
  });

  it('rejects impossible dates and times', () => {
    expect(isIsoDate('2026-02-31')).toBe(false);
    expect(isIsoTime('24:00')).toBe(false);
    expect(() => combineLocalDateTime('2026-02-31', '08:00')).toThrow('invalid-local-date-time');
  });
});
