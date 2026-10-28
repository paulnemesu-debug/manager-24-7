/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type {
  Manager247BillingModule,
  NativeBillingProduct,
  NativeBillingPurchase,
} from '../../modules/manager247-billing';

export type BillingPurchaseState = 'purchased' | 'pending' | 'unspecified';

export type SubscriptionOffer = {
  productId: string;
  title: string;
  description: string;
  formattedPrice: string;
  priceAmountMicros: number;
  priceCurrencyCode: string;
  basePlanId: string;
  offerId: string | null;
  offerToken: string;
};

export type BillingPurchase = {
  productId: string;
  purchaseToken: string;
  purchaseState: BillingPurchaseState;
  acknowledged: boolean;
  autoRenewing: boolean;
  orderId?: string | null;
};

export type BillingLaunchRequest = {
  productId: string;
  offerToken: string;
  obfuscatedAccountId: string;
};

export type BillingNativeGateway = {
  connect: () => Promise<void>;
  querySubscriptionOffers: (productId: string) => Promise<SubscriptionOffer[]>;
  queryOwnedSubscriptions: () => Promise<BillingPurchase[]>;
  launchSubscriptionPurchase: (
    request: BillingLaunchRequest,
  ) => Promise<{ responseCode: number; purchases?: BillingPurchase[] }>;
  addPurchasesUpdatedListener: (
    listener: (purchases: BillingPurchase[]) => void | Promise<void>,
  ) => { remove: () => void };
};

type VerificationPayload = {
  packageName: string;
  productId: string;
  purchaseToken: string;
};

type EdgeFunctionInvoker = (
  name: string,
  options: { body: VerificationPayload },
) => Promise<{
  data: { valid?: boolean } | null;
  error: unknown;
}>;

type GooglePlayBillingDependencies = {
  native: BillingNativeGateway;
  productId: string;
  packageName: string;
  userId: string;
  basePlanId?: string;
  verifyPurchase: (payload: VerificationPayload) => Promise<{ valid: boolean }>;
  refreshEntitlement: () => Promise<void>;
  onError?: (error: BillingFlowError) => void;
};

const VERIFICATION_FAILED = 'Abonamentul nu a putut fi verificat. Încearcă din nou.';
const BILLING_UNAVAILABLE = 'Google Play Billing nu este disponibil momentan. Încearcă din nou.';

export class BillingFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingFlowError';
  }
}

function utf8Bytes(value: string) {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    let point = value.charCodeAt(index);
    if (point >= 0xd800 && point <= 0xdbff && index + 1 < value.length) {
      const low = value.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        point = ((point - 0xd800) << 10) + low - 0xdc00 + 0x10000;
        index += 1;
      }
    }
    if (point <= 0x7f) bytes.push(point);
    else if (point <= 0x7ff) bytes.push(0xc0 | (point >>> 6), 0x80 | (point & 0x3f));
    else if (point <= 0xffff) {
      bytes.push(0xe0 | (point >>> 12), 0x80 | ((point >>> 6) & 0x3f), 0x80 | (point & 0x3f));
    } else {
      bytes.push(
        0xf0 | (point >>> 18),
        0x80 | ((point >>> 12) & 0x3f),
        0x80 | ((point >>> 6) & 0x3f),
        0x80 | (point & 0x3f),
      );
    }
  }
  return bytes;
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const rotateRight = (value: number, amount: number) => (
  (value >>> amount) | (value << (32 - amount))
);

