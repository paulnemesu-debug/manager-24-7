/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import {
  buildHaccpTodayTasks,
  completeHygieneToday,
  pendingHaccpTodayCount,
  recordEquipmentTemperature,
  temperatureIsConform,
} from '@/lib/haccp-today';
import type { HaccpEquipment, HaccpRoutineProfile } from '@/types/haccp-routine';

const now = new Date('2026-09-19T06:30:00');
const profile: HaccpRoutineProfile = {
  defaultLocationId: null, defaultLocationName: 'Bucătărie', responsibleName: 'Chef', shiftStartTime: '06:00', updatedAt: '', syncState: 'local',
};
const fridge: HaccpEquipment = {
  id: 'eq', locationId: null, name: 'Frigider carne', kind: 'cold', criticalMin: 0, criticalMax: 4,
  requiredReadings: 3, readingTimes: ['06:00', '12:00', '18:00'], active: true, sortOrder: 1, updatedAt: '', syncState: 'local',
};

describe('HACCP today workflow', () => {
  it('creates the monthly hygiene row with one tap', () => {
    const document = completeHygieneToday([], profile, 'operator@example.com', now);
    expect(document.formCode).toBe('FO-H-04-01');
    expect(document.headerValues).toMatchObject({ month: '09', year: '2026', location: 'Bucătărie' });
    expect(document.rows[0].values).toMatchObject({ day: '19', hygiene_check: 'yes', monitoring_time: '06:30' });
    expect(document.rows[0].values.signature).toContain('operator@example.com');
  });

  it('fills the next cold-room reading and rejects missing corrective action', () => {
    const first = recordEquipmentTemperature({ documents: [], equipment: fridge, profile, identity: 'Chef', temperature: 3, correctiveAction: '', now });
    expect(first.slot).toBe(1);
    const second = recordEquipmentTemperature({ documents: [first.document], equipment: fridge, profile, identity: 'Chef', temperature: 3.5, correctiveAction: '', now: new Date('2026-09-19T12:00:00') });
    expect(second.slot).toBe(2);
    expect(() => recordEquipmentTemperature({ documents: [second.document], equipment: fridge, profile, identity: 'Chef', temperature: 8, correctiveAction: '', now })).toThrow('corrective-action-required');
  });

  it('calculates conform ranges and pending badge tasks', () => {
    expect(temperatureIsConform(4, fridge)).toBe(true);
    expect(temperatureIsConform(4.1, fridge)).toBe(false);
    const tasks = buildHaccpTodayTasks([], [fridge], 'ro', now);
    expect(tasks.map((item) => item.key)).toEqual(['hygiene', 'equipment:eq', 'cleaning', 'reception']);
    expect(pendingHaccpTodayCount([], [fridge], 'ro', now)).toBe(3);
  });
});
