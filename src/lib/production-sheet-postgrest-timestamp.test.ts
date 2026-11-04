import { createClient, type Session } from '@supabase/supabase-js';
import { expect, it, vi } from 'vitest';

import { calculateRecipeTotals, createEmptyIngredient, createEmptyRecipe } from './calculations';
import { createProductionSheet, loadProductionSheets, resolveProductionSheet, saveProductionSheet } from './production-sheets';

const fixture = vi.hoisted(() => ({
  client: null as ReturnType<typeof createClient> | null,
  cache: new Map<string, string>(),
}));
vi.mock('@/lib/supabase', () => ({
  get supabase() { return fixture.client; },
  isDemoMode: false,
  isSupabaseConfigured: true,
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => fixture.cache.get(key) ?? null,
    setItem: async (key: string, value: string) => { fixture.cache.set(key, value); },
  },
}));

it('acknowledges and reopens a live-format production row with PostgreSQL microseconds', async () => {
  const userId = 'staging-timestamp-fixture';
  const updatedAt = '2026-11-04T17:34:26.306737+00:00';
  let record: { id: string; data: Record<string, unknown>; updated_at: string; version: number } | undefined;
  const fetchFixture: typeof fetch = async (input, init) => {
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-jwt');
    const url = new URL(String(input));
    if (url.pathname.endsWith('/rpc/sync_operational_record')) {
      const payload = JSON.parse(String(init?.body));
      if (record && payload.p_expected_version === 0) {
        const applied = record.data.notes === payload.p_data.notes;
        return Response.json({ applied, record });
      }
      record = { id: payload.p_id, data: payload.p_data, updated_at: updatedAt, version: 1 };
      return Response.json({ applied: true, record });
    }
    expect(url.pathname).toBe('/rest/v1/production_sheets');
    return Response.json(record ? [record] : []);
  };
  fixture.client = createClient('http://127.0.0.1:9876', 'qa-timestamp-key', {
    global: { fetch: fetchFixture },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  vi.spyOn(fixture.client.auth, 'getSession').mockResolvedValue({
    data: { session: { user: { id: userId }, access_token: 'test-jwt' } as Session },
    error: null,
  });
  const draft = {
    ...createEmptyRecipe(), title: 'Timestamp test',
    ingredients: [{ ...createEmptyIngredient(), name: 'Flour', quantity: 100 }],
  };
  const recipe = {
    ...draft, id: 'recipe-fixture', updatedAt, createdAt: updatedAt, allergens: [],
    totals: calculateRecipeTotals(draft),
  };
  const sheet = createProductionSheet(recipe, [recipe], [], 5, '2026-11-04');

  const saved = await saveProductionSheet(userId, sheet);
  expect(saved).toMatchObject({ id: sheet.id, syncState: 'synced', serverVersion: 1 });
  fixture.cache.clear();
  expect(await loadProductionSheets(userId)).toMatchObject([{ id: sheet.id, syncState: 'synced', serverVersion: 1 }]);

  const cacheKey = `manager247.production-sheets.v1.${userId}`;
  fixture.cache.set(cacheKey, JSON.stringify([{ ...sheet, syncState: 'pending', serverVersion: 0 }]));
  expect(await loadProductionSheets(userId)).toMatchObject([{ id: sheet.id, syncState: 'synced', serverVersion: 1 }]);
  fixture.cache.set(cacheKey, JSON.stringify([{ ...sheet, notes: 'Stale local edit', syncState: 'pending', serverVersion: 0 }]));
  expect(await loadProductionSheets(userId)).toMatchObject([{ id: sheet.id, syncState: 'conflict' }]);
  expect(await resolveProductionSheet(userId, sheet.id, 'remote')).toMatchObject([
    { id: sheet.id, syncState: 'synced', notes: sheet.notes, lines: sheet.lines, serverVersion: 1 },
  ]);
});
