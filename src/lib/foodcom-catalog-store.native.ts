import { Directory, File, FileMode, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { Gunzip } from 'fflate';
import { AppState } from 'react-native';

import { assertFoodcomNotAborted, decodeFoodcomPayload, FOODCOM_COUNT, FOODCOM_DOWNLOAD_BASE, foodcomSearchTokens, loadFoodcomManifest,
  type FoodcomProgress, type FoodcomReader, type FoodcomSummary } from '@/lib/foodcom-catalog';

const DIRECTORY = new Directory(Paths.document, 'foodcom-reference-v2');
const ACTIVE = 'foodcom-v2.sqlite';
let database: Promise<SQLiteDatabase> | null = null;
let installing = false;

async function open(): Promise<SQLiteDatabase> {
  if (!new File(DIRECTORY, ACTIVE).exists) throw new Error('FOODCOM_NOT_INSTALLED');
  if (!database) database = openDatabaseAsync(ACTIVE, {}, DIRECTORY.uri).then(async (connection) => {
    await connection.execAsync('PRAGMA query_only=ON;');
    return connection;
  }).catch((error) => { database = null; throw error; });
  return database;
}

async function close() {
  if (database) { const connection = await database; database = null; await connection.closeAsync(); }
}

async function checkpoint(target: File, resumeFile: File, url: string): Promise<string | undefined> {
  if (!resumeFile.exists) return undefined;
  try {
    const state = JSON.parse(await resumeFile.text());
    const bytes = target.exists ? target.size : 0;
    if (state.url === url && typeof state.resumeData === 'string' && state.resumeData.length && state.bytes === bytes) return state.resumeData;
  } catch { /* Invalid checkpoint requires a complete restart. */ }
  return undefined;
}

export async function downloadFoodcomDatabase(onProgress: (progress: FoodcomProgress) => void, signal: AbortSignal | undefined, expectedBytes: number) {
  const target = new File(DIRECTORY, 'download.sqlite.gz');
  const resumeFile = new File(DIRECTORY, 'download-resume.json');
  const url = `${FOODCOM_DOWNLOAD_BASE}/foodcom-v2.sqlite.gz`;
  const resumeData = await checkpoint(target, resumeFile, url);
  const reset = () => { if (resumeFile.exists) resumeFile.delete(); if (target.exists) target.delete(); };
  if (!resumeData) reset();
  const transfer = LegacyFileSystem.createDownloadResumable(url, target.uri, {}, (event) => {
    onProgress({ phase: 'downloading', completed: event.totalBytesWritten, total: expectedBytes });
  }, resumeData);
  let pause: Promise<void> | null = null;
  let started = false;
  const pauseTransfer = () => {
    if (pause) return;
    pause = transfer.pauseAsync().then((state) => {
      if (typeof state.resumeData === 'string' && state.resumeData.length) resumeFile.write(JSON.stringify({ url, resumeData: state.resumeData, bytes: target.exists ? target.size : 0 }));
      else reset();
    }).catch(reset);
  };
  signal?.addEventListener('abort', pauseTransfer, { once: true });
  const background = AppState.addEventListener('change', (state) => { if (state === 'background') pauseTransfer(); });
  try {
    assertFoodcomNotAborted(signal);
    started = true;
    const result = resumeData ? await transfer.resumeAsync() : await transfer.downloadAsync();
    if (pause) await pause;
    assertFoodcomNotAborted(signal);
    if (!result && pause) throw new Error('FOODCOM_CANCELLED');
    if (!result || result.status < 200 || result.status >= 300) throw new Error('FOODCOM_DOWNLOAD_UNAVAILABLE');
    if (resumeFile.exists) resumeFile.delete();
  } catch (error) {
    // Android can retain a byte-range checkpoint after a network failure. iOS
    // only resumes when the native task supplies valid opaque resume data.
    if (!pause && started) pauseTransfer();
    if (pause) await pause;
    throw error;
  } finally { signal?.removeEventListener('abort', pauseTransfer); background.remove(); }
  return target;
}

export const foodcomReader: FoodcomReader = {
  async getState() {
    if (!new File(DIRECTORY, ACTIVE).exists) return { installed: false, count: 0 };
    try {
      const connection = await open();
      const row = await connection.getFirstAsync<{ value: string }>("SELECT value FROM catalogue_meta WHERE key='rows'");
      const count = Number(row?.value ?? 0);
      return { installed: count === FOODCOM_COUNT, count };
    } catch { return { installed: false, count: 0 }; }
  },
  async search({ query, cursor, limit = 30, signal }) {
    assertFoodcomNotAborted(signal);
    const connection = await open();
    const terms = foodcomSearchTokens(query);
    const size = Math.max(1, Math.min(50, Math.floor(limit)));
    const after = cursor ? Number(cursor) : 0;
    if (!Number.isSafeInteger(after) || after < 0) throw new Error('FOODCOM_INVALID_CURSOR');
    const rows = terms.length
      ? await connection.getAllAsync<FoodcomSummary>('SELECT r.id,r.title,r.category FROM recipe_search JOIN recipes r ON r.id=recipe_search.rowid WHERE recipe_search MATCH ? AND recipe_search.rowid>? ORDER BY recipe_search.rowid LIMIT ?', terms.map((term) => `"${term}"*`).join(' AND '), after, size + 1)
      : await connection.getAllAsync<FoodcomSummary>('SELECT id,title,category FROM recipes WHERE id>? ORDER BY id LIMIT ?', after, size + 1);
    assertFoodcomNotAborted(signal);
    return { items: rows.slice(0, size), nextCursor: rows.length > size ? String(rows[size - 1].id) : null };
  },
  async getDetail(id, signal) {
    assertFoodcomNotAborted(signal);
    const connection = await open();
    const row = await connection.getFirstAsync<{ payload_gzip: Uint8Array }>('SELECT payload_gzip FROM recipes WHERE id=?', id);
    assertFoodcomNotAborted(signal);
    if (!row) return null;
    const recipe = decodeFoodcomPayload(row.payload_gzip);
    if (recipe.id !== id) throw new Error('FOODCOM_INVALID_RECIPE');
    return recipe;
  },
  async install(onProgress, signal) {
    if (installing) throw new Error('FOODCOM_BUSY');
    installing = true;
    const temporary = new File(DIRECTORY, 'foodcom-v2.installing.sqlite');
    try {
      if ((await this.getState()).installed) return;
      const manifest = await loadFoodcomManifest(signal);
      DIRECTORY.create({ idempotent: true, intermediates: true });
      // A terminated process may leave this rebuildable file behind.
      if (temporary.exists) temporary.delete();
      const compressed = new File(DIRECTORY, 'download.sqlite.gz');
      const resumable = await checkpoint(compressed, new File(DIRECTORY, 'download-resume.json'), `${FOODCOM_DOWNLOAD_BASE}/foodcom-v2.sqlite.gz`);
      const retainedBytes = compressed.exists && (compressed.size === manifest.download.bytes || resumable) ? compressed.size : 0;
      const needed = manifest.database.bytes + Math.max(0, manifest.download.bytes - retainedBytes) + 50_000_000;
      if (Paths.availableDiskSpace < needed) throw new Error('FOODCOM_STORAGE_SPACE');
      if (!compressed.exists || compressed.size !== manifest.download.bytes) await downloadFoodcomDatabase(onProgress, signal, manifest.download.bytes);
      assertFoodcomNotAborted(signal);
      onProgress({ phase: 'verifying', completed: 0, total: manifest.download.bytes });
      if (compressed.size !== manifest.download.bytes || compressed.md5 !== manifest.download.md5) {
        compressed.delete();
        const resumeFile = new File(DIRECTORY, 'download-resume.json');
        if (resumeFile.exists) resumeFile.delete();
        throw new Error('FOODCOM_CHECKSUM');
      }
      temporary.create({ overwrite: true });
      const input = compressed.open(FileMode.ReadOnly);
      const output = temporary.open(FileMode.WriteOnly);
      let processed = 0;
      try {
        const unzip = new Gunzip((bytes) => { output.writeBytes(bytes); });
        while (processed < manifest.download.bytes) {
          assertFoodcomNotAborted(signal);
          const block = input.readBytes(Math.min(262144, manifest.download.bytes - processed));
          if (!block.length) throw new Error('FOODCOM_CHECKSUM');
          processed += block.length;
          unzip.push(block, processed === manifest.download.bytes);
          onProgress({ phase: 'installing', completed: processed, total: manifest.download.bytes });
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      } finally { input.close(); output.close(); }
      assertFoodcomNotAborted(signal);
      onProgress({ phase: 'verifying', completed: manifest.download.bytes, total: manifest.download.bytes });
      if (temporary.size !== manifest.database.bytes || temporary.md5 !== manifest.database.md5) throw new Error('FOODCOM_CHECKSUM');
      const candidate = await openDatabaseAsync('foodcom-v2.installing.sqlite', { useNewConnection: true }, DIRECTORY.uri);
      try {
        await candidate.execAsync('PRAGMA query_only=ON;');
        const check = await candidate.getFirstAsync<{ quick_check: string }>('PRAGMA quick_check');
        const count = await candidate.getFirstAsync<{ count: number }>('SELECT count(*) AS count FROM recipes');
        const sample = await candidate.getFirstAsync<{ payload_gzip: Uint8Array }>('SELECT payload_gzip FROM recipes WHERE id=38');
        if (check?.quick_check !== 'ok' || count?.count !== FOODCOM_COUNT || !sample || decodeFoodcomPayload(sample.payload_gzip).id !== 38) throw new Error('FOODCOM_CHECKSUM');
      } finally { await candidate.closeAsync(); }
      assertFoodcomNotAborted(signal);
      await close();
      // Activate only after the entire source file and database passed validation.
      await temporary.move(new File(DIRECTORY, ACTIVE), { overwrite: true });
      compressed.delete();
      await open();
    } finally {
      installing = false;
      if (temporary.exists && temporary.uri.endsWith('foodcom-v2.installing.sqlite')) temporary.delete();
    }
  },
  async remove() {
    if (installing) throw new Error('FOODCOM_BUSY');
    await close();
    // This dedicated directory contains only the optional public reference catalogue.
    if (DIRECTORY.exists) DIRECTORY.delete();
  },
};
