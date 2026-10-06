import { translate, type Locale, type TranslationKey } from '@/i18n/translations';
/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { PriceUnit } from '@/types/recipe';
import type { ScannedInvoice } from '@/lib/invoice-import';

export type EFacturaLine = {
  id: string;
  name: string;
  quantity: number | null;
  unitCode: string | null;
  unit: PriceUnit | null;
  unitPrice: number | null;
  netAmount: number | null;
  vatPercent: number | null;
};

export type EFacturaDocument = {
  documentType: 'invoice' | 'credit_note';
  invoiceNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string | null;
  supplierName: string | null;
  supplierTaxId: string | null;
  customerName: string | null;
  customerTaxId: string | null;
  payableAmount: number | null;
  lines: EFacturaLine[];
  profileId: string | null;
  customizationId: string | null;
  errors: string[];
  warnings: string[];
};

const decodeXml = (value: string) => value
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&quot;', '"')
  .replaceAll('&apos;', "'")
  .replaceAll('&amp;', '&')
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));

function tagBlock(source: string, name: string) {
  const match = new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[A-Za-z_][\\w.-]*):)?${name}>`, 'i').exec(source);
  return match?.[1] ?? null;
}

function tagBlocks(source: string, name: string) {
  const pattern = new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[A-Za-z_][\\w.-]*):)?${name}>`, 'gi');
  return [...source.matchAll(pattern)].map((match) => match[0]);
}

function tagText(source: string | null, name: string) {
  if (!source) return null;
  const value = tagBlock(source, name);
  if (value === null) return null;
  const text = decodeXml(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  return text || null;
}

function decimal(value: string | null) {
  if (!value) return null;
  const parsed = Number(value.replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function elementAttribute(source: string, name: string, attribute: string) {
  const match = new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${name}\\b([^>]*)>`, 'i').exec(source);
  if (!match) return null;
  return new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, 'i').exec(match[1])?.[1] ?? null;
}

function party(source: string, blockName: string) {
  const block = tagBlock(source, blockName);
  if (!block) return { name: null, taxId: null };
  const partyBlock = tagBlock(block, 'Party') ?? block;
  const legal = tagBlock(partyBlock, 'PartyLegalEntity');
  const tax = tagBlock(partyBlock, 'PartyTaxScheme');
  return {
    name: tagText(legal, 'RegistrationName') ?? tagText(partyBlock, 'Name'),
    taxId: tagText(tax, 'CompanyID') ?? tagText(legal, 'CompanyID'),
  };
}

export function unitCodeToPriceUnit(code: string | null): PriceUnit | null {
  const normalized = code?.trim().toUpperCase();
  if (normalized === 'KGM' || normalized === 'KG') return 'kg';
  if (normalized === 'LTR' || normalized === 'L') return 'l';
  if (['C62', 'H87', 'PCE', 'EA', 'BUC'].includes(normalized ?? '')) return 'buc';
  return null;
}

export function parseEfacturaXml(xml: string, locale: Locale = 'ro'): EFacturaDocument {
  const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(locale, key, params);
  if (xml.length > 10_000_000) throw new Error('efactura_too_large');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('efactura_unsafe_xml');
  const root = /<(?:[A-Za-z_][\w.-]*:)?(Invoice|CreditNote)\b/i.exec(xml)?.[1]?.toLowerCase();
  if (!root) throw new Error('efactura_invalid_root');
  const documentType = root === 'creditnote' ? 'credit_note' : 'invoice';
  const supplier = party(xml, 'AccountingSupplierParty');
  const customer = party(xml, 'AccountingCustomerParty');
  const lineName = documentType === 'credit_note' ? 'CreditNoteLine' : 'InvoiceLine';
  const quantityName = documentType === 'credit_note' ? 'CreditedQuantity' : 'InvoicedQuantity';
  const lines = tagBlocks(xml, lineName).slice(0, 2000).map((block, index): EFacturaLine => {
    const quantity = decimal(tagText(block, quantityName));
    const unitCode = elementAttribute(block, quantityName, 'unitCode');
    const item = tagBlock(block, 'Item');
    const price = tagBlock(block, 'Price');
    const taxCategory = tagBlock(block, 'ClassifiedTaxCategory') ?? tagBlock(block, 'TaxCategory');
    return {
      id: tagText(block, 'ID') ?? String(index + 1),
      name: tagText(item, 'Name') ?? tagText(item, 'Description') ?? t('operational.efactura.line', { number: index + 1 }),
      quantity,
      unitCode,
      unit: unitCodeToPriceUnit(unitCode),
      unitPrice: decimal(tagText(price, 'PriceAmount')),
      netAmount: decimal(tagText(block, 'LineExtensionAmount')),
      vatPercent: decimal(tagText(taxCategory, 'Percent')),
    };
  });
  const monetary = tagBlock(xml, 'LegalMonetaryTotal');
  const document: EFacturaDocument = {
    documentType,
    invoiceNumber: tagText(xml, 'ID'),
    issueDate: tagText(xml, 'IssueDate'),
    dueDate: tagText(xml, 'DueDate'),
    currency: tagText(xml, 'DocumentCurrencyCode'),
    supplierName: supplier.name,
    supplierTaxId: supplier.taxId,
    customerName: customer.name,
    customerTaxId: customer.taxId,
    payableAmount: decimal(tagText(monetary, 'PayableAmount')),
    lines,
    profileId: tagText(xml, 'ProfileID'),
    customizationId: tagText(xml, 'CustomizationID'),
    errors: [],
    warnings: [],
  };
  if (!document.invoiceNumber) document.errors.push(t('operational.efactura.noNumber'));
  if (!document.issueDate || !/^\d{4}-\d{2}-\d{2}$/.test(document.issueDate)) document.errors.push(t('operational.efactura.noDate'));
  if (!document.supplierName || !document.supplierTaxId) document.errors.push(t('operational.efactura.noSupplier'));
  if (!document.customerName || !document.customerTaxId) document.errors.push(t('operational.efactura.noCustomer'));
  if (!document.currency) document.errors.push(t('operational.efactura.noCurrency'));
  if (!document.lines.length) document.errors.push(t('operational.efactura.noLines'));
  if (document.payableAmount === null) document.errors.push(t('operational.efactura.noTotal'));
  if (!document.customizationId) document.warnings.push(t('operational.efactura.noCustomization'));
  if (!document.profileId) document.warnings.push(t('operational.efactura.noProfile'));
  const unknownUnits = document.lines.filter((line) => !line.unit).length;
  if (unknownUnits) document.warnings.push(t('operational.efactura.unknownUnits', { count: unknownUnits }));
  return document;
}

export function efacturaToScannedInvoice(document: EFacturaDocument): ScannedInvoice {
  return {
    supplier: document.supplierName,
    invoiceNumber: document.invoiceNumber,
    invoiceDate: document.issueDate,
    currency: document.currency,
    rows: document.lines.flatMap((line, index) => {
      if (!line.unit || line.unitPrice === null || line.unitPrice <= 0) return [];
      return [{
        name: line.name,
        unitPrice: line.unitPrice,
        unit: line.unit,
        packageQuantity: line.quantity && line.quantity > 0 ? line.quantity : null,
        packagePrice: line.netAmount && line.netAmount > 0 ? line.netAmount : null,
        billedQuantity: line.quantity,
        lineNetTotal: line.netAmount,
        vatPercent: line.vatPercent,
        confidence: document.errors.length ? 0.7 : 0.98,
        rowNumber: index + 1,
      }];
    }),
  };
}
