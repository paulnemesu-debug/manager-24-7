import { describe, expect, it, vi } from 'vitest';

import type {
  Manager247BillingModule,
  NativeBillingProduct,
  NativeBillingPurchase,
} from '../../modules/manager247-billing';
import {
  createGooglePlayNativeGateway,
  hashBillingAccountId,
} from '@/lib/google-play-billing';

const productId = 'professional_foodcost_pro';
const userId = '11111111-1111-4111-8111-111111111111';
const product: NativeBillingProduct = {
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
};
const purchase: NativeBillingPurchase = {
  packageName: 'ro.paradim.professionalfoodcost',
  productIds: [productId],
  purchaseToken: 'purchase-token',
  state: 'purchased',
  acknowledged: false,
  autoRenewing: true,
  orderId: 'order-1',
};

function nativeModule() {
  let listener: ((value: NativeBillingPurchase) => void) | undefined;
  const module: Manager247BillingModule = {
    connect: vi.fn(async () => product),
    purchase: vi.fn(async () => purchase),
    restore: vi.fn(async () => [purchase]),
    disconnect: vi.fn(async () => undefined),
    addListener: vi.fn((_event, next) => {
      listener = next;
      return { remove: vi.fn() };
    }),
  };
  return { module, emit: (value: NativeBillingPurchase) => listener?.(value) };
}

describe('native Google Play adapter', () => {
  it('uses the connected product once, then re-queries before purchase selection', async () => {
    const native = nativeModule();
    const gateway = createGooglePlayNativeGateway(native.module, productId, userId);
    await gateway.connect();

    expect(await gateway.querySubscriptionOffers(productId)).toEqual([
      expect.objectContaining({
        productId,
        basePlanId: 'monthly',
        offerToken: 'monthly-token',
        formattedPrice: '99,00 RON',
      }),
    ]);
    expect(native.module.connect).toHaveBeenCalledTimes(1);

    await gateway.querySubscriptionOffers(productId);
    expect(native.module.connect).toHaveBeenCalledTimes(2);
  });

  it('guards the account hash and lets native code hash the raw user id exactly once', async () => {
    const native = nativeModule();
    const gateway = createGooglePlayNativeGateway(native.module, productId, userId);
    await gateway.connect();

    const result = await gateway.launchSubscriptionPurchase({
      productId,
      offerToken: 'monthly-token',
      obfuscatedAccountId: hashBillingAccountId(userId),
    });

    expect(native.module.purchase).toHaveBeenCalledWith(productId, 'monthly-token', userId);
    expect(result).toEqual({
      responseCode: 0,
      purchases: [expect.objectContaining({
        productId,
        purchaseToken: 'purchase-token',
        purchaseState: 'purchased',
      })],
    });
    await expect(gateway.launchSubscriptionPurchase({
      productId,
      offerToken: 'monthly-token',
      obfuscatedAccountId: 'wrong-account-hash',
    })).rejects.toThrow('billing-account-mismatch');
  });

  it('normalizes restore and out-of-band native updates through the same contract', async () => {
    const native = nativeModule();
    const gateway = createGooglePlayNativeGateway(native.module, productId, userId);
    const received = vi.fn();
    gateway.addPurchasesUpdatedListener(received);

    expect(await gateway.queryOwnedSubscriptions()).toEqual([
      expect.objectContaining({ purchaseState: 'purchased', purchaseToken: 'purchase-token' }),
    ]);
    native.emit({ ...purchase, state: 'pending', purchaseToken: 'pending-token' });
    expect(received).toHaveBeenCalledWith([
      expect.objectContaining({ purchaseState: 'pending', purchaseToken: 'pending-token' }),
    ]);
  });
});
