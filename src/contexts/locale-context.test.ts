/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { detectDeviceLocale } from './locale-context';

function withDeviceLocale(locale: string) {
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function DateTimeFormatMock() {
    return { resolvedOptions: () => ({ locale }) } as unknown as Intl.DateTimeFormat;
  } as unknown as typeof Intl.DateTimeFormat);
}

afterEach(() => vi.restoreAllMocks());

describe('device language', () => {
  it('starts in Romanian for a Romanian device', () => {
    withDeviceLocale('ro-RO');
    expect(detectDeviceLocale()).toBe('ro');
  });

  it('starts in Romanian for an English device used in Romania', () => {
    withDeviceLocale('en-RO');
    expect(detectDeviceLocale()).toBe('ro');
  });

  it('starts in English elsewhere', () => {
    withDeviceLocale('en-US');
    expect(detectDeviceLocale()).toBe('en');
    withDeviceLocale('de-DE');
    expect(detectDeviceLocale()).toBe('en');
  });

  it('falls back to Romanian when the platform reports nothing', () => {
    withDeviceLocale('');
    expect(detectDeviceLocale()).toBe('ro');
  });
});
