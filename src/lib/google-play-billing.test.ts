/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  BillingFlowError,
  createGooglePlayBillingController,
  hashBillingAccountId,
  selectSubscriptionOffer,
  verifyGooglePlayPurchase,
  type BillingNativeGateway,
  type BillingPurchase,
  type SubscriptionOffer,
} from '@/lib/google-play-billing';

const userId = '11111111-1111-4111-8111-111111111111';
const expectedAccountHash = 'bd7662a5eeb41614e720d477abfcb2272e19a8a70a93b7e3bc8560d44ad326e9';

const offer = (overrides: Partial<SubscriptionOffer> = {}): SubscriptionOffer => ({
  productId: 'professional_foodcost_pro',
  title: 'Manager 24/7 Pro',
  description: 'Professional subscription',
  formattedPrice: '99,00 RON',
  priceAmountMicros: 99_000_000,
  priceCurrencyCode: 'RON',
  basePlanId: 'monthly',
  offerId: null,
  offerToken: 'offer-token-monthly',
  ...overrides,
});

const purchase = (overrides: Partial<BillingPurchase> = {}): BillingPurchase => ({
  productId: 'professional_foodcost_pro',
  purchaseToken: 'purchase-token-A',
  purchaseState: 'purchased',
  acknowledged: false,
  autoRenewing: true,
  ...overrides,
});

function gateway(options: {
  offerBatches?: SubscriptionOffer[][];
  ownedBatches?: BillingPurchase[][];
  launched?: BillingPurchase[];
  emitDuringConnect?: BillingPurchase[];
} = {}) {
  let listener: ((purchases: BillingPurchase[]) => void | Promise<void>) | undefined;
  const batches = options.offerBatches ?? [[offer()]];
  let queryIndex = 0;
  const ownedBatches = options.ownedBatches ?? [[]];
  let ownedIndex = 0;
  const native: BillingNativeGateway = {
    connect: vi.fn(async () => {
      if (options.emitDuringConnect?.length) await listener?.(options.emitDuringConnect);
    }),
    querySubscriptionOffers: vi.fn(async () => (
      batches[Math.min(queryIndex++, batches.length - 1)] ?? []
    )),
    queryOwnedSubscriptions: vi.fn(async () => (
      ownedBatches[Math.min(ownedIndex++, ownedBatches.length - 1)] ?? []
    )),
    launchSubscriptionPurchase: vi.fn(async () => ({
      responseCode: 0,
      purchases: options.launched,
    })),
    addPurchasesUpdatedListener: vi.fn((next) => {
      listener = next;
      return { remove: vi.fn() };
    }),
  };
  return {
    native,
    emit: async (...purchases: BillingPurchase[]) => listener?.(purchases),
  };
}

