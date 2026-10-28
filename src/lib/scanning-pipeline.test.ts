import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ calls: [] as { body: unknown }[], manipulations: 0, error: null as unknown, result: { rows: [{ name: 'Unt', quantity: 2, unit: 'kg', unitPrice: 40 }] } as unknown }));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('expo-file-system', () => ({ File: class { constructor() { throw Error('Native file API used on web'); } } }));
vi.mock('expo-image-manipulator', () => ({ SaveFormat: { JPEG: 'jpeg' }, manipulateAsync: async () => {
  state.manipulations++; return { uri: 'data:image/jpeg;base64,/9j/2Q==' };
} }));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: async (_name: string, input: { body: unknown }) => {
  state.calls.push(input); return { data: state.result, error: state.error };
} } } }));
import { scanInvoiceDocument } from '@/lib/invoice-scan';
import { scanConsumptionDocument } from '@/lib/consumption-scan';
beforeEach(() => { state.calls = []; state.manipulations = 0; state.error = null; state.result = { rows: [{ name: 'Unt', quantity: 2, unit: 'kg', unitPrice: 40 }] }; });
it('reads browser PDFs and sends the invoice mode without image manipulation', async () => {
  const result = await scanInvoiceDocument('data:application/pdf;base64,JVBERi0x', 'application/pdf');
  expect(result.rows[0].unitPrice).toBe(40); expect(state.manipulations).toBe(0);
  expect(state.calls[0].body).toEqual({ mode: 'invoice', document: { mediaType: 'application/pdf', data: 'JVBERi0x' } });
});
it('converts image invoices to JPEG and normalises their response', async () => {
  const result = await scanInvoiceDocument('blob:photo', 'image/png'); expect(state.manipulations).toBe(1); expect(result.rows).toHaveLength(1);
  expect(state.calls[0].body).toMatchObject({ mode: 'invoice', document: { mediaType: 'image/jpeg' } });
});
it('normalises scanned consumption rows and never uses native file APIs on web', async () => {
  expect(await scanConsumptionDocument('blob:camera')).toMatchObject([{ name: 'Unt', quantity: 2, unitPrice: 40 }]);
  expect(state.calls[0].body).toMatchObject({ image: { mediaType: 'image/jpeg' } });
});
it.each(['scan_not_configured', 'scan_daily_limit', 'scan_rate_limited', 'authentication_required', 'professional_access_required'])('preserves actionable service failure %s', async (code) => {
  state.error = { context: new Response(JSON.stringify({ error: code }), { status: 403 }) };
  await expect(scanConsumptionDocument('blob:camera')).rejects.toThrow(code);
});
it('rejects invalid AI output instead of inventing ingredient rows', async () => {
  state.result = { rows: [{ name: 'Fără date' }] }; await expect(scanInvoiceDocument('blob:x', 'image/jpeg')).rejects.toThrow('scan_empty');
  await expect(scanConsumptionDocument('blob:x')).rejects.toThrow('scan_empty');
});
it('rejects unsupported document types before making a paid API call', async () => {
  await expect(scanInvoiceDocument('data:text/plain;base64,AQID', 'text/plain')).rejects.toThrow('invoice_type_invalid'); expect(state.calls).toHaveLength(0);
});
