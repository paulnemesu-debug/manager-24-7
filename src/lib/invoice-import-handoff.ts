import type { ScannedInvoice } from '@/lib/invoice-import';

type InvoiceHandoff = { ownerId: string; token: string; expiresAt: number; invoice: ScannedInvoice; sourceName: string };
let pending: InvoiceHandoff | null = null;
let sequence = 0;

/** One-use local navigation payload. No invoice content is written to storage or URLs. */
export function stageInvoiceImport(ownerId: string, invoice: ScannedInvoice, sourceName: string): string {
  const token = `invoice-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
  pending = { ownerId, token, expiresAt: Date.now() + 10 * 60_000, sourceName,
    invoice: { ...invoice, rows: invoice.rows.map(row => ({ ...row })), rejectedRows: invoice.rejectedRows?.map(row => ({ ...row })) },
  };
  return token;
}

export function takeInvoiceImport(token: string, ownerId: string): Pick<InvoiceHandoff, 'invoice' | 'sourceName'> | null {
  if (!pending || pending.token !== token) return null;
  const value = pending;
  pending = null;
  if (value.ownerId !== ownerId || value.expiresAt <= Date.now()) return null;
  return { invoice: value.invoice, sourceName: value.sourceName };
}
