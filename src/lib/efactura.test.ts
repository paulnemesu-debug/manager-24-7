/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import { efacturaToScannedInvoice, parseEfacturaXml } from '@/lib/efactura';

const xml = `<?xml version="1.0"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1</cbc:CustomizationID><cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>F-42</cbc:ID><cbc:IssueDate>2026-09-19</cbc:IssueDate><cbc:DocumentCurrencyCode>RON</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyTaxScheme><cbc:CompanyID>RO123</cbc:CompanyID></cac:PartyTaxScheme><cac:PartyLegalEntity><cbc:RegistrationName>Furnizor &amp; Co</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyTaxScheme><cbc:CompanyID>RO456</cbc:CompanyID></cac:PartyTaxScheme><cac:PartyLegalEntity><cbc:RegistrationName>Restaurant Demo</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="KGM">5</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="RON">50</cbc:LineExtensionAmount><cac:Item><cbc:Name>Cartofi</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>11</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="RON">10</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="RON">55.50</cbc:PayableAmount></cac:LegalMonetaryTotal>
</Invoice>`;

describe('e-Factura UBL parser', () => {
  it('reads parties, totals and importable invoice lines', () => {
    const document = parseEfacturaXml(xml);
    expect(document.errors).toEqual([]);
    expect(document).toMatchObject({ invoiceNumber: 'F-42', supplierName: 'Furnizor & Co', supplierTaxId: 'RO123', payableAmount: 55.5 });
    expect(document.lines[0]).toMatchObject({ name: 'Cartofi', quantity: 5, unit: 'kg', unitPrice: 10, vatPercent: 11 });
    expect(efacturaToScannedInvoice(document).rows[0]).toMatchObject({ name: 'Cartofi', unit: 'kg', unitPrice: 10, confidence: 0.98 });
  });

  it('rejects XML declarations that could resolve external entities', () => {
    expect(() => parseEfacturaXml('<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><Invoice></Invoice>')).toThrow('efactura_unsafe_xml');
  });
});

const withBase = (quantity: string, unit = 'KGM') => xml.replace('<cbc:PriceAmount currencyID="RON">10</cbc:PriceAmount>', `<cbc:PriceAmount currencyID="RON">100</cbc:PriceAmount><cbc:BaseQuantity unitCode="${unit}">${quantity}</cbc:BaseQuantity>`);
it('normalizes PriceAmount by BaseQuantity before importing', () => {
  const document = parseEfacturaXml(withBase('10'));
  expect(document.errors).toEqual([]);
  expect(document.lines[0].unitPrice).toBe(10);
  expect(efacturaToScannedInvoice(document).rows[0].unitPrice).toBe(10);
});
it.each(['0', '-10', 'NaN', '', '10 kg'])('rejects invalid price base quantity %s', quantity => {
  expect(() => parseEfacturaXml(withBase(quantity))).toThrow('efactura_invalid_price_basis');
});
it('rejects a different price base unit instead of inventing a conversion', () => {
  expect(() => parseEfacturaXml(withBase('10', 'LTR'))).toThrow('efactura_invalid_price_basis');
});
it.each([
  xml.replace('</Invoice>', ''),
  xml.replace('</cbc:ID>', '</cbc:Name>'),
  xml + '<Invoice/>',
  xml.replace('F-42', 'F & unknown;'),
  xml.replace('F-42', '&madeup;'),
  xml.replace('F-42', '&#0;'),
  xml.replace('F-42', '&#xD800;'),
  xml.replace('F-42', '&#x110000;'),
  xml.replace('F-42', 'F\u0001B'),
  xml.replace('F-42', 'F]]>B'),
  xml.replace('unitCode="KGM"', 'unitCode="KGM" unitCode="LTR"'),
  xml.replace('F-42', '<!-- broken -- comment -->F-42'),
])('rejects malformed XML syntax before returning invoice rows %#', invalid => {
  expect(() => parseEfacturaXml(invalid)).toThrow('efactura_invalid_xml');
});
it('rejects an Invoice nested inside a non-UBL root', () => {
  expect(() => parseEfacturaXml('<wrapper>' + xml.replace('<?xml version="1.0"?>', '') + '</wrapper>')).toThrow('efactura_invalid_root');
});
it('ignores commented-out invoice fields and preserves escaped and CDATA text', () => {
  const document = parseEfacturaXml(xml.replace('<cbc:ID>F-42</cbc:ID>', '<!-- <cbc:ID>WRONG</cbc:ID> --><cbc:ID>F-42</cbc:ID>').replace('Cartofi', '<![CDATA[Cartofi <mici> & proaspeți]]>'));
  expect(document.invoiceNumber).toBe('F-42');
  expect(document.lines[0].name).toBe('Cartofi <mici> & proaspeți');
});

it('allows CDATA closing characters in quoted attributes', () => {
  const document = parseEfacturaXml(xml.replace('<cbc:ID>F-42', '<cbc:ID note="x]]>y">F-42'));
  expect(document.invoiceNumber).toBe('F-42');
});

it('rejects invoices above the line limit instead of silently truncating rows', () => {
  const line = xml.match(/<cac:InvoiceLine>[\s\S]*?<\/cac:InvoiceLine>/)![0];
  expect(() => parseEfacturaXml(xml.replace(line, line.repeat(2001)))).toThrow('efactura_too_many_lines');
});
