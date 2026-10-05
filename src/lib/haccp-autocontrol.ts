/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { combineLocalDateTime, localIsoDate, localIsoTime, splitLocalDateTime } from '@/lib/local-date-time';
import type { HaccpAutocontrolDraft, HaccpAutocontrolEvent, HaccpAutocontrolType } from '@/types/haccp-autocontrol';

export type HaccpAutocontrolForm = {
  id?: string;
  controlType: HaccpAutocontrolType;
  title: string;
  date: string;
  time: string;
  reminderEnabled: boolean;
  reminderDate: string;
  reminderTime: string;
  location: string;
  responsiblePerson: string;
  laboratory: string;
  notes: string;
};

export function createHaccpAutocontrolForm(now = new Date()): HaccpAutocontrolForm {
  const reminder = new Date(now);
  reminder.setHours(8, 0, 0, 0);
  return {
    controlType: 'food_sample',
    title: '',
    date: localIsoDate(now),
    time: '09:00',
    reminderEnabled: false,
    reminderDate: localIsoDate(reminder),
    reminderTime: localIsoTime(reminder),
    location: '',
    responsiblePerson: '',
    laboratory: '',
    notes: '',
  };
}

const optional = (value: string) => value.trim() || null;

export function buildHaccpAutocontrolDraft(
  form: HaccpAutocontrolForm,
  fallbackTitle: string,
): HaccpAutocontrolDraft {
  const scheduledAt = combineLocalDateTime(form.date, form.time);
  const reminderAt = form.reminderEnabled
    ? combineLocalDateTime(form.reminderDate, form.reminderTime)
    : null;
  if (reminderAt && new Date(reminderAt).getTime() >= new Date(scheduledAt).getTime()) {
    throw new Error('reminder-after-schedule');
  }
  return {
    id: form.id,
    controlType: form.controlType,
    title: form.title.trim() || fallbackTitle,
    scheduledAt,
    reminderAt,
    location: optional(form.location),
    responsiblePerson: optional(form.responsiblePerson),
    laboratory: optional(form.laboratory),
    notes: optional(form.notes),
    result: null,
    status: 'scheduled',
    source: 'manual',
    sourceFileName: null,
    completedAt: null,
  };
}

export function formFromHaccpAutocontrolEvent(event: HaccpAutocontrolEvent): HaccpAutocontrolForm {
  const scheduled = splitLocalDateTime(event.scheduledAt);
  const reminder = event.reminderAt ? splitLocalDateTime(event.reminderAt) : scheduled;
  return {
    id: event.id,
    controlType: event.controlType,
    title: event.title,
    date: scheduled.date,
    time: scheduled.time,
    reminderEnabled: Boolean(event.reminderAt),
    reminderDate: reminder.date,
    reminderTime: reminder.time,
    location: event.location ?? '',
    responsiblePerson: event.responsiblePerson ?? '',
    laboratory: event.laboratory ?? '',
    notes: event.notes ?? '',
  };
}

export function monthKey(value = new Date()) {
  return localIsoDate(value).slice(0, 7);
}

export function shiftMonthKey(value: string, delta: number) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return monthKey();
  const date = new Date(Number(match[1]), Number(match[2]) - 1 + delta, 1, 12, 0, 0);
  return monthKey(date);
}

export function eventsForMonth(events: readonly HaccpAutocontrolEvent[], value: string) {
  return events
    .filter((event) => !event.deletedAt && localMonth(event.scheduledAt) === value)
    .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
}

function localMonth(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : monthKey(parsed);
}
