/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { printHtmlInBrowser } from '@/lib/web-print';

import type { HaccpFormDefinition } from '@/constants/haccp-forms';
import type { Locale } from '@/i18n/translations';
import { buildHaccpControlPackHtml, buildHaccpDocumentHtml } from '@/lib/haccp-sheet';
import type { HaccpDocument } from '@/types/haccp';

const safePdfName = (value: string) => `${value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'formular-haccp'}.pdf`;

function namedPdf(uri: string, name: string) {
  const target = new File(Paths.cache, safePdfName(name));
  if (target.exists) target.delete();
  new File(uri).copy(target);
  return target.uri;
}

async function getLogoDataUri() {
  const asset = Asset.fromModule(require('../../assets/brand/manager247-logo-transparent.png'));
  if (Platform.OS === 'web') return asset.uri;
  await asset.downloadAsync();
  if (!asset.localUri) return asset.uri;
  const base64 = await new File(asset.localUri).base64();
  return `data:image/png;base64,${base64}`;
}

export async function exportHaccpDocumentPdf(document: HaccpDocument, form: HaccpFormDefinition, locale: Locale) {
  const logo = await getLogoDataUri().catch(() => null);
  const html = buildHaccpDocumentHtml(document, form, locale, logo);
  if (Platform.OS === 'web') {
    await printHtmlInBrowser(html);
    return null;
  }
  const generated = await Print.printToFileAsync({ html });
  const uri = namedPdf(generated.uri, `${form.code}-${form.shortTitle.ro}`);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Partajarea fișierelor nu este disponibilă pe acest dispozitiv.');
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: `${form.code} - Manager 24/7`,
    UTI: 'com.adobe.pdf',
  });
  return uri;
}

export async function exportHaccpControlPackPdf(
  documents: readonly HaccpDocument[],
  locale: Locale,
  periodLabel: string,
) {
  const logo = await getLogoDataUri().catch(() => null);
  const html = buildHaccpControlPackHtml(documents, locale, periodLabel, logo);
  if (Platform.OS === 'web') {
    await printHtmlInBrowser(html);
    return null;
  }
  const generated = await Print.printToFileAsync({ html });
  const uri = namedPdf(generated.uri, `Pachet-HACCP-${periodLabel}`);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Partajarea fișierelor nu este disponibilă pe acest dispozitiv.');
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: locale === 'ro' ? `Pachet HACCP ${periodLabel}` : `HACCP pack ${periodLabel}`,
    UTI: 'com.adobe.pdf',
  });
  return uri;
}
