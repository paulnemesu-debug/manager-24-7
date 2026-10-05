/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import {
  buildInvoiceImportPreview,
  normalizeScannedInvoice,
  invoiceCurrencySupported,
  invoiceMappingKey,
} from '@/lib/invoice-import';
import type { CatalogIngredient } from '@/types/recipe';

const catalog: CatalogIngredient[] = [{
  id: 'butter',
  name: 'Unt 82% grăsime',
  purchasePrice: 42,
  priceUnit: 'kg',
  packageQuantity: null,
  packagePrice: null,
  defaultLossPercent: 0,
  supplier: 'METRO',
  notes: null,
  allergens: ['milk'],
  active: true,
  updatedAt: '2026-09-16T00:00:00.000Z',
}];

describe('invoice import', () => {
  it('normalizes a package price to the base unit and drops unreadable rows', () => {
    const result = normalizeScannedInvoice({
      supplier: 'METRO Pallady',
      invoice_number: 'F-101',
      invoice_date: '2026-09-16',
      rows: [
        { name: 'Unt 82%', unit: 'kg', packageQuantity: 0.5, packagePrice: 24, confidence: 'high' },
        { name: 'Linie fără preț', unit: 'kg' },
      ],
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ name: 'Unt 82%', unit: 'kg', unitPrice: 48, confidence: 0.95 });
    expect(result.invoiceNumber).toBe('F-101');
  });

  it('uses a confirmed supplier mapping before fuzzy matching', () => {
    const invoice = normalizeScannedInvoice({
      supplier: 'METRO Pallady',
      rows: [{ name: 'UNT BLOC PROFESIONAL', unit: 'kg', unitPrice: 47.5, confidence: 0.92 }],
    });
    const preview = buildInvoiceImportPreview(invoice, catalog, [{
      supplier: 'METRO Pallady',
      sourceName: 'UNT BLOC PROFESIONAL',
      normalizedName: 'unt bloc profesional',
      catalogId: 'butter',
    }]);

    expect(preview.matches).toHaveLength(1);
    expect(preview.matches[0]).toMatchObject({ learned: true, currentPrice: 42, newPrice: 47.5 });
  });

  it('requires review when the invoice unit conflicts with the catalog unit', () => {
    const invoice = normalizeScannedInvoice({
      supplier: 'METRO',
      rows: [{ name: 'Unt 82% grăsime', unit: 'buc', unitPrice: 24, confidence: 0.9 }],
    });
    const preview = buildInvoiceImportPreview(invoice, catalog);

    expect(preview.matches).toHaveLength(0);
    expect(preview.unresolved).toHaveLength(1);
  });

  it('preserves zero VAT, exposes rejected rows and rejects truncated invoices', () => {
    const parsed = normalizeScannedInvoice({ rows: [{ name: 'Unt', unit: 'kg', price: 10, vat: 0 }, { name: 'Unreadable' }] });
    expect(parsed.rows[0].vatPercent).toBe(0);
    expect(parsed.rejectedRows).toEqual([{ rowNumber: 2, name: 'Unreadable' }]);
    expect(() => normalizeScannedInvoice({ rows: Array(251).fill({}) })).toThrow('invoice_too_large');
  });

  it('learns across METRO and Selgros legal names without mixing unrelated suppliers', () => {
    expect(invoiceMappingKey('METRO Cash & Carry România SRL', 'UNT 82%')).toBe(invoiceMappingKey('METRO Pallady', 'unt 82%'));
    expect(invoiceMappingKey('Selgros Cash and Carry SRL', 'Unt')).toBe(invoiceMappingKey('SELGROS Brașov', 'Unt'));
    expect(invoiceMappingKey('Metropolis SRL', 'Unt')).not.toBe(invoiceMappingKey('METRO', 'Unt'));
    expect(invoiceMappingKey('Distribuitor A', 'Unt')).not.toBe(invoiceMappingKey('Distribuitor B', 'Unt'));
  });

  it('does not update archived products or silently convert another currency', () => {
    const invoice = normalizeScannedInvoice({ rows: [{ name: 'Unt 82% grăsime', unit: 'kg', price: 20 }] });
    expect(buildInvoiceImportPreview(invoice, [{ ...catalog[0], active: false }]).matches).toHaveLength(0);
    expect(invoiceCurrencySupported('EUR')).toBe(false);
    expect(invoiceCurrencySupported('ron')).toBe(true);
  });

  it('uses the operator correction before a suggestion and allows explicit new products', () => {
    const invoice = normalizeScannedInvoice({ rows: [{ name: 'Unt 82% grăsime', unit: 'kg', price: 20 }] });
    expect(buildInvoiceImportPreview(invoice, catalog, [], { 1: null }).newItems).toHaveLength(1);
    expect(buildInvoiceImportPreview(invoice, catalog, [], { 1: 'butter' }).matches[0].matchKind).toBe('manual');
  });
});
