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