describe('Google Play billing boundary', () => {
  it('hashes the authenticated account into the Google obfuscated account id', () => {
    expect(hashBillingAccountId(userId)).toBe(expectedAccountHash);
  });

  it('selects the explicitly configured base plan', () => {
    const annual = offer({ basePlanId: 'annual', offerToken: 'annual-token', formattedPrice: '990,00 RON' });
    expect(selectSubscriptionOffer([offer(), annual], 'annual')).toEqual(annual);
  });

  it('accepts one eligible base plan without inventing a plan id', () => {
    expect(selectSubscriptionOffer([offer()], undefined)).toEqual(offer());
  });

  it('prefers the unmodified base-plan offer when one plan also has a promotion', () => {
    const promotion = offer({ offerId: 'intro-trial', offerToken: 'trial-token' });
    expect(selectSubscriptionOffer([promotion, offer()], undefined)).toEqual(offer());
  });

  it('fails closed when multiple base plans exist and none is configured', () => {
    expect(() => selectSubscriptionOffer([
      offer(),
      offer({ basePlanId: 'annual', offerToken: 'annual-token' }),
    ], undefined)).toThrow(BillingFlowError);
  });

  it('re-queries the offer immediately before launch and binds the purchase to the user', async () => {
    const stale = offer({ offerToken: 'stale-token' });
    const fresh = offer({ offerToken: 'fresh-token' });
    const testGateway = gateway({ offerBatches: [[stale], [fresh]] });
    const verifyPurchase = vi.fn(async (_payload: {
      packageName: string;
      productId: string;
      purchaseToken: string;
    }) => ({ valid: true }));
    const refreshEntitlement = vi.fn(async () => undefined);
    const controller = createGooglePlayBillingController({
      native: testGateway.native,
      productId: 'professional_foodcost_pro',
      packageName: 'ro.paradim.professionalfoodcost',
      userId,
      verifyPurchase,
      refreshEntitlement,
    });

    expect((await controller.initialize()).formattedPrice).toBe('99,00 RON');
    await controller.buy();

    expect(testGateway.native.querySubscriptionOffers).toHaveBeenCalledTimes(2);
    expect(testGateway.native.launchSubscriptionPurchase).toHaveBeenCalledWith({
      productId: 'professional_foodcost_pro',
      offerToken: 'fresh-token',
      obfuscatedAccountId: expectedAccountHash,
    });
    expect(verifyPurchase).not.toHaveBeenCalled();
    expect(refreshEntitlement).not.toHaveBeenCalled();
  });

  it('verifies a completed matching update before refreshing entitlement', async () => {
    const testGateway = gateway();
    const order: string[] = [];
    const verifyPurchase = vi.fn(async () => {
      order.push('verify');
      return { valid: true };
    });
    const refreshEntitlement = vi.fn(async () => { order.push('refresh'); });
    const controller = createGooglePlayBillingController({
      native: testGateway.native,
      productId: 'professional_foodcost_pro',
      packageName: 'ro.paradim.professionalfoodcost',
      userId,
      verifyPurchase,
      refreshEntitlement,
    });
    await controller.initialize();

    await testGateway.emit(purchase({ purchaseState: 'pending' }));
    await testGateway.emit(purchase({ productId: 'foreign-product', purchaseToken: 'foreign-token' }));
    expect(verifyPurchase).not.toHaveBeenCalled();

    await testGateway.emit(purchase());
    expect(verifyPurchase).toHaveBeenCalledWith({
      packageName: 'ro.paradim.professionalfoodcost',
      productId: 'professional_foodcost_pro',
      purchaseToken: 'purchase-token-A',
    });
    expect(order).toEqual(['verify', 'refresh']);
  });

  it('registers the listener before connect and reconciles owned purchases at startup', async () => {
    const testGateway = gateway({
      emitDuringConnect: [purchase({ purchaseToken: 'connect-token' })],
      ownedBatches: [[purchase({ purchaseToken: 'owned-token' })]],
    });
    const verifyPurchase = vi.fn(async (_payload: {
      packageName: string;
      productId: string;
      purchaseToken: string;
    }) => ({ valid: true }));
    const refreshEntitlement = vi.fn(async () => undefined);
    const controller = createGooglePlayBillingController({
      native: testGateway.native,
      productId: 'professional_foodcost_pro',
      packageName: 'ro.paradim.professionalfoodcost',
      userId,
      verifyPurchase,
      refreshEntitlement,
    });

    await controller.initialize();

    const listenerOrder = vi.mocked(testGateway.native.addPurchasesUpdatedListener)
      .mock.invocationCallOrder[0];
    const connectOrder = vi.mocked(testGateway.native.connect).mock.invocationCallOrder[0];
    expect(listenerOrder).toBeLessThan(connectOrder);
    expect(verifyPurchase).toHaveBeenCalledTimes(2);
    expect(verifyPurchase.mock.calls.map(([payload]) => payload.purchaseToken).sort()).toEqual([
      'connect-token',
      'owned-token',
    ]);
  });

  it('verifies a purchase returned directly by the native launch before refreshing', async () => {
    const testGateway = gateway({ launched: [purchase()] });
    const order: string[] = [];
    const verifyPurchase = vi.fn(async () => {
      order.push('verify');
      return { valid: true };
    });
    const refreshEntitlement = vi.fn(async () => { order.push('refresh'); });
    const controller = createGooglePlayBillingController({
      native: testGateway.native,
      productId: 'professional_foodcost_pro',
      packageName: 'ro.paradim.professionalfoodcost',
      userId,
      verifyPurchase,
      refreshEntitlement,
    });
    await controller.initialize();

    await controller.buy();

    expect(order).toEqual(['verify', 'refresh']);
  });

  it('restores each unique completed matching purchase and refreshes once', async () => {
    const testGateway = gateway({ ownedBatches: [[], [
      purchase(),
      purchase(),
      purchase({ purchaseToken: 'purchase-token-B' }),
      purchase({ purchaseToken: 'pending-token', purchaseState: 'pending' }),
      purchase({ purchaseToken: 'foreign-token', productId: 'foreign-product' }),
    ]] });
    const verifyPurchase = vi.fn(async () => ({ valid: true }));
    const refreshEntitlement = vi.fn(async () => undefined);
    const controller = createGooglePlayBillingController({
      native: testGateway.native,
      productId: 'professional_foodcost_pro',
      packageName: 'ro.paradim.professionalfoodcost',
      userId,
      verifyPurchase,
      refreshEntitlement,
    });
    await controller.initialize();

    const restored = await controller.restore();

    expect(restored).toBe(2);
    expect(verifyPurchase).toHaveBeenCalledTimes(2);
    expect(refreshEntitlement).toHaveBeenCalledOnce();
  });

  it('can reverify a restored token after an entitlement refresh failure', async () => {
    const testGateway = gateway({ ownedBatches: [[], [purchase()], [purchase()]] });
    const verifyPurchase = vi.fn(async () => ({ valid: true }));
    const refreshEntitlement = vi.fn()
      .mockRejectedValueOnce(new Error('temporary refresh failure'))
      .mockResolvedValueOnce(undefined);
    const controller = createGooglePlayBillingController({
      native: testGateway.native,
      productId: 'professional_foodcost_pro',
      packageName: 'ro.paradim.professionalfoodcost',
      userId,
      verifyPurchase,
      refreshEntitlement,
    });
    await controller.initialize();

    await expect(controller.restore()).rejects.toBeInstanceOf(BillingFlowError);
    await expect(controller.restore()).resolves.toBe(1);

    expect(verifyPurchase).toHaveBeenCalledTimes(2);
    expect(refreshEntitlement).toHaveBeenCalledTimes(2);
  });

  it('does not refresh access or leak a purchase token when backend verification fails', async () => {
    const secretPurchase = purchase({ purchaseToken: 'secret-token-never-display' });
    const testGateway = gateway({ ownedBatches: [[], [secretPurchase], [secretPurchase]] });
    const verifyPurchase = vi.fn(async () => {
      throw new Error('backend response includes secret-token-never-display');
    });
    const refreshEntitlement = vi.fn(async () => undefined);
    const controller = createGooglePlayBillingController({
      native: testGateway.native,
      productId: 'professional_foodcost_pro',
      packageName: 'ro.paradim.professionalfoodcost',
      userId,
      verifyPurchase,
      refreshEntitlement,
    });
    await controller.initialize();

    await expect(controller.restore()).rejects.toMatchObject({
      name: 'BillingFlowError',
      message: 'Abonamentul nu a putut fi verificat. Încearcă din nou.',
    });
    await expect(controller.restore()).rejects.not.toThrow('secret-token-never-display');
    expect(refreshEntitlement).not.toHaveBeenCalled();
  });

  it('sends the exact purchase payload to the verification Edge Function', async () => {
    const invoke = vi.fn(async () => ({
      data: { valid: true, status: 'active' },
      error: null,
    }));
    const payload = {
      packageName: 'ro.paradim.professionalfoodcost',
      productId: 'professional_foodcost_pro',
      purchaseToken: 'purchase-token-A',
    };

    await expect(verifyGooglePlayPurchase(invoke, payload)).resolves.toEqual({ valid: true });
    expect(invoke).toHaveBeenCalledWith('verify-google-play-purchase', { body: payload });
  });

  it('converts an Edge rejection into a token-free billing error', async () => {
    const invoke = vi.fn(async () => ({
      data: { valid: false, message: 'rejected purchase-token-A' },
      error: new Error('network purchase-token-A'),
    }));
    const payload = {
      packageName: 'ro.paradim.professionalfoodcost',
      productId: 'professional_foodcost_pro',
      purchaseToken: 'purchase-token-A',
    };

    const error = await verifyGooglePlayPurchase(invoke, payload).catch((caught) => caught);
    expect(error).toBeInstanceOf(BillingFlowError);
    expect(String(error)).not.toContain('purchase-token-A');
  });
});
