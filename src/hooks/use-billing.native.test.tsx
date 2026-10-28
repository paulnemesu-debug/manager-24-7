import React, { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BillingState } from '@/hooks/billing-types';

const runtime = vi.hoisted(() => {
  const productId = 'professional_foodcost_pro';
  const userId = '11111111-1111-4111-8111-111111111111';
  const listener = { current: undefined as undefined | ((purchase: unknown) => void) };
  return {
    productId,
    userId,
    listener,
    refresh: vi.fn(async () => undefined),
    invoke: vi.fn(async () => ({ data: { valid: true }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })),
    native: {
      connect: vi.fn(async () => ({
        productId,
        title: 'Manager 24/7 Pro',
        description: 'Professional subscription',
        offers: [{
          basePlanId: 'monthly',
          offerId: null,
          offerToken: 'monthly-token',
          formattedPrice: '99,00 RON',
          priceAmountMicros: 99_000_000,
          priceCurrencyCode: 'RON',
        }],
      })),
      purchase: vi.fn(async () => ({
        packageName: 'ro.paradim.professionalfoodcost',
        productIds: [productId],
        purchaseToken: 'purchase-token',
        state: 'purchased',
        acknowledged: false,
        autoRenewing: true,
        orderId: 'order-1',
      })),
      restore: vi.fn(async () => []),
      disconnect: vi.fn(async () => undefined),
      addListener: vi.fn((_name: string, next: (purchase: unknown) => void) => {
        listener.current = next;
        return { remove: vi.fn() };
      }),
    },
  };
});

vi.mock('@/constants/paradim', () => ({ IS_PLAY_STORE_BUILD: true }));
vi.mock('@/contexts/subscription-context', () => ({
  useSubscription: () => ({ refresh: runtime.refresh }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: runtime.getUser },
    functions: { invoke: runtime.invoke },
  },
}));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { android: { package: 'ro.paradim.professionalfoodcost' } } },
}));
vi.mock('../../modules/manager247-billing', () => ({ default: runtime.native }));

import { useBilling } from './use-billing.native';

let renderer: ReactTestRenderer | undefined;
let billing: BillingState | undefined;
function Probe() {
  const current = useBilling();
  useEffect(() => {
    billing = current;
  }, [current]);
  return null;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  process.env.EXPO_PUBLIC_GOOGLE_PLAY_SUBSCRIPTION_ID = runtime.productId;
  delete process.env.EXPO_PUBLIC_GOOGLE_PLAY_BASE_PLAN_ID;
  vi.clearAllMocks();
  runtime.listener.current = undefined;
  billing = undefined;
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

describe('Android billing hook', () => {
  it('loads the native client only when mounted and verifies purchase before access refresh', async () => {
    expect(runtime.native.connect).not.toHaveBeenCalled();
    await act(async () => {
      renderer = create(<Probe />);
      await flush();
    });

    expect(billing).toMatchObject({
      configured: true,
      connected: true,
      displayPrice: '99,00 RON',
      error: null,
    });
    expect(runtime.native.connect).toHaveBeenCalledOnce();

    await act(async () => {
      await billing!.buy();
      await flush();
    });

    expect(runtime.native.connect).toHaveBeenCalledTimes(2);
    expect(runtime.native.purchase).toHaveBeenCalledWith(
      runtime.productId,
      'monthly-token',
      runtime.userId,
    );
    expect(runtime.invoke).toHaveBeenCalledWith('verify-google-play-purchase', {
      body: {
        packageName: 'ro.paradim.professionalfoodcost',
        productId: runtime.productId,
        purchaseToken: 'purchase-token',
      },
    });
    expect(runtime.refresh).toHaveBeenCalledOnce();
  });

  it('keeps the process billing client alive when the screen unmounts', async () => {
    await act(async () => {
      renderer = create(<Probe />);
      await flush();
      renderer.unmount();
      renderer = undefined;
    });

    expect(runtime.native.disconnect).not.toHaveBeenCalled();
  });
});
