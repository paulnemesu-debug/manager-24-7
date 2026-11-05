import { createClient, type Session } from '@supabase/supabase-js';
import { beforeEach, expect, it, vi } from 'vitest';

const { disk, fixture } = vi.hoisted(() => ({
  disk: new Map<string, string>(),
  fixture: { client: null as ReturnType<typeof createClient> | null },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => disk.get(key) ?? null,
  setItem: async (key: string, value: string) => { disk.set(key, value); },
} }));
vi.mock('@/lib/supabase', () => ({ isDemoMode: false, isSupabaseConfigured: true, get supabase() { return fixture.client; } }));

import { acceptRemoteManagementDay, loadManagementDailySnapshots, loadManagementSnapshots, ManagementDayPendingError, saveManagementSnapshot } from './management-repository';

const owner = 'qa-owner';
const other = 'qa-other-owner';
const firstDay = '2026-11-04';
const draft = {
  id: 'bistro-report', date: firstDay, locationId: 'qa-bistro',
  inventory: [{ catalogId: 'milk', name: 'Milk', openingQuantity: 5, purchasesQuantity: 2, closingQuantity: 3, unitCost: 9.25 }],
  sales: [{ recipeId: 'soup', name: 'Soup', quantity: 25, revenue: 375, theoreticalUnitCost: 3 }],
  labor: [{ employeeName: 'QA Cook', role: 'Cook', hours: 8, hourlyCost: 30 }],
};

type DayRequest = {
  p_owner: string;
  p_id: string;
  p_location: string | null;
  p_date: string;
  p_expected_version: number;
  p_request_id: string;
  p_inventory: typeof draft.inventory;
  p_sales: typeof draft.sales;
  p_labor: (typeof draft.labor[number] & { id?: string })[];
};
type DayRow = ReturnType<typeof row>;
const server = new Map<string, DayRow>();
const sent: DayRequest[] = [];
let activeOwner: string;
let offline: boolean;
let loseResponse: boolean;
let reject: boolean;

function row(input: DayRequest, version: number) {
  return {
    id: input.p_id, user_id: input.p_owner, location_id: input.p_location, counted_at: input.p_date,
    lines: input.p_inventory, notes: null, updated_at: `${input.p_date}T12:00:00+00:00`,
    daily_report: {
      version, requestId: input.p_request_id, scope: input.p_location ?? 'general', sales: input.p_sales,
      labor: input.p_labor.map((line, index) => ({ ...line, id: line.id ?? `canonical-labor-${index}` })),
    },
  };
}

const fixtureFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const session = new Headers(init?.headers).get('authorization');
  if (offline) throw new TypeError('Injected offline');
  if (url.pathname === '/rest/v1/management_physical_inventory') return Response.json([]);
  expect(session).toBe(`Bearer qa-token-${activeOwner}`);
  if (url.pathname === '/rest/v1/rpc/foodcost_save_management_day') {
    const body = JSON.parse(String(init?.body)) as DayRequest;
    sent.push(body);
    if (reject) return Response.json({ code: '22023', message: 'Invalid labor' }, { status: 400 });
    const existing = server.get(body.p_id);
    const sameScope = [...server.values()].find(item =>
      item.user_id === body.p_owner && item.counted_at === body.p_date && item.location_id === body.p_location);
    if (existing?.daily_report.requestId === body.p_request_id) return Response.json({ applied: true, record: existing });
    if ((existing?.daily_report.version ?? 0) !== body.p_expected_version || (!existing && sameScope)) {
      return Response.json({ applied: false, record: existing ?? sameScope ?? null });
    }
    const saved = row(body, (existing?.daily_report.version ?? 0) + 1);
    server.set(saved.id, saved);
    if (loseResponse) { loseResponse = false; throw new TypeError('Injected lost acknowledgement'); }
    return Response.json({ applied: true, record: saved });
  }
  expect(url.pathname).toBe('/rest/v1/inventory_counts');
  expect(url.searchParams.get('daily_report')).toBe('not.is.null');
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const limit = Number(url.searchParams.get('limit') ?? 100);
  const matching = [...server.values()].filter(item => url.searchParams.get('user_id') === `eq.${item.user_id}`);
  return Response.json(matching.slice(offset, offset + limit));
};

