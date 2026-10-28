import { translate, type Locale, type TranslationKey } from '@/i18n/translations';
/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { DOMParser } from 'manager247-xml-parser';
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

function children(source: Element | null, name: string): Element[] {
  if (!source) return [];
  return Array.from(source.childNodes).filter((node): node is Element => node.nodeType === 1 && (node as Element).localName === name);
}

function child(source: Element | null, name: string): Element | null {
  return children(source, name)[0] ?? null;
}

function tagText(source: Element | null, name: string): string | null {
  const text = child(source, name)?.textContent?.replace(/\s+/g, ' ').trim();
  return text || null;
}

function decimal(value: string | null): number | null {
  if (!value || !/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value)) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function elementAttribute(source: Element | null, name: string, attribute: string): string | null {
  return child(source, name)?.getAttribute(attribute)?.trim() || null;
}

function party(source: Element, blockName: string) {
  const block = child(source, blockName);
  const partyBlock = child(block, 'Party') ?? block;
  const legal = child(partyBlock, 'PartyLegalEntity');
  const tax = child(partyBlock, 'PartyTaxScheme');
  return {
    name: tagText(legal, 'RegistrationName') ?? tagText(child(partyBlock, 'PartyName'), 'Name') ?? tagText(partyBlock, 'Name'),
    taxId: tagText(tax, 'CompanyID') ?? tagText(legal, 'CompanyID'),
  };
}

function parseInvoiceRoot(xml: string): Element {
  // xmldom reports structural errors, but leaves some invalid XML characters
  // and entity spellings untouched. Validate those before accepting its DOM.
  const invalidCharacter = /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u;
  const markup = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g, '');
  const text = markup.replace(/<(?:[^"'<>]|"[^"]*"|'[^']*')*>/g, '');
  if (invalidCharacter.test(xml) || text.includes(']]>') || /&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/.test(markup)) {
    throw new Error('efactura_invalid_xml');
  }
  for (const match of markup.matchAll(/&#(x[0-9a-fA-F]+|[0-9]+);/g)) {
    const code = match[1].startsWith('x') ? parseInt(match[1].slice(1), 16) : Number(match[1]);
    if (!Number.isInteger(code) || code > 0x10ffff || invalidCharacter.test(String.fromCodePoint(code))) throw new Error('efactura_invalid_xml');
  }
  let root: Element | null;
  try {
    const document = new DOMParser({ onError: () => { throw new Error('efactura_invalid_xml'); } }).parseFromString(xml, 'application/xml');
    root = document.documentElement;
  } catch {
    throw new Error('efactura_invalid_xml');
  }
  if (!root || !['Invoice', 'CreditNote'].includes(root.localName)) throw new Error('efactura_invalid_root');
  return root;
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
  const root = parseInvoiceRoot(xml);
  const documentType = root.localName === 'CreditNote' ? 'credit_note' : 'invoice';
  const supplier = party(root, 'AccountingSupplierParty');
  const customer = party(root, 'AccountingCustomerParty');
  const lineName = documentType === 'credit_note' ? 'CreditNoteLine' : 'InvoiceLine';
  const quantityName = documentType === 'credit_note' ? 'CreditedQuantity' : 'InvoicedQuantity';
  const lineElements = children(root, lineName);
  if (lineElements.length > 2000) throw new Error('efactura_too_many_lines');
  const lines = lineElements.map((block, index): EFacturaLine => {
    const quantity = decimal(tagText(block, quantityName));
    const unitCode = elementAttribute(block, quantityName, 'unitCode');
    const item = child(block, 'Item');
    const price = child(block, 'Price');
    const taxCategory = child(item, 'ClassifiedTaxCategory') ?? child(block, 'ClassifiedTaxCategory') ?? child(block, 'TaxCategory');
    const priceAmount = decimal(tagText(price, 'PriceAmount'));
    const base = child(price, 'BaseQuantity');
    const baseQuantity = base ? decimal(base.textContent?.trim() ?? null) : 1;
    const baseUnit = base?.getAttribute('unitCode')?.trim();
    // UBL BT-149 defines how many invoice units the price amount buys.
    if (base && (!baseQuantity || baseQuantity <= 0 || (baseUnit && baseUnit !== unitCode))) throw new Error('efactura_invalid_price_basis');
    const unitPrice = priceAmount === null ? null : priceAmount / baseQuantity!;
    if (unitPrice !== null && !Number.isFinite(unitPrice)) throw new Error('efactura_invalid_price_basis');
    return {
      id: tagText(block, 'ID') ?? String(index + 1),
      name: tagText(item, 'Name') ?? tagText(item, 'Description') ?? t('operational.efactura.line', { number: index + 1 }),
      quantity,
      unitCode,
      unit: unitCodeToPriceUnit(unitCode),
      unitPrice,
      netAmount: decimal(tagText(block, 'LineExtensionAmount')),
      vatPercent: decimal(tagText(taxCategory, 'Percent')),
    };
  });
  const monetary = child(root, 'LegalMonetaryTotal');
  const document: EFacturaDocument = {
    documentType,
    invoiceNumber: tagText(root, 'ID'),
    issueDate: tagText(root, 'IssueDate'),
    dueDate: tagText(root, 'DueDate'),
    currency: tagText(root, 'DocumentCurrencyCode'),
    supplierName: supplier.name,
    supplierTaxId: supplier.taxId,
    customerName: customer.name,
    customerTaxId: customer.taxId,
    payableAmount: decimal(tagText(monetary, 'PayableAmount')),
    lines,
    profileId: tagText(root, 'ProfileID'),
    customizationId: tagText(root, 'CustomizationID'),
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
