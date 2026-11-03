/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import * as queryString from 'query-string';

describe('Expo Router query dependency', () => {
  it('keeps normal and malformed navigation parameters usable', () => {
    expect(queryString.stringify({
      section: 'mine',
      saved: 'abc 123',
      literal: '%zz',
    }, { sort: false })).toBe('section=mine&saved=abc%20123&literal=%25zz');

    expect(queryString.parse('section=mine&saved=abc%20123&saved=two&literal=%zz'))
      .toEqual({
        literal: '%zz',
        saved: ['abc 123', 'two'],
        section: 'mine',
      });
  });

  it('decodes an adversarial malformed parameter without blocking navigation', () => {
    const child = spawnSync(process.execPath, ['-e', String.raw`
      const queryString = require('query-string');
      let payload = '';
      for (let i = 0; i < 32000; i += 1) {
        const high = Math.floor(i / 256).toString(16).padStart(2, '0');
        const low = (i % 256).toString(16).padStart(2, '0');
        payload += '%' + high + '%' + low + 'x';
      }
      payload += '%zz';
      const started = performance.now();
      const parsed = queryString.parse('value=' + payload);
      if (performance.now() - started > 2500) process.exit(3);
      if (typeof parsed.value !== 'string') process.exit(2);
      process.stdout.write('decoded');
    `], {
      cwd: process.cwd(),
      encoding: 'utf8',
      // Allow Windows process startup/antivirus overhead. The child separately
      // enforces the original 2.5-second limit around the actual decoder.
      timeout: 30_000,
    });

    expect(child.error, child.error?.message).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    expect(child.stdout).toBe('decoded');
  }, 40_000);
});
