import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ files: new Map<string, { bytes: number; text?: string }>(), transfer: vi.fn(), manifestLoader: vi.fn(),
  diskLimit: 2_000_000_000, spaceChecks: [] as string[][] }));
vi.mock('@/lib/foodcom-catalog', async (original) => ({
  ...await original<typeof import('@/lib/foodcom-catalog')>(), loadFoodcomManifest: mock.manifestLoader,
}));
vi.mock('expo-file-system', () => ({
  Directory: class { uri: string; constructor(parent: string, name: string) { this.uri = `${parent}/${name}`; } create() {} },
  File: class {
    uri: string;
    constructor(parent: { uri: string }, name: string) { this.uri = `${parent.uri}/${name}`; }
    get exists() { return mock.files.has(this.uri); }
    get size() { return mock.files.get(this.uri)?.bytes ?? 0; }
    get md5() { return 'verified'; }
    create() { throw new Error('DECOMPRESSION_REACHED'); }
    async text() { return mock.files.get(this.uri)?.text ?? ''; }
    write(text: string) { mock.files.set(this.uri, { bytes: text.length, text }); }
    delete() { mock.files.delete(this.uri); }
  },
  Paths: { document: 'document', get availableDiskSpace() {
    mock.spaceChecks.push([...mock.files.keys()]);
    return mock.diskLimit - [...mock.files.values()].reduce((sum, file) => sum + file.bytes, 0);
  } }, FileMode: {},
}));
vi.mock('expo-file-system/legacy', () => ({ createDownloadResumable: mock.transfer }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: vi.fn() }));
vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove: vi.fn() }) } }));

const target = 'document/foodcom-reference-v2/download.sqlite.gz';
const checkpoint = 'document/foodcom-reference-v2/download-resume.json';
const url = 'https://github.com/paulnemesu-debug/manager-24-7/releases/download/catalogue-foodcom-v2/foodcom-v2.sqlite.gz';

beforeEach(() => { vi.resetModules(); mock.files.clear(); mock.transfer.mockReset(); mock.manifestLoader.mockReset(); mock.diskLimit = 2_000_000_000; mock.spaceChecks.length = 0; });
function oldCheckpoint() {
  mock.files.set(target, { bytes: 100 });
  mock.files.set(checkpoint, { bytes: 1, text: JSON.stringify({ url, bytes: 100, resumeData: '100' }) });
}

describe('native catalogue download checkpoints', () => {
  it('clears a crashed decompression only after acquiring the lock, before estimating free space', async () => {
    const temporary = 'document/foodcom-reference-v2/foodcom-v2.installing.sqlite';
    const active = 'document/foodcom-reference-v2/foodcom-v2.sqlite';
    mock.files.set(temporary, { bytes: 1000 });
    mock.files.set(active, { bytes: 1000 });
    mock.files.set(target, { bytes: 1000 });
    mock.diskLimit = 50_003_000;
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const wait = new Promise<void>((resolve) => { release = resolve; });
    mock.manifestLoader.mockImplementationOnce(async () => {
      entered(); await wait;
      return { database: { bytes: 1000, md5: 'verified' }, download: { bytes: 1000, md5: 'verified' } };
    });
    const { foodcomReader } = await import('@/lib/foodcom-catalog-store.native');
    const installing = foodcomReader.install(() => undefined);
    await started;
    await expect(foodcomReader.install(() => undefined)).rejects.toThrow('FOODCOM_BUSY');
    expect(mock.files.has(temporary)).toBe(true);
    release();
    await expect(installing).rejects.toThrow('DECOMPRESSION_REACHED');
    expect(mock.spaceChecks[0]).not.toContain(temporary);
    expect(mock.files.get(active)?.bytes).toBe(1000);
    expect(mock.files.get(target)?.bytes).toBe(1000);
    expect(mock.transfer).not.toHaveBeenCalled();
  });

  it('preserves a current native checkpoint on network failure and resumes after reopening', async () => {
    oldCheckpoint();
    const resume = vi.fn(async () => { mock.files.set(target, { bytes: 150 }); throw new Error('network lost'); });
    mock.transfer.mockReturnValueOnce({ resumeAsync: resume, pauseAsync: async () => ({ resumeData: '150' }) });
    const first = await import('@/lib/foodcom-catalog-store.native');
    await expect(first.downloadFoodcomDatabase(() => undefined, undefined, 314)).rejects.toThrow('network lost');
    expect(JSON.parse(mock.files.get(checkpoint)!.text!)).toMatchObject({ resumeData: '150', bytes: 150 });
    vi.resetModules();
    const nextResume = vi.fn(async () => ({ status: 206 }));
    mock.transfer.mockReturnValueOnce({ resumeAsync: nextResume });
    const reopened = await import('@/lib/foodcom-catalog-store.native');
    await reopened.downloadFoodcomDatabase(() => undefined, undefined, 314);
    expect(mock.transfer.mock.calls[1][4]).toBe('150');
    expect(nextResume).toHaveBeenCalledOnce();
    expect(mock.files.has(checkpoint)).toBe(false);
  });

  it.each(['reject', 'missing'])('drops old checkpoint and partial bytes when native pause is %s', async (mode) => {
    oldCheckpoint();
    mock.transfer.mockReturnValueOnce({
      resumeAsync: async () => { mock.files.set(target, { bytes: 150 }); throw new Error('network lost'); },
      pauseAsync: async () => { if (mode === 'reject') throw new Error('no task'); return {}; },
    });
    const reader = await import('@/lib/foodcom-catalog-store.native');
    await expect(reader.downloadFoodcomDatabase(() => undefined, undefined, 314)).rejects.toThrow('network lost');
    expect(mock.files.has(checkpoint)).toBe(false);
    expect(mock.files.has(target)).toBe(false);
    const restart = vi.fn(async () => ({ status: 200 }));
    mock.transfer.mockReturnValueOnce({ downloadAsync: restart });
    await reader.downloadFoodcomDatabase(() => undefined, undefined, 314);
    expect(mock.transfer.mock.calls[1][4]).toBeUndefined();
    expect(restart).toHaveBeenCalledOnce();
  });

  it('keeps a pause checkpoint on cancellation and never activates an incomplete database', async () => {
    let complete!: (value: undefined) => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const active = new Promise<undefined>((resolve) => { complete = resolve; });
    mock.transfer.mockReturnValueOnce({
      downloadAsync: () => { mock.files.set(target, { bytes: 100 }); started(); return active; },
      pauseAsync: async () => { complete(undefined); return { resumeData: '100' }; },
    });
    const reader = await import('@/lib/foodcom-catalog-store.native');
    const controller = new AbortController();
    const download = reader.downloadFoodcomDatabase(() => undefined, controller.signal, 314);
    await entered;
    controller.abort();
    await expect(download).rejects.toThrow('FOODCOM_CANCELLED');
    expect(JSON.parse(mock.files.get(checkpoint)!.text!)).toMatchObject({ resumeData: '100', bytes: 100 });
    expect(await reader.foodcomReader.getState()).toEqual({ installed: false, count: 0 });
  });
});
