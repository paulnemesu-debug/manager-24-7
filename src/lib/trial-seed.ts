import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Locale } from '@/i18n/translations';
import { buildInstantDemoData } from '@/lib/instant-demo-data';
import { withStorageLock } from '@/lib/storage-lock';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 3) | 8).toString(16);
  });
}

/** Held with the same module locks as ordinary saves; only empty caller-owned caches are seeded. */
export async function seedIndividualTrial(userId: string, locale: Locale, isCurrent: () => boolean, now = new Date()): Promise<void> {
  if (!userId || userId === 'demo' || !isCurrent()) return;
  const prefixes = ['manager247.hr.v1', 'manager247.hr-lifecycle.v1', 'manager247.operational-documents.v1', 'manager247.pnl_reports.v1', 'manager247.operations-control.v1'];
  const keys = prefixes.map((prefix) => `${prefix}.${userId}`);
  const marker = `manager247.trial-seed.v1.${userId}`;
  const locks = [`trial-seed:${userId}`, `hr:${userId}`, keys[1], keys[2], keys[3], `operations:${userId}`];
  const lock = (index: number): Promise<void> => index < locks.length
    ? withStorageLock(locks[index], () => lock(index + 1))
    : seed();
  const seed = async () => {
    const existing = await AsyncStorage.multiGet([...keys, marker]);
    if (!isCurrent() || existing.some(([, value]) => value !== null)) return;
    const data = buildInstantDemoData(locale, now);
    // Real accounts synchronize these examples through their usual repositories.
    // Unique UUIDs prevent shared demo IDs colliding across tenants on the server.
    const identifiers = new Map<string, string>();
    const remap = (value: unknown): unknown => {
      if (typeof value === 'string' && value.startsWith('demo-')) {
        if (!identifiers.has(value)) identifiers.set(value, uuid());
        return identifiers.get(value);
      }
      if (Array.isArray(value)) return value.map(remap);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remap(item)]));
      return value;
    };
    const values = [data.hr, data.lifecycle, data.documents, data.pnl, data.operations].map((value) => JSON.stringify(remap(value)));
    if (!isCurrent()) return;
    try {
      await AsyncStorage.multiSet([...keys.map((key, index): [string, string] => [key, values[index]]), [marker, '{"complete":true}']]);
    } catch (error) {
      // A rejected native batch can be partial. No existing keys were touched,
      // and the module locks prevent a save being removed during rollback.
      await AsyncStorage.multiRemove([...keys, marker]);
      throw error;
    }
  };
  await lock(0);
}
