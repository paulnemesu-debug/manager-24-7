/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { readDocumentBase64 } from '@/lib/document-bytes';

import { normalizeScannedConsumptionRows, type ParsedConsumptionRow } from '@/lib/consumption-import';
import { supabase } from '@/lib/supabase';
import { scanFunctionError } from '@/lib/scan-errors';

export async function scanConsumptionDocument(imageUri: string): Promise<ParsedConsumptionRow[]> {
  if (!supabase) throw new Error('scan_unavailable');
  const optimized = await manipulateAsync(
    imageUri,
    [{ resize: { width: 1600 } }],
    { compress: 0.72, format: SaveFormat.JPEG },
  );
  const data = await readDocumentBase64(optimized.uri, 8_000_000, 'scan_image_too_large');
  const { data: result, error } = await supabase.functions.invoke('scan-consumption-document', {
    body: { image: { mediaType: 'image/jpeg', data } },
  });
  if (error) throw await scanFunctionError(error);
  const rows = normalizeScannedConsumptionRows(result);
  if (!rows.length) throw new Error('scan_empty');
  return rows;
}
