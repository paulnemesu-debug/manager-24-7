import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
    storage: new Map<string, string>(), offline: false, ready: true, ledger: false, lostAck: false, user: 'one', calls: 0, upserts: 0, remote: null as Record<string, unknown> | null
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: async (k: string) => state.storage.get(k) ?? null, setItem: async (k: string, v: string) => {
            state.storage.set(k, v);
        }
    }
}));
vi.mock('@/lib/supabase', () => {
    const request = (work: () => unknown) => {
        let header = '';
        const result = {
            setHeader: (key: string, value: string) => {
                if (key === 'Authorization')
                    header = value;
                return result;
            }, then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve().then(() => {
                if (header !== `Bearer test-${state.user}`)
                    throw Error('authorization');
                return work();
            }).then(resolve, reject)
        };
        return result;
    };
    return {
        isDemoMode: false, isSupabaseConfigured: true, supabase: {
            auth: {
                getSession: async () => ({
                    data: {
                        session: {
                            user: {
                                id: state.user
                            }, access_token: `test-${state.user}`
                        }
                    }, error: null
                })
            },
            rpc: (name: string, args: {
                p_sheet_id: string;
            }) => request(() => {
                state.calls++;
                if (state.offline || !state.ready)
                    return {
                        error: Error('offline or sheet not synced'), data: null
                    };
                if (name !== 'create_production_sheet_voucher' || args.p_sheet_id !== 'sheet')
                    throw Error('wrong RPC');
                if (!state.ledger) {
                    state.ledger = true;
                    state.remote = {
                        id: '11111111-1111-4111-8111-111111111111', document_date: '2026-11-03', reference: 'Server', source: 'production_plan', source_reference: 'sheet', notes: 'Authoritative server snapshot', lines: [], total_cost: 0, created_at: '2026-11-03T00:00:00Z', updated_at: '2026-11-03T00:00:00Z'
                    };
                }
                if (state.lostAck) {
                    state.lostAck = false;
                    throw Error('lost ack');
                }
                return {
                    data: {
                        id: '11111111-1111-4111-8111-111111111111', status: state.remote ? 'existing' : 'deleted', record: state.remote
                    }, error: null
                };
            }),
            from: () => ({
                upsert: () => {
                    state.upserts++;
                    throw Error('Must never upsert generated vouchers');
                }, select: () => ({
                    eq: () => ({
                        order: () => ({
                            order: () => ({
                                limit: () => request(() => ({
                                    data: state.remote ? [state.remote] : [], error: null
                                }))
                            })
                        })
                    })
                })
            }),
        }
    };
});
import { createConsumptionVoucherOnce, loadCachedConsumptionVouchers, syncConsumptionVouchers, saveConsumptionVoucher } from './production-documents-repository';
import type { ConsumptionVoucherDraft } from '@/types/operations';
const draft: ConsumptionVoucherDraft = {
    id: '11111111-1111-4111-8111-111111111111', documentDate: '2026-11-03', reference: 'Local draft', source: 'production_plan', sourceReference: 'sheet', notes: 'Local snapshot', lines: []
};
beforeEach(() => {
    state.storage.clear();
    state.offline = false;
    state.ready = true;
    state.ledger = false;
    state.lostAck = false;
    state.user = 'one';
    state.calls = 0;
    state.upserts = 0;
    state.remote = null;
});
describe('generated vouchers insert once', () => {
    it('loads an existing edited server voucher on a new device without overwriting it', async () => {
        await createConsumptionVoucherOnce('one', draft);
        state.remote!.notes = 'Edited elsewhere';
        state.storage.clear();
        const result = await createConsumptionVoucherOnce('one', draft);
        expect(result.notes).toBe('Edited elsewhere');
        expect(state.remote!.notes).toBe('Edited elsewhere');
        expect(state.upserts).toBe(0);
    });
    it('preserves a remote deletion as a local tombstone on a new device', async () => {
        await createConsumptionVoucherOnce('one', draft);
        state.remote = null;
        state.storage.clear();
        await expect(createConsumptionVoucherOnce('one', draft)).rejects.toThrow(/deleted|șters/);
        expect((await loadCachedConsumptionVouchers('one'))[0].deletedAt).toBeTruthy();
        expect(await syncConsumptionVouchers('one')).toEqual([]);
        await expect(createConsumptionVoucherOnce('one', draft)).rejects.toThrow(/deleted|șters/);
        expect(state.remote).toBeNull();
        expect(state.upserts).toBe(0);
    });
    it('persists offline create-only intent and replays it via the RPC with the same id', async () => {
        state.offline = true;
        const pending = await createConsumptionVoucherOnce('one', draft);
        expect(pending).toMatchObject({
            id: draft.id, createOnly: true, syncState: 'pending'
        });
        expect((await loadCachedConsumptionVouchers('one'))[0]).toHaveProperty('createOnly', true);
        state.offline = false;
        const loaded = await syncConsumptionVouchers('one');
        expect(loaded[0]).toMatchObject({
            id: draft.id, syncState: 'synced'
        });
        expect(loaded[0].notes).toBe('Authoritative server snapshot');
        expect(state.upserts).toBe(0);
    });
    it('keeps intent pending until its validated production sheet reaches the server', async () => {
        state.ready = false;
        expect((await createConsumptionVoucherOnce('one', draft)).syncState).toBe('pending');
        expect((await syncConsumptionVouchers('one'))[0].syncState).toBe('pending');
        state.ready = true;
        expect((await syncConsumptionVouchers('one'))[0].syncState).toBe('synced');
        expect(state.upserts).toBe(0);
    });
    it('does not duplicate or overwrite after a lost acknowledgement', async () => {
        state.lostAck = true;
        expect((await createConsumptionVoucherOnce('one', draft)).syncState).toBe('pending');
        state.remote!.notes = 'Edited after lost ack';
        const retried = await syncConsumptionVouchers('one');
        expect(retried[0].notes).toBe('Edited after lost ack');
        expect(state.calls).toBe(2);
        expect(state.upserts).toBe(0);
    });
    it('does not send another owner pending snapshot to the active account', async () => {
        state.user = 'two';
        expect((await createConsumptionVoucherOnce('one', draft)).syncState).toBe('pending');
        expect(state.calls).toBe(0);
        expect(await loadCachedConsumptionVouchers('two')).toEqual([]);
    });
});
it('rejects ordinary editing of an unsynchronized creation intent without losing user bytes', async()=>{
  state.offline=true;
  await createConsumptionVoucherOnce('one',draft);
  const key='professional_foodcost.consumption_vouchers.v1.one';
  const original=state.storage.get(key);
  await expect(saveConsumptionVoucher('one',{...draft,notes:'Operator edit while still pending'})).rejects.toThrow(/synchronize|sincronizarea/);
  expect(state.storage.get(key)).toBe(original);
  state.offline=false;
  expect((await syncConsumptionVouchers('one'))[0].notes).toBe('Authoritative server snapshot');
  expect(state.upserts).toBe(0);
});
it('rechecks an older unmarked local receipt so a later server deletion is reported',async()=>{
 await createConsumptionVoucherOnce('one',draft);
 const key='professional_foodcost.consumption_vouchers.v1.one';
 const old=JSON.parse(state.storage.get(key)!);delete old[0].createOnly;state.storage.set(key,JSON.stringify(old));
 state.remote=null;
 await expect(createConsumptionVoucherOnce('one',draft)).rejects.toThrow(/deleted|șters/);
 expect((await loadCachedConsumptionVouchers('one'))[0].deletedAt).toBeTruthy();
 expect(state.upserts).toBe(0);
});
