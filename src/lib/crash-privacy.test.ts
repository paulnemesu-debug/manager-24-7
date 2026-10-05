import { describe, expect, it } from 'vitest';
import { sanitiseCrashEvent } from '@/lib/crash-privacy';

describe('crash event privacy', () => {
  it('removes account, invoice and HTTP payloads while retaining a usable code stack and debug ID', () => {
    const safe = sanitiseCrashEvent({ type: undefined, event_id: 'event',
      user: { email: 'private@example.com', id: 'account-id' },
      request: { url: 'https://api.example.com?token=secret', headers: { Authorization: 'secret' } },
      extra: { invoice: 'private-invoice' }, message: 'private business details',
      breadcrumbs: [{ message: 'private supplier name' }], tags: { account: 'secret' },
      exception: { values: [{ type: 'TypeError', value: 'invoice customer@example.com failed',
        stacktrace: { frames: [{ filename: 'app:///index.android.bundle?token=secret', lineno: 14, colno: 10,
          function: 'renderRecipe', vars: { customer: 'private' } }] } }] },
      debug_meta: { images: [{ type: 'sourcemap', debug_id: 'debug-identifier', code_file: 'app:///index.android.bundle' }] },
    });
    const encoded = JSON.stringify(safe);
    expect(encoded).not.toContain('private'); expect(encoded).not.toContain('secret');
    expect(encoded).not.toContain('customer@example'); expect(encoded).not.toContain('account-id');
    expect(safe.exception?.values?.[0].stacktrace?.frames?.[0]).toMatchObject({ filename: 'app:///index.android.bundle', lineno: 14 });
    expect(safe.debug_meta?.images?.[0].debug_id).toBe('debug-identifier');
  });
});
