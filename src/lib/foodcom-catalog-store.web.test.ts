import { createHash } from 'node:crypto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { gzipSync, strToU8 } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({ manifest: {} as Record<string, unknown> }));
vi.mock('@/lib/foodcom-catalog', async (original) => ({
  ...await original<typeof import('@/lib/foodcom-catalog')>(),
  FOODCOM_COUNT: 2,
  loadFoodcomManifest: async () => mocked.manifest,
}));

let chunks: Uint8Array[];
let calls: string[];
let fetcher: ReturnType<typeof vi.fn<(url: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBufferLike> }>>>;

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  let held = false;
  vi.stubGlobal('navigator', {
    storage: { estimate: async () => ({ quota: 2_000_000_000, usage: 0 }), persist: async () => true },
    locks: { request: async (_name: string, _options: object, callback: (lock: object | null) => Promise<unknown>) => {
      if (held) return callback(null);
      held = true;
      try { return await callback({}); } finally { held = false; }
    } },
  });
  chunks = [38, 46].map((id) => gzipSync(strToU8(JSON.stringify({
    id, title: id === 38 ? 'Chicken lemon soup' : 'Chicken and rice', category: 'Dinner',
    ingredients: ['chicken'], quantities: ['1'], servings: 2, yield: null, instructions: ['Cook.'], nutrition: Array(9).fill(1),
  }) + '\n')));
  mocked.manifest = { webChunks: chunks.map((bytes, index) => ({
    file: `part-${index}.jsonl.gz`, rows: 1, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })) };
  calls = [];
  fetcher = vi.fn(async (url: string) => {
    calls.push(url);
    const index = Number(/part-(\d)/.exec(url)?.[1]);
    return { ok: true, arrayBuffer: async () => chunks[index].buffer.slice(0) };
  });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => vi.unstubAllGlobals());

describe('offline browser catalogue installation', () => {
  it('commits complete chunks, resumes after reopening, and searches offline', async () => {
    const first = (await import('@/lib/foodcom-catalog-store.web')).foodcomReader;
    const controller = new AbortController();
    await expect(first.install((progress) => {
      if (progress.phase === 'installing' && progress.completed > 0) controller.abort();
    }, controller.signal)).rejects.toThrow('FOODCOM_CANCELLED');
    expect(await first.getState()).toEqual({ installed: false, count: 0, completedChunks: 1 });
    await expect(first.search({ query: 'chicken' })).rejects.toThrow('FOODCOM_NOT_INSTALLED');
    vi.resetModules();
    const reopened = (await import('@/lib/foodcom-catalog-store.web')).foodcomReader;
    calls.length = 0;
    await reopened.install(() => undefined);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('part-1.jsonl.gz');
    expect(await reopened.getState()).toMatchObject({ installed: true, count: 2 });
    fetcher.mockRejectedValue(new Error('offline'));
    const page = await reopened.search({ query: 'chick', limit: 1 });
    expect(page.items.map((row) => row.id)).toEqual([38]);
    expect((await reopened.search({ query: 'chick', limit: 1, cursor: page.nextCursor })).items.map((row) => row.id)).toEqual([46]);
    expect((await reopened.search({ query: 'chick lemon' })).items.map((row) => row.id)).toEqual([38]);
    expect((await reopened.getDetail(46))?.ingredients).toEqual(['chicken']);
  });

  it('rejects concurrent install and removal from a separate module/tab', async () => {
    const first = (await import('@/lib/foodcom-catalog-store.web')).foodcomReader;
    vi.resetModules();
    const second = (await import('@/lib/foodcom-catalog-store.web')).foodcomReader;
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const implementation = fetcher.getMockImplementation()!;
    fetcher.mockImplementationOnce(async (url) => { started(); await blocked; return implementation(url); });
    const active = first.install(() => undefined);
    await entered;
    await expect(second.install(() => undefined)).rejects.toThrow('FOODCOM_BUSY');
    await expect(second.remove()).rejects.toThrow('FOODCOM_BUSY');
    release();
    await active;
    expect(await second.getState()).toMatchObject({ installed: true, count: 2 });
    await second.remove();
    expect(await first.getState()).toMatchObject({ installed: false, count: 0 });
  });

  it('does not commit a corrupted chunk and estimates only remaining storage on resume', async () => {
    const reader = (await import('@/lib/foodcom-catalog-store.web')).foodcomReader;
    const original = chunks[0];
    chunks[0] = new Uint8Array([1, 2, 3]);
    await expect(reader.install(() => undefined)).rejects.toThrow('FOODCOM_CHECKSUM');
    expect(await reader.getState()).toMatchObject({ installed: false, completedChunks: 0 });
    chunks[0] = original;
    const controller = new AbortController();
    await expect(reader.install((progress) => { if (progress.completed > 0) controller.abort(); }, controller.signal)).rejects.toThrow('FOODCOM_CANCELLED');
    Object.assign(navigator.storage, { estimate: async () => ({ quota: 1_000_000_000, usage: 500_000_000 }) });
    await reader.install(() => undefined);
    expect(await reader.getState()).toMatchObject({ installed: true });
  });
});
