/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { normalizeText, parsePrice, parseUnit, similarity } from '@/lib/price-import';
import type { CatalogIngredient, PriceUnit } from '@/types/recipe';

export type ScannedInvoiceRow = {
  name: string;
  unitPrice: number;
  unit: PriceUnit;
  packageQuantity: number | null;
  packagePrice: number | null;
  billedQuantity: number | null;
  lineNetTotal: number | null;
  vatPercent: number | null;
  confidence: number;
  rowNumber: number;
};

export type ScannedInvoice = {
  supplier: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  currency: string | null;
  rows: ScannedInvoiceRow[];
  rejectedRows?: { rowNumber: number; name: string }[];
};

export type InvoiceProductMapping = {
  supplier: string;
  sourceName: string;
  normalizedName: string;
  catalogId: string;
};

export type InvoiceMatch = {
  row: ScannedInvoiceRow;
  catalog: CatalogIngredient;
  currentPrice: number;
  newPrice: number;
  deltaPercent: number;
  learned: boolean;
  matchKind: 'learned' | 'exact' | 'suggested' | 'manual';
};

export type InvoiceImportPreview = {
  matches: InvoiceMatch[];
  newItems: ScannedInvoiceRow[];
  unresolved: ScannedInvoiceRow[];
  totalRows: number;
};

function optionalPositive(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : parsePrice(value);
  return parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nullableText(value: unknown, max = 180): string | null {
  const text = String(value ?? '').trim().slice(0, max);
  return text || null;
}

function confidence(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.min(1, Math.max(0, value));
  const text = normalizeText(String(value ?? ''));
  if (text === 'high' || text === 'ridicata') return 0.95;
  if (text === 'medium' || text === 'medie') return 0.72;
  if (text === 'low' || text === 'scazuta') return 0.4;
  return 0.6;
}

export function normalizeScannedInvoice(value: unknown): ScannedInvoice {
  const object = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const sourceRows = Array.isArray(object.rows) ? object.rows : [];
  if (sourceRows.length > 250) throw new Error('invoice_too_large');
  const rejectedRows: NonNullable<ScannedInvoice['rejectedRows']> = [];
  const rows = sourceRows.slice(0, 250).flatMap((entry, index): ScannedInvoiceRow[] => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const name = nullableText(row.name ?? row.description ?? row.product);
    const unit = parseUnit(String(row.unit ?? row.baseUnit ?? row.base_unit ?? ''));
    const packageQuantity = optionalPositive(row.packageQuantity ?? row.package_quantity);
    const packagePrice = optionalPositive(row.packagePrice ?? row.package_price);
    const explicitUnitPrice = optionalPositive(row.unitPrice ?? row.unit_price ?? row.price);
    const unitPrice = explicitUnitPrice ?? (
      packageQuantity && packagePrice ? packagePrice / packageQuantity : null
    );
    if (!name || !unit || unitPrice === null) {
      rejectedRows.push({ rowNumber: index + 1, name: name ?? '—' });
      return [];
    }
    const vat = typeof (row.vatPercent ?? row.vat_percent ?? row.vat) === 'number'
      ? Number(row.vatPercent ?? row.vat_percent ?? row.vat) : parsePrice(row.vatPercent ?? row.vat_percent ?? row.vat);
    return [{
      name,
      unitPrice: Math.round(unitPrice * 10000) / 10000,
      unit,
      packageQuantity,
      packagePrice,
      billedQuantity: optionalPositive(row.billedQuantity ?? row.billed_quantity ?? row.quantity),
      lineNetTotal: optionalPositive(row.lineNetTotal ?? row.line_net_total ?? row.lineTotal),
      vatPercent: vat !== null && Number.isFinite(vat) && vat >= 0 && vat <= 100 ? vat : null,
      confidence: confidence(row.confidence),
      rowNumber: index + 1,
    }];
  });
  return {
    supplier: nullableText(object.supplier, 120),
    invoiceNumber: nullableText(object.invoiceNumber ?? object.invoice_number, 80),
    invoiceDate: nullableText(object.invoiceDate ?? object.invoice_date, 10),
    currency: nullableText(object.currency, 8),
    rows,
    rejectedRows,
  };
}

export function normalizeInvoiceSupplier(supplier: string | null): string {
  const name = normalizeText(supplier ?? '');
  if (/^metro(?:\s|$)/.test(name)) return 'metro';
  if (/^selgros(?:\s|$)/.test(name)) return 'selgros';
  return name;
}

export function invoiceCurrencySupported(currency: string | null): boolean {
  return !currency || ['RON', 'LEI', 'LEU'].includes(currency.trim().toUpperCase());
}

export function invoiceMappingKey(supplier: string | null, productName: string): string {
  return `${normalizeInvoiceSupplier(supplier)}|${normalizeText(productName)}`;
}

export function buildInvoiceImportPreview(
  invoice: ScannedInvoice,
  catalog: readonly CatalogIngredient[],
  mappings: readonly InvoiceProductMapping[] = [],
  manualTargets: Readonly<Record<number, string | null>> = {},
): InvoiceImportPreview {
  const activeCatalog = catalog.filter((item) => item.active);
  const mappingByKey = new Map(mappings.map((mapping) => [
    invoiceMappingKey(mapping.supplier, mapping.sourceName), mapping.catalogId,
  ]));
  const catalogById = new Map(activeCatalog.map((item) => [item.id, item]));
  const matches: InvoiceMatch[] = [];
  const newItems: ScannedInvoiceRow[] = [];
  const unresolved: ScannedInvoiceRow[] = [];

  for (const row of invoice.rows) {
    const learnedId = mappingByKey.get(invoiceMappingKey(invoice.supplier, row.name));
    const exact = activeCatalog.find((item) => normalizeText(item.name) === normalizeText(row.name));
    const best = [...activeCatalog.filter((item) => item.priceUnit === row.unit)]
      .map((item) => ({ item, score: Math.max(similarity(item.name, row.name), similarity(row.name, item.name)) }))
      .sort((left, right) => right.score - left.score)[0];
    const manual = Object.hasOwn(manualTargets, row.rowNumber);
    const matched = manual ? (manualTargets[row.rowNumber] ? catalogById.get(manualTargets[row.rowNumber]!) : null) : (learnedId ? catalogById.get(learnedId) : null)
      ?? (exact ?? (best && best.score >= 0.64 ? best.item : null));

    if (matched && matched.priceUnit === row.unit) {
      matches.push({
        row,
        catalog: matched,
        currentPrice: matched.purchasePrice,
        newPrice: row.unitPrice,
        deltaPercent: matched.purchasePrice > 0
          ? (row.unitPrice - matched.purchasePrice) / matched.purchasePrice * 100
          : 0,
        learned: Boolean(learnedId && matched.id === learnedId),
        matchKind: manual ? 'manual' : learnedId === matched.id ? 'learned' : exact?.id === matched.id ? 'exact' : 'suggested',
      });
    } else if (!matched) {
      newItems.push(row);
    } else {
      unresolved.push(row);
    }
  }
  return { matches, newItems, unresolved, totalRows: invoice.rows.length };
}
