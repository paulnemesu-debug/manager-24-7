import { gunzipSync, strFromU8 } from 'fflate';
import { withFoodcomCatalogueLock } from '@/lib/foodcom-catalog-lock.web';
import { assertFoodcomNotAborted, FOODCOM_COUNT, FOODCOM_WEB_DOWNLOAD_BASE, foodcomIndexTerms, foodcomSearchTokens, loadFoodcomManifest, normalizeFoodcomRecipe,
  type FoodcomReader, type FoodcomRecipe, type FoodcomSummary } from '@/lib/foodcom-catalog';

const DATABASE = 'manager247-public-foodcom-v2';
type StoredRecipe = FoodcomRecipe & { terms: string[] };
let connection: Promise<IDBDatabase> | null = null;
let installing = false;

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('FOODCOM_BROWSER_UNSUPPORTED'));
  if (!connection) connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore('recipes', { keyPath: 'id' }).createIndex('terms', 'terms', { multiEntry: true });
      database.createObjectStore('meta');
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('FOODCOM_BUSY'));
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => { database.close(); connection = null; };
      resolve(database);
    };
  }).catch((error) => { connection = null; throw error; });
  return connection;
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

async function metadata(): Promise<{ ready?: boolean; chunks?: number; count?: number }> {
  const database = await open();
  return await result(database.transaction('meta').objectStore('meta').get('state')) ?? {};
}

export const foodcomReader: FoodcomReader = {
  async getState() {
    const state = await metadata();
    return { installed: state.ready === true && state.count === FOODCOM_COUNT, count: state.ready ? state.count ?? 0 : 0, completedChunks: state.chunks ?? 0 };
  },
  async search({ query, cursor: cursorValue, limit = 30, signal }) {
    assertFoodcomNotAborted(signal);
    if (!(await this.getState()).installed) throw new Error('FOODCOM_NOT_INSTALLED');
    const database = await open();
    const tokens = foodcomSearchTokens(query);
    const size = Math.max(1, Math.min(50, Math.floor(limit)));
    let after: [string, number] | null = null;
    if (cursorValue) {
      try { after = JSON.parse(cursorValue); } catch { throw new Error('FOODCOM_INVALID_CURSOR'); }
      if (!Array.isArray(after) || typeof after[0] !== 'string' || !Number.isSafeInteger(after[1])) throw new Error('FOODCOM_INVALID_CURSOR');
    }
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('recipes');
      const store = transaction.objectStore('recipes');
      const first = tokens[0];
      const lower = first ? (after?.[0] || first) : (after?.[1] ?? 0);
      const range = first ? IDBKeyRange.bound(lower, `${first}\uffff`) : IDBKeyRange.lowerBound(lower, true);
      const request = first ? store.index('terms').openCursor(range) : store.openCursor(range);
      const matches: { row: FoodcomSummary; cursor: string }[] = [];
      const finish = () => resolve({ items: matches.slice(0, size).map((item) => item.row), nextCursor: matches.length > size ? matches[size - 1].cursor : null });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        try {
          assertFoodcomNotAborted(signal);
          const cursor = request.result;
          if (!cursor) { finish(); return; }
          const row = cursor.value as StoredRecipe;
          const key = first ? String(cursor.key) : '';
          if (after && key === after[0] && row.id <= after[1]) {
            if (first && row.id < after[1]) cursor.continuePrimaryKey(key, after[1]);
            else cursor.continue();
            return;
          }
          const firstMatch = first ? row.terms.find((term) => term.startsWith(first)) : '';
          if ((!first || key === firstMatch) && tokens.every((token) => row.terms.some((term) => term.startsWith(token)))) {
            matches.push({ row: { id: row.id, title: row.title, category: row.category }, cursor: JSON.stringify([key, row.id]) });
            if (matches.length > size) { finish(); return; }
          }
          cursor.continue();
        } catch (error) { reject(error); transaction.abort(); }
      };
    });
  },
  async getDetail(id, signal) {
    assertFoodcomNotAborted(signal);
    if (!(await this.getState()).installed) throw new Error('FOODCOM_NOT_INSTALLED');
    const database = await open();
    const row = await result(database.transaction('recipes').objectStore('recipes').get(id));
    assertFoodcomNotAborted(signal);
    return row ? normalizeFoodcomRecipe(row) : null;
  },
  async install(onProgress, signal) {
    return withFoodcomCatalogueLock(async () => {
    if (installing) throw new Error('FOODCOM_BUSY');
    installing = true;
    try {
      const manifest = await loadFoodcomManifest(signal, FOODCOM_WEB_DOWNLOAD_BASE);
      const state = await metadata();
      if (state.ready && state.count === FOODCOM_COUNT) return;
      const estimate = await navigator.storage?.estimate?.();
      const remainingStorage = 850_000_000 * (1 - (state.chunks ?? 0) / manifest.webChunks.length);
      if (estimate?.quota && estimate.quota - (estimate.usage ?? 0) < remainingStorage) throw new Error('FOODCOM_STORAGE_SPACE');
      await navigator.storage?.persist?.().catch(() => false);
      const database = await open();
      const total = manifest.webChunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
      let completed = manifest.webChunks.slice(0, state.chunks ?? 0).reduce((sum, chunk) => sum + chunk.bytes, 0);
      for (let index = state.chunks ?? 0; index < manifest.webChunks.length; index += 1) {
        assertFoodcomNotAborted(signal);
        const chunk = manifest.webChunks[index];
        onProgress({ phase: 'downloading', completed, total });
        const response = await fetch(`${FOODCOM_WEB_DOWNLOAD_BASE}/${chunk.file}`, { signal });
        if (!response.ok) throw new Error('FOODCOM_DOWNLOAD_UNAVAILABLE');
        const bytes = await response.arrayBuffer();
        if (!globalThis.crypto?.subtle) throw new Error('FOODCOM_BROWSER_UNSUPPORTED');
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (value) => value.toString(16).padStart(2, '0')).join('');
        if (bytes.byteLength !== chunk.bytes || digest !== chunk.sha256) throw new Error('FOODCOM_CHECKSUM');
        const lines = strFromU8(gunzipSync(new Uint8Array(bytes))).trimEnd().split('\n');
        if (lines.length !== chunk.rows) throw new Error('FOODCOM_CHECKSUM');
        onProgress({ phase: 'installing', completed, total });
        const rows = lines.map((line) => {
          const row = normalizeFoodcomRecipe(JSON.parse(line));
          return { ...row, terms: foodcomIndexTerms(`${row.title} ${row.category ?? ''}`).sort() };
        });
        assertFoodcomNotAborted(signal);
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(['recipes', 'meta'], 'readwrite');
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error ?? new Error('FOODCOM_CANCELLED'));
          for (const row of rows) transaction.objectStore('recipes').put(row);
          transaction.objectStore('meta').put({ chunks: index + 1, ready: false }, 'state');
        });
        completed += chunk.bytes;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      assertFoodcomNotAborted(signal);
      onProgress({ phase: 'verifying', completed: total, total });
      const count = await result(database.transaction('recipes').objectStore('recipes').count());
      if (count !== FOODCOM_COUNT) throw new Error('FOODCOM_CHECKSUM');
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('meta', 'readwrite');
        transaction.objectStore('meta').put({ chunks: manifest.webChunks.length, count, ready: true }, 'state');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally { installing = false; }
    });
  },
  async remove() {
    return withFoodcomCatalogueLock(async () => {
    if (installing) throw new Error('FOODCOM_BUSY');
    if (connection) (await connection).close();
    connection = null;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DATABASE);
      request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('FOODCOM_BUSY'));
    });
    });
  },
};
