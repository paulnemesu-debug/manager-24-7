/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { readDocumentBase64 } from '@/lib/document-bytes';

import { normalizeScannedInvoice, type ScannedInvoice } from '@/lib/invoice-import';
import { supabase } from '@/lib/supabase';
import { scanFunctionError } from '@/lib/scan-errors';

const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

function inferMediaType(uri: string, provided?: string | null) {
  if (provided && SUPPORTED.has(provided)) return provided;
  if (provided && !provided.startsWith('image/')) throw new Error('invoice_type_invalid');
  const lower = uri.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export async function scanInvoiceDocument(
  uri: string,
  providedMediaType?: string | null,
): Promise<ScannedInvoice> {
  if (!supabase) throw new Error('scan_unavailable');
  const mediaType = inferMediaType(uri, providedMediaType);
  let sourceUri = uri;
  let uploadType = mediaType;
  if (mediaType.startsWith('image/')) {
    const optimized = await manipulateAsync(
      uri,
      [{ resize: { width: 1800 } }],
      { compress: 0.78, format: SaveFormat.JPEG },
    );
    sourceUri = optimized.uri;
    uploadType = 'image/jpeg';
  }
  const data = await readDocumentBase64(sourceUri, uploadType === 'application/pdf' ? 18_000_000 : 8_000_000,
    uploadType === 'application/pdf' ? 'invoice_too_large' : 'scan_image_too_large');
  const { data: result, error } = await supabase.functions.invoke('scan-consumption-document', {
    body: { mode: 'invoice', document: { mediaType: uploadType, data } },
  });
  if (error) throw await scanFunctionError(error);
  const invoice = normalizeScannedInvoice(result);
  if (!invoice.rows.length) throw new Error('scan_empty');
  return invoice;
}
