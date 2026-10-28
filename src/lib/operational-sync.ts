import { translate, type Locale, type TranslationKey } from '@/i18n/translations';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { withStorageLock } from '@/lib/storage-lock';
import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';

export type OperationalSync = {
  syncState?: 'local' | 'pending' | 'synced' | 'conflict';
  serverVersion?: number;
  remoteConflict?: { data: Record<string, unknown>; version: number; updated_at: string };
};
type RemoteRecord = { id: string; data: Record<string, unknown>; version: number; updated_at: string };
type RecordBase = OperationalSync & { updatedAt: string };
export const operationalCloudEnabled = (userId: string) => userId !== 'demo' && !isDemoMode && isSupabaseConfigured && Boolean(supabase);

/** Durable account queue; server revisions detect concurrent edits independently of device clocks. */
export function createOperationalStore<T extends RecordBase>(options: {
  key: (userId: string) => string;
  table: 'operational_documents' | 'hr_lifecycle';
  id: (item: T) => string;
  normalize: (value: unknown) => T | null;
}) {
  const read = async (userId: string): Promise<T[]> => {
    const raw = await AsyncStorage.getItem(options.key(userId));
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) throw new OperationalError('operational.sync.invalidLocal');
    const items = value.map(options.normalize);
    if (items.some((item) => item === null)) throw new OperationalError('operational.sync.invalidRecord');
    return items as T[];
  };
  const write = async (userId: string, items: T[]) => {
    await AsyncStorage.setItem(options.key(userId), JSON.stringify(items));
    return items;
  };
  const fromRemote = (row: RemoteRecord): T => {
    const item = options.normalize({ ...row.data, updatedAt: row.updated_at });
    if (!item || options.id(item) !== row.id) throw new OperationalError('operational.sync.invalidResponse');
    return { ...item, serverVersion: Number(row.version), syncState: 'synced', remoteConflict: undefined };
  };
  const payload = (item: T) => {
    const { syncState: _state, serverVersion: _version, remoteConflict: _conflict, ...data } = item;
    return data;
  };
  const sync = async (userId: string, local: T[]): Promise<T[]> => {
    if (!operationalCloudEnabled(userId) || !supabase) return local;
    let items = [...local];
    try {
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        if (item.syncState === 'synced' || item.syncState === 'conflict') continue;
        const { data, error } = await supabase.rpc('sync_operational_record', {
          p_kind: options.table, p_id: options.id(item), p_data: payload(item), p_expected_version: item.serverVersion ?? 0,
        });
        if (error || !data?.record) continue;
        const remote = data.record as RemoteRecord;
        items[index] = data.applied ? fromRemote(remote) : { ...item, syncState: 'conflict', remoteConflict: remote };
        await write(userId, items);
      }
      const remote: T[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await supabase.from(options.table).select('id,data,version,updated_at')
          .eq('user_id', userId).order('id').range(offset, offset + 499);
        if (result.error) return items;
        remote.push(...(result.data as RemoteRecord[]).map(fromRemote));
        if (result.data.length < 500) break;
      }
      const merged = new Map(remote.map((item) => [options.id(item), item]));
      for (const item of items) if (item.syncState !== 'synced') merged.set(options.id(item), item);
      items = [...merged.values()];
      return write(userId, items);
    } catch {
      // Local intent survives offline use and a server where the migration is not deployed yet.
      return items;
    }
  };
  const locked = <R>(userId: string, work: () => Promise<R>) => withStorageLock(options.key(userId), work);
  return {
    cached: (userId: string) => locked(userId, () => read(userId)),
    load: (userId: string) => locked(userId, async () => sync(userId, await read(userId))),
    save: (userId: string, draft: T) => locked(userId, async () => {
      const items = await read(userId);
      const normalizedDraft = options.normalize(draft);
      if (!normalizedDraft) throw new OperationalError('operational.sync.invalid');
      const old = items.find((item) => options.id(item) === options.id(draft));
      if (old?.syncState === 'conflict') throw new OperationalError('operational.sync.resolveFirst');
      const item: T = { ...normalizedDraft, updatedAt: new Date().toISOString(), serverVersion: draft.serverVersion ?? old?.serverVersion ?? 0,
        syncState: operationalCloudEnabled(userId) ? 'pending' : 'local', remoteConflict: undefined };
      const saved = await write(userId, [item, ...items.filter((other) => options.id(other) !== options.id(item))]);
      const next = await sync(userId, saved);
      return next.find((other) => options.id(other) === options.id(item)) ?? item;
    }),
    resolve: (userId: string, id: string, choice: 'local' | 'remote') => locked(userId, async () => {
      const items = await read(userId);
      const item = items.find((entry) => options.id(entry) === id);
      if (!item?.remoteConflict) return items;
      const remote = { ...item.remoteConflict, id };
      const replacement: T = choice === 'remote' ? fromRemote(remote) : {
        ...item, serverVersion: remote.version, syncState: 'pending', remoteConflict: undefined, updatedAt: new Date().toISOString(),
      };
      return sync(userId, await write(userId, items.map((entry) => options.id(entry) === id ? replacement : entry)));
    }),
  };
}

export function operationalSyncLabel(item: OperationalSync, locale: Locale = 'ro') {
  const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(locale, key, params);

  if (item.syncState === 'conflict') return t('operational.sync.conflict');
  if (item.syncState === 'synced') return t('operational.sync.synced');
  if (item.syncState === 'pending') return t('operational.sync.pending');
  return t('operational.sync.local');
}

export class OperationalError extends Error {
  constructor(readonly translationKey: TranslationKey) { super(translate('ro', translationKey)); }
}
export function operationalErrorMessage(error: unknown, locale: Locale, fallbackKey: TranslationKey = 'operational.common.tryAgain') {
  return error instanceof OperationalError ? translate(locale, error.translationKey) : error instanceof Error ? error.message : translate(locale, fallbackKey);
}
