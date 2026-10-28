/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1800;
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function countKey(key: string) {
  return `${key}.__chunks`;
}

function chunkKey(key: string, index: number) {
  return `${key}.__${index}`;
}

async function removeStorageItem(key: string) {
  const rawCount = await SecureStore.getItemAsync(countKey(key), options);
  const count = Number(rawCount || 0);
  await Promise.all([
    SecureStore.deleteItemAsync(key, options),
    SecureStore.deleteItemAsync(countKey(key), options),
    ...Array.from({ length: count }, (_, index) => (
      SecureStore.deleteItemAsync(chunkKey(key, index), options)
    )),
  ]);
}

export const secureStorageAdapter = {
  async getItem(key: string) {
    const rawCount = await SecureStore.getItemAsync(countKey(key), options);
    if (!rawCount) return SecureStore.getItemAsync(key, options);

    const count = Number(rawCount);
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index), options)),
    );
    if (chunks.some((chunk) => chunk === null)) return null;
    return chunks.join('');
  },

  async setItem(key: string, value: string) {
    await removeStorageItem(key);
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value, options);
      return;
    }

    const chunks = value.match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'gs')) ?? [];
    await Promise.all(chunks.map((chunk, index) => (
      SecureStore.setItemAsync(chunkKey(key, index), chunk, options)
    )));
    await SecureStore.setItemAsync(countKey(key), String(chunks.length), options);
  },

  removeItem: removeStorageItem,
};
