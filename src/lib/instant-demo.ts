import AsyncStorage from '@react-native-async-storage/async-storage';
import { accountLocalModule } from '@/lib/account-snapshot';

/** Reset only the allowlisted demo workspace; never touch real accounts or auth storage. */
export async function resetInstantDemo() {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => accountLocalModule(key, 'demo'));
  if (keys.length) await AsyncStorage.multiRemove(keys);
}
