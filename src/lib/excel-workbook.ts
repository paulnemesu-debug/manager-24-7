/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import writeXlsxFile, {
  type Cell,
  type Image,
  type Sheet,
} from 'write-excel-file/universal';
import writeXlsxBytes from 'write-excel-file/manager247-native';

export type ExcelColumn = {
  width?: number;
};

export type ExcelImage = Omit<Image, 'content'> & { content: Blob | Uint8Array };

export type ExcelSheet = {
  rows: Cell[][];
  columns?: ExcelColumn[];
  images?: ExcelImage[];
  orientation?: 'landscape';
  showGridLines?: boolean;
  stickyRowsCount?: number;
  stickyColumnsCount?: number;
  zoomScale?: number;
};

/**
 * Format intern minimal pentru exporturi. Păstrează datele ușor de testat și
 * izolează aplicația de implementarea bibliotecii care scrie fișierul XLSX.
 */
export type ExcelWorkbook = {
  SheetNames: string[];
  Sheets: Record<string, ExcelSheet>;
};

export function createExcelWorkbook(
  sheets: ({ name: string } & ExcelSheet)[],
): ExcelWorkbook {
  return {
    SheetNames: sheets.map((sheet) => sheet.name),
    Sheets: Object.fromEntries(sheets.map(({ name, ...sheet }) => [name, sheet])),
  };
}

export async function workbookToBlob(workbook: ExcelWorkbook): Promise<Blob> {
  const sheets: Sheet<Blob>[] = workbook.SheetNames.map((name) => {
    const { rows, images, ...options } = workbook.Sheets[name];
    return {
      sheet: name, data: rows, ...options,
      images: images?.map(image => ({
        ...image,
        content: image.content instanceof Uint8Array
          ? new Blob([new Uint8Array(image.content)], { type: image.contentType })
          : image.content,
      })),
    };
  });

  return writeXlsxFile(sheets).toBlob();
}

/** Native exports must never create a binary Blob or start Web Workers. */
export async function workbookToBytes(workbook: ExcelWorkbook): Promise<Uint8Array> {
  return writeXlsxBytes(workbook.SheetNames.map(name => {
    const { rows, ...options } = workbook.Sheets[name];
    return { sheet: name, data: rows, ...options };
  }));
}
