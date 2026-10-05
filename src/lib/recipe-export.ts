/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { downloadWebFile } from '@/lib/web-download';

import {
  buildRecipeHtml,
  buildRecipeWorkbook,
  type ExportContext,
  safeFileName,
} from '@/lib/recipe-sheet';
import { buildCookbookHtml, buildCookbookWorkbook } from '@/lib/cookbook-sheet';
import { buildAllergenMenuHtml } from '@/lib/allergen-menu';
import { workbookToBlob, workbookToBytes } from '@/lib/excel-workbook';
import type { Recipe } from '@/types/recipe';

export type { ExportContext } from '@/lib/recipe-sheet';
export { buildRecipeHtml, buildRecipeWorkbook, safeFileName } from '@/lib/recipe-sheet';

export function recipePdfFileName(title: string) {
  return `${safeFileName(title)}-food-cost.pdf`;
}

async function namedPrintedPdf(sourceUri: string, fileName: string) {
  const source = new File(sourceUri);
  const target = new File(Paths.cache, fileName);
  if (target.exists) target.delete();
  await source.copy(target);
  return target;
}

export async function exportRecipePdf(recipe: Recipe, context: ExportContext): Promise<void> {
  const html = buildRecipeHtml(recipe, context);

  if (Platform.OS === 'web') {
    // Pe web tipărirea deschide dialogul browserului, de unde se salvează ca PDF.
    await Print.printAsync({ html });
    return;
  }

  const { uri } = await Print.printToFileAsync({ html });
  const file = await namedPrintedPdf(uri, recipePdfFileName(recipe.title));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Partajarea fișierelor nu este disponibilă pe acest dispozitiv.');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: recipe.title,
    UTI: 'com.adobe.pdf',
  });
}

export async function exportRecipeExcel(recipe: Recipe, context: ExportContext): Promise<void> {
  const workbook = buildRecipeWorkbook(recipe, context);
  const fileName = `${safeFileName(recipe.title)}-food-cost.xlsx`;
  const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  if (Platform.OS === 'web') {
    const blob = await workbookToBlob(workbook);
    downloadWebFile(blob, fileName, mimeType);
    return;
  }

  const bytes = await workbookToBytes(workbook);
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);

  if (!(await Sharing.isAvailableAsync())) throw new Error('Partajarea fișierelor nu este disponibilă pe acest dispozitiv.');
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: recipe.title });
}

export async function exportCookbookPdf(recipes: readonly Recipe[], context: ExportContext): Promise<void> {
  const html = buildCookbookHtml(recipes, context);
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  const file = await namedPrintedPdf(uri, 'manager24-7-retetar.pdf');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Partajarea fișierelor nu este disponibilă pe acest dispozitiv.');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: context.t('cookbook.title'),
    UTI: 'com.adobe.pdf',
  });
}

export async function exportAllergenMenuPdf(recipes: readonly Recipe[], context: ExportContext): Promise<void> {
  const html = buildAllergenMenuHtml(recipes, context.locale, context.userEmail);
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  const file = await namedPrintedPdf(uri, 'registru-alergeni-1169-2011.pdf');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Partajarea fișierelor nu este disponibilă pe acest dispozitiv.');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: context.locale === 'ro' ? 'Registru alergeni 1169/2011' : 'Allergen register 1169/2011',
    UTI: 'com.adobe.pdf',
  });
}

export async function exportCookbookExcel(recipes: readonly Recipe[], context: ExportContext): Promise<void> {
  const workbook = buildCookbookWorkbook(recipes, context);
  const fileName = 'manager24-7-retetar.xlsx';
  const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (Platform.OS === 'web') {
    const blob = await workbookToBlob(workbook);
    downloadWebFile(blob, fileName, mimeType);
    return;
  }
  const bytes = await workbookToBytes(workbook);
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Partajarea fișierelor nu este disponibilă pe acest dispozitiv.');
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: context.t('cookbook.title') });
}
