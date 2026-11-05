import { createClient, type Session } from '@supabase/supabase-js';
import { beforeEach, expect, it, vi } from 'vitest';
import { EMPTY_PNL_INPUTS } from '@/lib/pnl';
import type { PnlReport } from '@/types/pnl';

const fixture = vi.hoisted(() => ({ client: null as ReturnType<typeof createClient> | null, storage: new Map<string, string>() }));
vi.mock('@/lib/supabase', () => ({ get supabase() { return fixture.client; }, isDemoMode: false, isSupabaseConfigured: true }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => fixture.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { fixture.storage.set(key, value); },
} }));
import { loadCachedPnlReports, savePnlReport, syncPnlReports } from '@/lib/pnl-repository';

const owner = 'pnl-retention-owner';
const key = `manager247.pnl_reports.v1.${owner}`;
const revision = '2026-11-05T05:00:00.123456+00:00';
const report = (index = 0): PnlReport => ({
  ...EMPTY_PNL_INPUTS, id: `pnl-${index}`,
  period: `${2020 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`,
  revenueFood: 10000 + index, payrollCost: 4000, notes: `Month ${index}`, syncState: 'synced',
  createdAt: revision, updatedAt: revision,
});
const remote = (value: PnlReport): Record<string, unknown> => ({
  ...Object.fromEntries(Object.entries(EMPTY_PNL_INPUTS).map(([field]) => [field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), value[field as keyof typeof EMPTY_PNL_INPUTS]])),
  id: value.id, user_id: owner, period: `${value.period}-01`, notes: value.notes, created_at: value.createdAt, updated_at: value.updatedAt,
});
let stored: Record<string, unknown>[];
let listed: Record<string, unknown>[];
let targetFailure: boolean;
let malformedTarget: boolean;
let currentOwner: string;
let offline: boolean;
let writes: number;
let lookups: number;
let headers: (string | null)[];
let raceBeforeWrite: boolean;
beforeEach(() => {
  fixture.storage.clear(); stored = [remote(report())]; listed = []; targetFailure = false;
  malformedTarget = false; currentOwner = owner; offline = false; writes = 0; lookups = 0; headers = []; raceBeforeWrite = false;
  fixture.storage.set(key, JSON.stringify([report()]));
  const fetchFixture: typeof fetch = async (input, init) => {
    if (offline) throw new Error('offline');
    const url = new URL(String(input));
    headers.push(new Headers(init?.headers).get('Authorization'));
    if (init?.method === 'POST' || init?.method === 'PATCH') {
      writes++;
      const payload = JSON.parse(String(init.body));
      if (init.method === 'PATCH' && !stored.some(old => `eq.${old.updated_at}` === url.searchParams.get('updated_at'))) {
        return Response.json({ message: 'Revision changed' }, { status: 406 });
      }
      const row = { ...payload, updated_at: stored.some(old => old.period === payload.period) ? revision : payload.updated_at ?? revision };
      expect(row.user_id).toBe(owner);
      stored = [...stored.filter(old => old.period !== row.period), row];
      return Response.json(row);
    }
    expect(url.searchParams.get('user_id')).toBe(`eq.${owner}`);
    const periods = url.searchParams.get('period');
    if (periods) {
      lookups++;
      if (targetFailure) return Response.json({ message: 'lookup unavailable' }, { status: 400 });
      if (malformedTarget) return Response.json([{ id: 'wrong', period: 'bad' }]);
      const selected = stored.filter(row => periods.includes(String(row.period)));
      if (raceBeforeWrite) stored = stored.map(row => ({ ...row, revenue_food: 25000, updated_at: '2026-11-05T07:00:00Z' }));
      return Response.json(selected);
    }
    return Response.json(listed);
  };
  fixture.client = createClient('http://127.0.0.1:9876', 'qa-pnl-key', {
    global: { fetch: fetchFixture }, auth: { persistSession: false, autoRefreshToken: false },
  });
  vi.spyOn(fixture.client.auth, 'getSession').mockImplementation(async () => ({
    data: { session: { user: { id: currentOwner }, access_token: 'pnl-owner-token' } as Session }, error: null,
  }));
});

it('retains acknowledged reports omitted from the latest 36 and on a subsequent offline reopen', async () => {
  const history = Array.from({ length: 40 }, (_, index) => report(index));
  fixture.storage.set(key, JSON.stringify(history)); stored = history.map(remote); listed = stored.slice(4);
  const result = await syncPnlReports(owner);
  expect(result).toHaveLength(40);
  expect(lookups).toBeGreaterThan(0);
  offline = true;
  expect(await syncPnlReports(owner, { requireKnownReports: true })).toHaveLength(40);
  expect(writes).toBe(0);
});

it('recovers an omitted report through its owner and period', async () => {
  expect(await syncPnlReports(owner)).toEqual([report()]);
  expect(lookups).toBe(1); expect(writes).toBe(0);
  expect(headers.every(header => header === 'Bearer pnl-owner-token')).toBe(true);
});

