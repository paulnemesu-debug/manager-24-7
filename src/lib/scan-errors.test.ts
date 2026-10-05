import { describe, expect, it } from 'vitest';
import { scanErrorMessage, scanFunctionError } from '@/lib/scan-errors';

describe('scan service feedback', () => {
  it('maps structured quota errors to operator-facing messages', async () => {
    const error = await scanFunctionError({ context: new Response('{"error":"scan_daily_limit"}', { status: 429 }) });
    expect(error.message).toBe('scan_daily_limit');
    expect(scanErrorMessage(error, 'ro', 'fallback')).toContain('Limita zilnică');
    expect(scanErrorMessage(error, 'en', 'fallback')).toContain('daily scan limit');
  });
  it('keeps infrastructure details out of operator-facing feedback', async () => {
    const error = await scanFunctionError({ context: new Response('{"error":"provider failure with sensitive details"}', { status: 502 }) });
    expect(scanErrorMessage(error, 'ro', 'Reîncearcă')).toBe('Reîncearcă');
  });
});
