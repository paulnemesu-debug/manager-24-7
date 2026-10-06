import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Locale } from '@/i18n/translations';
import { accountLocalModule } from '@/lib/account-snapshot';
import { buildInstantDemoData } from '@/lib/instant-demo-data';

export { buildInstantDemoData } from '@/lib/instant-demo-data';

/** Fixed keys deliberately cannot be redirected to an authenticated account. */
export async function seedInstantDemo(locale: Locale, now = new Date()) {
  const data = buildInstantDemoData(locale, now);
  const entries: [string, string][] = [
    ['manager247.hr.v1.demo', JSON.stringify(data.hr)],
    ['manager247.hr-lifecycle.v1.demo', JSON.stringify(data.lifecycle)],
    ['manager247.operational-documents.v1.demo', JSON.stringify(data.documents)],
    ['manager247.pnl_reports.v1.demo', JSON.stringify(data.pnl)],
    ['manager247.operations-control.v1.demo', JSON.stringify(data.operations)],
  ];
  try {
    await AsyncStorage.multiSet(entries);
  } catch (error) {
    // A failed batch may have partially written. Demo is not entered after a rejection.
    await AsyncStorage.multiRemove(entries.map(([key]) => key)).catch(() => undefined);
    throw error;
  }
}

/** Reset only the allowlisted demo workspace; never touch real accounts or auth storage. */
export async function resetInstantDemo() {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => accountLocalModule(key, 'demo'));
  if (keys.length) await AsyncStorage.multiRemove(keys);
}