/** SHA-256 used by both the app and the verification Edge Function. */
export function hashBillingAccountId(value: string) {
  const bytes = utf8Bytes(value);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((high >>> shift) & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((low >>> shift) & 0xff);

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const words = new Array<number>(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const cursor = offset + index * 4;
      words[index] = (
        (bytes[cursor] << 24)
        | (bytes[cursor + 1] << 16)
        | (bytes[cursor + 2] << 8)
        | bytes[cursor + 3]
      ) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const before15 = words[index - 15];
      const before2 = words[index - 2];
      const sigma0 = rotateRight(before15, 7) ^ rotateRight(before15, 18) ^ (before15 >>> 3);
      const sigma1 = rotateRight(before2, 17) ^ rotateRight(before2, 19) ^ (before2 >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const upper1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + upper1 + choice + SHA256_K[index] + words[index]) >>> 0;
      const upper0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (upper0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return hash.map((word) => word.toString(16).padStart(8, '0')).join('');
}

export function selectSubscriptionOffer(
  offers: SubscriptionOffer[],
  configuredBasePlanId?: string,
) {
  const eligible = offers.filter((candidate) => (
    candidate.basePlanId.trim().length > 0 && candidate.offerToken.trim().length > 0
  ));
  const selectOne = (candidates: SubscriptionOffer[]) => {
    if (candidates.length === 1) return candidates[0];
    const baseOffers = candidates.filter((candidate) => !candidate.offerId);
    if (baseOffers.length === 1) return baseOffers[0];
    throw new BillingFlowError(BILLING_UNAVAILABLE);
  };
  if (configuredBasePlanId) {
    const matching = eligible.filter((candidate) => candidate.basePlanId === configuredBasePlanId);
    return selectOne(matching);
  }
  const plans = new Map<string, SubscriptionOffer[]>();
  for (const candidate of eligible) {
    plans.set(candidate.basePlanId, [...(plans.get(candidate.basePlanId) ?? []), candidate]);
  }
  if (plans.size !== 1) throw new BillingFlowError(BILLING_UNAVAILABLE);
  return selectOne([...plans.values()][0]);
}

export async function verifyGooglePlayPurchase(
  invoke: EdgeFunctionInvoker,
  payload: VerificationPayload,
) {
  try {
    const { data, error } = await invoke('verify-google-play-purchase', { body: payload });
    if (error || data?.valid !== true) throw new Error('verification rejected');
    return { valid: true };
  } catch {
    throw new BillingFlowError(VERIFICATION_FAILED);
  }
}

function normalizeNativePurchase(
  purchase: NativeBillingPurchase,
  expectedProductId: string,
): BillingPurchase {
  const purchaseState: BillingPurchaseState = purchase.state === 'purchased'
    ? 'purchased'
    : purchase.state === 'pending' ? 'pending' : 'unspecified';
  return {
    productId: purchase.productIds.includes(expectedProductId)
      ? expectedProductId
      : (purchase.productIds[0] ?? ''),
    purchaseToken: purchase.purchaseToken ?? '',
    purchaseState,
    acknowledged: purchase.acknowledged,
    autoRenewing: purchase.autoRenewing,
    orderId: purchase.orderId,
  };
}

function offersFromProduct(product: NativeBillingProduct): SubscriptionOffer[] {
  return product.offers.map((offer) => ({
    productId: product.productId,
    title: product.title,
    description: product.description,
    ...offer,
  }));
}

export function createGooglePlayNativeGateway(
  native: Manager247BillingModule,
  expectedProductId: string,
  userId: string,
): BillingNativeGateway {
  let connectedProduct: NativeBillingProduct | null = null;
  return {
    async connect() {
      connectedProduct = await native.connect(expectedProductId);
    },

    async querySubscriptionOffers(productId) {
      if (productId !== expectedProductId) return [];
      const product = connectedProduct ?? await native.connect(productId);
      connectedProduct = null;
      return offersFromProduct(product);
    },

    async queryOwnedSubscriptions() {
      const purchases = await native.restore(expectedProductId);
      return purchases.map((purchase) => normalizeNativePurchase(purchase, expectedProductId));
    },

    async launchSubscriptionPurchase(request) {
      if (request.productId !== expectedProductId) throw new Error('billing-product-mismatch');
      if (request.obfuscatedAccountId !== hashBillingAccountId(userId)) {
        throw new Error('billing-account-mismatch');
      }
      const purchase = await native.purchase(
        expectedProductId,
        request.offerToken,
        userId,
      );
      return {
        responseCode: 0,
        purchases: purchase.state === 'cancelled'
          ? []
          : [normalizeNativePurchase(purchase, expectedProductId)],
      };
    },

    addPurchasesUpdatedListener(listener) {
      return native.addListener('onPurchaseUpdated', (purchase) => {
        void listener([normalizeNativePurchase(purchase, expectedProductId)]);
      });
    },
  };
}

export function createGooglePlayBillingController(dependencies: GooglePlayBillingDependencies) {
  const verifiedTokens = new Set<string>();
  const inFlightTokens = new Set<string>();
  let listener: { remove: () => void } | undefined;

  const genericVerificationError = () => new BillingFlowError(VERIFICATION_FAILED);

  const verifyPurchases = async (purchases: BillingPurchase[]) => {
    let verified = 0;
    for (const purchase of purchases) {
      if (
        purchase.productId !== dependencies.productId
        || purchase.purchaseState !== 'purchased'
        || !purchase.purchaseToken
        || verifiedTokens.has(purchase.purchaseToken)
        || inFlightTokens.has(purchase.purchaseToken)
      ) continue;

      inFlightTokens.add(purchase.purchaseToken);
      try {
        const result = await dependencies.verifyPurchase({
          packageName: dependencies.packageName,
          productId: dependencies.productId,
          purchaseToken: purchase.purchaseToken,
        });
        if (!result.valid) throw genericVerificationError();
        verifiedTokens.add(purchase.purchaseToken);
        verified += 1;
      } catch {
        throw genericVerificationError();
      } finally {
        inFlightTokens.delete(purchase.purchaseToken);
      }
    }
    if (verified > 0) await dependencies.refreshEntitlement();
    return verified;
  };

  return {
    async initialize() {
      await dependencies.native.connect();
      if (!listener) {
        listener = dependencies.native.addPurchasesUpdatedListener(async (purchases) => {
          try {
            await verifyPurchases(purchases);
          } catch (caught) {
            dependencies.onError?.(
              caught instanceof BillingFlowError ? caught : genericVerificationError(),
            );
          }
        });
      }
      const offers = await dependencies.native.querySubscriptionOffers(dependencies.productId);
      return selectSubscriptionOffer(offers, dependencies.basePlanId);
    },

    async buy() {
      const offers = await dependencies.native.querySubscriptionOffers(dependencies.productId);
      const selected = selectSubscriptionOffer(offers, dependencies.basePlanId);
      const result = await dependencies.native.launchSubscriptionPurchase({
        productId: dependencies.productId,
        offerToken: selected.offerToken,
        obfuscatedAccountId: hashBillingAccountId(dependencies.userId),
      });
      if (result.responseCode !== 0) throw new BillingFlowError(BILLING_UNAVAILABLE);
      if (result.purchases?.length) await verifyPurchases(result.purchases);
    },

    async restore() {
      try {
        return await verifyPurchases(await dependencies.native.queryOwnedSubscriptions());
      } catch {
        throw genericVerificationError();
      }
    },

    dispose() {
      listener?.remove();
      listener = undefined;
    },
  };
}

