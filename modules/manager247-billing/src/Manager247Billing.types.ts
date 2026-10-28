import type { EventSubscription } from 'expo-modules-core';

export type NativeBillingOffer = {
  basePlanId: string;
  offerId: string | null;
  offerToken: string;
  formattedPrice: string;
  priceAmountMicros: number;
  priceCurrencyCode: string;
};

export type NativeBillingProduct = {
  productId: string;
  title: string;
  description: string;
  offers: NativeBillingOffer[];
};

export type NativeBillingPurchase = {
  packageName: string;
  productIds: string[];
  purchaseToken: string | null;
  state: 'purchased' | 'pending' | 'cancelled' | 'unspecified';
  acknowledged: boolean;
  autoRenewing: boolean;
  orderId: string | null;
};

export type Manager247BillingModule = {
  connect(productId: string): Promise<NativeBillingProduct>;
  purchase(productId: string, offerToken: string, userId: string): Promise<NativeBillingPurchase>;
  restore(productId: string): Promise<NativeBillingPurchase[]>;
  disconnect(): Promise<void>;
  addListener(
    eventName: 'onPurchaseUpdated',
    listener: (purchase: NativeBillingPurchase) => void,
  ): EventSubscription;
};
