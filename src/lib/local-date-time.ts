/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

export function localIsoDate(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function localIsoTime(value = new Date()) {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

export function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && localIsoDate(parsed) === value;
}

export function isIsoTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
}

/** Combină valorile introduse local și le persistă cu fusul orar inclus în ISO. */
export function combineLocalDateTime(date: string, time: string) {
  if (!isIsoDate(date) || !isIsoTime(time)) throw new Error('invalid-local-date-time');
  const parsed = new Date(`${date}T${time}:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error('invalid-local-date-time');
  return parsed.toISOString();
}

export function splitLocalDateTime(value: string) {
  const parsed = new Date(value);
  const safe = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return { date: localIsoDate(safe), time: localIsoTime(safe) };
}
