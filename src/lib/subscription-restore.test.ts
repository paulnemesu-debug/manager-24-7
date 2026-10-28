import { describe, expect, it, vi } from 'vitest';

import { restoreSubscriptionAccess } from '@/lib/subscription-restore';

describe('subscription restore routing', () => {
  it('lets the backend-verified Google Play flow own entitlement refresh', async () => {
    const restoreGooglePlay = vi.fn(async () => undefined);
    const refreshExternalAccess = vi.fn(async () => undefined);

    await restoreSubscriptionAccess({
      isPlayStoreBuild: true,
      restoreGooglePlay,
      refreshExternalAccess,
    });

    expect(restoreGooglePlay).toHaveBeenCalledOnce();
    expect(refreshExternalAccess).not.toHaveBeenCalled();
  });

  it('refreshes server access directly for non-Play distributions', async () => {
    const restoreGooglePlay = vi.fn(async () => undefined);
    const refreshExternalAccess = vi.fn(async () => undefined);

    await restoreSubscriptionAccess({
      isPlayStoreBuild: false,
      restoreGooglePlay,
      refreshExternalAccess,
    });

    expect(restoreGooglePlay).not.toHaveBeenCalled();
    expect(refreshExternalAccess).toHaveBeenCalledOnce();
  });
});
