/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { buildEmailShareUrl, buildWhatsAppShareUrl } from '@/lib/share-urls';

describe('share links', () => {
  it('encodes a shopping list for WhatsApp', () => {
    expect(buildWhatsAppShareUrl('Făină 2 kg')).toBe('https://wa.me/?text=F%C4%83in%C4%83%202%20kg');
  });

  it('encodes subject and body for email', () => {
    const url = buildEmailShareUrl('Lista zilnică', 'Unt 1 kg');
    expect(url).toContain('subject=Lista%20zilnic%C4%83');
    expect(url).toContain('body=Unt%201%20kg');
  });
});
