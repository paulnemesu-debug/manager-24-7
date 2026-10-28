/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { downloadWebFile } from '@/lib/web-download';

import { buildAccountSnapshot } from '@/lib/account-snapshot';
import { OperationalError } from '@/lib/operational-sync';
import type { CatalogIngredient, Recipe } from '@/types/recipe';

export async function exportAccountData(userId: string, recipes: Recipe[], catalog: CatalogIngredient[]) {
  const snapshot = await buildAccountSnapshot(userId, recipes, catalog);
  const fileName = `manager24-7-export-${new Date().toISOString().slice(0, 10)}.json`;
  if (Platform.OS === 'web') {
    downloadWebFile(JSON.stringify(snapshot, null, 2), fileName, 'application/json');
    return { uri: fileName, cloudComplete: snapshot.manifest.cloudComplete };
  }
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true, intermediates: true });
  file.write(JSON.stringify(snapshot, null, 2));
  if (!(await Sharing.isAvailableAsync())) throw new OperationalError('operational.shared.sharingUnavailable');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Export Manager 24/7' });
  return { uri: file.uri, cloudComplete: snapshot.manifest.cloudComplete };
}
