/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import {
  buildHaccpAutocontrolDraft,
  createHaccpAutocontrolForm,
  eventsForMonth,
  formFromHaccpAutocontrolEvent,
  shiftMonthKey,
} from '@/lib/haccp-autocontrol';
import type { HaccpAutocontrolEvent } from '@/types/haccp-autocontrol';

describe('HACCP autocontrol calendar', () => {
  it('builds a local-time event with an earlier reminder', () => {
    const form = {
      ...createHaccpAutocontrolForm(new Date('2026-09-21T07:00:00')),
      title: ' Probă meniu prânz ',
      date: '2026-09-22',
      time: '11:30',
      reminderEnabled: true,
      reminderDate: '2026-09-21',
      reminderTime: '17:00',
    };
    const draft = buildHaccpAutocontrolDraft(form, 'Probă alimentară');
    expect(draft.title).toBe('Probă meniu prânz');
    expect(draft.reminderAt).not.toBeNull();
    expect(new Date(draft.reminderAt!).getTime()).toBeLessThan(new Date(draft.scheduledAt).getTime());
  });

  it('rejects a reminder at or after the control time', () => {
    const form = {
      ...createHaccpAutocontrolForm(),
      date: '2026-09-22',
      time: '11:30',
      reminderEnabled: true,
      reminderDate: '2026-09-22',
      reminderTime: '12:00',
    };
    expect(() => buildHaccpAutocontrolDraft(form, 'Test')).toThrow('reminder-after-schedule');
  });

  it('round-trips an existing event into the editor', () => {
    const draft = buildHaccpAutocontrolDraft({
      ...createHaccpAutocontrolForm(),
      date: '2026-10-02',
      time: '09:15',
    }, 'Test de apă');
    const event: HaccpAutocontrolEvent = {
      ...draft,
      id: 'event-1',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      syncState: 'synced',
    };
    expect(formFromHaccpAutocontrolEvent(event)).toMatchObject({ id: 'event-1', date: '2026-10-02', time: '09:15' });
  });

  it('moves across year boundaries and excludes tombstones', () => {
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    const base = {
      controlType: 'food_sample', title: 'Test', reminderAt: null, location: null,
      responsiblePerson: null, laboratory: null, notes: null, result: null,
      status: 'scheduled', source: 'manual', sourceFileName: null, completedAt: null,
      createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
      syncState: 'synced',
    } as const;
    const events: HaccpAutocontrolEvent[] = [
      { ...base, id: 'kept', scheduledAt: '2026-09-20T08:00:00.000Z' },
      { ...base, id: 'deleted', scheduledAt: '2026-09-21T08:00:00.000Z', deletedAt: '2026-09-19T00:00:00.000Z' },
    ];
    expect(eventsForMonth(events, '2026-09').map((event) => event.id)).toEqual(['kept']);
  });
});