beforeEach(() => {
  disk.clear();
  server.clear();
  sent.length = 0;
  offline = loseResponse = reject = false;
  activeOwner = owner;
  fixture.client = createClient('http://127.0.0.1:9876', 'fixture-key', {
    global: { fetch: fixtureFetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  vi.spyOn(fixture.client.auth, 'getSession').mockImplementation(async () => ({
    data: { session: { user: { id: activeOwner }, access_token: `qa-token-${activeOwner}` } as Session }, error: null,
  }));
});

it('reopens the complete named day with fresh disk and leaves it out of physical history', async () => {
  expect(await saveManagementSnapshot(owner, draft)).toMatchObject({ ...draft, syncState: 'synced', serverVersion: 1 });
  expect(await loadManagementSnapshots(owner, { locationId: draft.locationId })).toEqual([]);
  disk.clear();
  expect(await loadManagementDailySnapshots(owner)).toEqual([expect.objectContaining({
    ...draft, laborIds: ['canonical-labor-0'], syncState: 'synced', serverVersion: 1,
  })]);
  expect(await loadManagementSnapshots(owner, { locationId: draft.locationId })).toEqual([]);
  activeOwner = other;
  expect(await loadManagementDailySnapshots(other)).toEqual([]);
});

it('retries the stored request after commit and lost reply, keeping one labor ID', async () => {
  loseResponse = true;
  const pending = await saveManagementSnapshot(owner, draft);
  expect(pending).toMatchObject({ syncState: 'pending' });
  expect(server.size).toBe(1);
  expect(await loadManagementDailySnapshots(owner)).toEqual([expect.objectContaining({
    ...draft, laborIds: ['canonical-labor-0'], syncState: 'synced', serverVersion: 1,
  })]);
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual(sent[0]);
  expect(server.size).toBe(1);
});

it('retains a rejected draft and distinguishes it from a same-day conflict', async () => {
  const first = await saveManagementSnapshot(owner, draft);
  const newer = await saveManagementSnapshot(owner, { ...draft, serverVersion: first.serverVersion, laborIds: first.laborIds });
  const stale = await saveManagementSnapshot(owner, {
    ...draft, serverVersion: first.serverVersion, laborIds: first.laborIds, labor: [{ ...draft.labor[0], hours: 10 }],
  });
  expect(stale).toMatchObject({ syncIssue: 'daily_conflict', labor: [{ hours: 10 }], remoteConflict: { serverVersion: 2 } });
  expect((await loadManagementDailySnapshots(owner))[0]).toEqual(stale);
  expect(await acceptRemoteManagementDay(owner, stale.id)).toEqual(newer);
  reject = true;
  expect(await saveManagementSnapshot(owner, { ...draft, serverVersion: 2, laborIds: first.laborIds })).toMatchObject({ syncIssue: 'daily_rejected' });
  const attempts = sent.length;
  expect((await loadManagementDailySnapshots(owner))[0].syncIssue).toBe('daily_rejected');
  expect(sent).toHaveLength(attempts);
});

it('keeps a pending request intact while offline and allows its edit after reconnect', async () => {
  offline = true;
  const pending = await saveManagementSnapshot(owner, draft);
  const edit = { ...draft, labor: [{ ...draft.labor[0], hours: 9 }] };
  await expect(saveManagementSnapshot(owner, edit)).rejects.toBeInstanceOf(ManagementDayPendingError);
  expect((await loadManagementDailySnapshots(owner))[0]).toEqual(pending);
  offline = false;
  const saved = await saveManagementSnapshot(owner, edit);
  expect(saved).toMatchObject({ syncState: 'synced', serverVersion: 2, labor: [{ hours: 9 }], laborIds: ['canonical-labor-0'] });
  expect(sent.map(item => item.p_expected_version)).toEqual([0, 1]);
  expect(server.size).toBe(1);
});

it('reads days beyond the old cache limit and preserves independent locations', async () => {
  const first = await saveManagementSnapshot(owner, draft);
  const template = sent[0];
  for (let index = 1; index <= 105; index++) {
    const date = new Date(Date.UTC(2026, 10, index + 4)).toISOString().slice(0, 10);
    const id = `extra-${index}`;
    server.set(id, row({ ...template, p_id: id, p_date: date, p_location: index % 2 ? 'another-location' : draft.locationId }, 1));
  }
  disk.clear();
  const loaded = await loadManagementDailySnapshots(owner);
  expect(loaded).toHaveLength(106);
  expect(loaded.at(-1)).toEqual(first);
  expect(loaded.some(item => item.locationId === 'another-location')).toBe(true);
});