it('keeps the acknowledged revision when both list and targeted read are older', async () => {
  stored = [remote({ ...report(), revenueFood: 1, updatedAt: '2026-11-05T05:00:00.123455+00:00' })];
  listed = stored;
  expect(await syncPnlReports(owner)).toEqual([report()]);
  expect(writes).toBe(0);
});

it('accepts a newer targeted revision for the same reporting period', async () => {
  const changed = { ...report(), id: 'server-current', revenueFood: 25000, updatedAt: '2026-11-05T06:00:00Z' };
  stored = [remote(changed)];
  expect(await syncPnlReports(owner)).toEqual([changed]);
});

it.each(['failed', 'malformed'])('keeps acknowledged data when the targeted response is %s', async (mode) => {
  targetFailure = mode === 'failed'; malformedTarget = mode === 'malformed';
  expect(await syncPnlReports(owner)).toEqual([report()]);
  expect(await loadCachedPnlReports(owner)).toEqual([report()]);
  expect(writes).toBe(0);
});

it('removes a report only after a successful targeted absence without re-uploading it', async () => {
  stored = [];
  expect(await syncPnlReports(owner)).toEqual([]);
  expect(lookups).toBe(1); expect(writes).toBe(0);
});

it('keeps another owner session from changing the original owner cache', async () => {
  currentOwner = 'different-owner';
  expect(await syncPnlReports(owner)).toEqual([report()]);
  expect(lookups).toBe(0); expect(writes).toBe(0);
});

it('retains a pending edit on a failed write and a stale read', async () => {
  fixture.storage.set(key, JSON.stringify([{ ...report(), syncState: 'pending', revenueFood: 12000 }]));
  currentOwner = 'different-owner';
  expect((await syncPnlReports(owner))[0]).toMatchObject({ syncState: 'pending', revenueFood: 12000 });
  expect(writes).toBe(0);
});

it('stores the acknowledged server timestamp and preserves it after an omitted list', async () => {
  const saved = await savePnlReport(owner, { ...report(), revenueFood: 13500 });
  expect(saved).toMatchObject({ updatedAt: revision, syncState: 'synced', revenueFood: 13500 });
  expect(await syncPnlReports(owner)).toEqual([saved]);
  expect(writes).toBe(1);
});

it('lets the server date a new report even when the device clock is far ahead', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  try {
    const saved = await savePnlReport(owner, report(9));
    expect(saved.updatedAt).toBe(revision);
  } finally { vi.useRealTimers(); }
});

it('does not replay a lost acknowledgement over a different newer cloud report', async () => {
  fixture.storage.set(key, JSON.stringify([{ ...report(), syncState: 'pending' }]));
  stored = [remote({ ...report(), revenueFood: 25000, updatedAt: '2026-11-05T07:00:00Z' })];
  expect((await syncPnlReports(owner))[0]).toMatchObject({ revenueFood: 10000, syncState: 'pending' });
  expect(stored[0].revenue_food).toBe(25000); expect(writes).toBe(0);
});

it('acknowledges identical already-committed data without replaying a write', async () => {
  fixture.storage.set(key, JSON.stringify([{ ...report(), syncState: 'pending' }]));
  expect((await syncPnlReports(owner))[0]).toMatchObject({ syncState: 'synced', revenueFood: 10000 });
  expect(writes).toBe(0);
});

it('replays a known-base offline edit only against that exact server revision', async () => {
  fixture.storage.set(key, JSON.stringify([{ ...report(), syncState: 'pending', revenueFood: 11000, baseUpdatedAt: revision }]));
  expect((await syncPnlReports(owner))[0]).toMatchObject({ syncState: 'synced', revenueFood: 11000 });
  expect(stored[0].revenue_food).toBe(11000); expect(writes).toBe(1);
});

it('keeps both versions when the cloud changes between the replay check and conditional write', async () => {
  fixture.storage.set(key, JSON.stringify([{ ...report(), syncState: 'pending', revenueFood: 11000, baseUpdatedAt: revision }]));
  raceBeforeWrite = true;
  expect((await syncPnlReports(owner))[0]).toMatchObject({ syncState: 'pending', revenueFood: 11000 });
  expect(stored[0].revenue_food).toBe(25000);
});

it('does not resurrect a known-existing report deleted before replay', async () => {
  fixture.storage.set(key, JSON.stringify([{ ...report(), syncState: 'pending', baseUpdatedAt: revision }]));
  stored = [];
  expect((await syncPnlReports(owner))[0]).toMatchObject({ syncState: 'pending' });
  expect(stored).toEqual([]); expect(writes).toBe(0);
});

it('inserts a known-new offline report when the month is still absent', async () => {
  fixture.storage.set(key, JSON.stringify([{ ...report(9), syncState: 'pending', baseUpdatedAt: null }]));
  expect((await syncPnlReports(owner))[0]).toMatchObject({ id: 'pnl-9', syncState: 'synced' });
  expect(writes).toBe(1);
});

it('keeps ambiguous legacy pending data available without recreating an absent cloud month', async () => {
  fixture.storage.set(key, JSON.stringify([{ ...report(), syncState: 'pending' }]));
  stored = [];
  expect((await syncPnlReports(owner))[0]).toMatchObject({ syncState: 'pending', revenueFood: 10000 });
  expect(writes).toBe(0);
});
