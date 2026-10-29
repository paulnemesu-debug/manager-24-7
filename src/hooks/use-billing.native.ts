/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import Constants from 'expo-constants';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';

import type { Manager247BillingModule } from '../../modules/manager247-billing';
import { IS_PLAY_STORE_BUILD } from '@/constants/paradim';
import { useSubscription } from '@/contexts/subscription-context';
import type { BillingState } from '@/hooks/billing-types';
import {
  BillingFlowError,
  createGooglePlayBillingController,
  createGooglePlayNativeGateway,
  verifyGooglePlayPurchase,
} from '@/lib/google-play-billing';
import { supabase } from '@/lib/supabase';

const PURCHASE_ERROR = 'Achiziția nu a putut fi finalizată în siguranță. Încearcă din nou.';
const RESTORE_ERROR = 'Restaurarea nu a putut fi finalizată. Încearcă din nou.';
const CONNECTION_ERROR = 'Google Play nu este disponibil momentan. Încearcă din nou.';

let nativeModulePromise: Promise<Manager247BillingModule> | null = null;

function loadNativeModule() {
  nativeModulePromise ??= import('../../modules/manager247-billing')
    .then((module) => module.default);
  return nativeModulePromise;
}

type BillingController = ReturnType<typeof createGooglePlayBillingController>;
const BillingContext = createContext<BillingState | null>(null);

function useBillingController(): BillingState {
  const { refresh: refreshEntitlement } = useSubscription();
  const productId = process.env.EXPO_PUBLIC_GOOGLE_PLAY_SUBSCRIPTION_ID?.trim() ?? '';
  const basePlanId = process.env.EXPO_PUBLIC_GOOGLE_PLAY_BASE_PLAN_ID?.trim() || undefined;
  const packageName = Constants.expoConfig?.android?.package?.trim() ?? '';
  const configured = IS_PLAY_STORE_BUILD
    && Boolean(productId)
    && Boolean(packageName)
    && Boolean(supabase);
  const controllerRef = useRef<BillingController | null>(null);
  const [connected, setConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [displayPrice, setDisplayPrice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    IS_PLAY_STORE_BUILD && !productId ? 'Produsul Google Play nu este configurat.' : null,
  );

  useEffect(() => {
    const client = supabase;
    if (!configured || !client) return;
    let active = true;
    let controller: BillingController | null = null;
    setIsLoading(true);
    setError(null);

    void Promise.all([loadNativeModule(), client.auth.getUser()])
      .then(async ([native, userResult]) => {
        if (!active) return;
        if (userResult.error || !userResult.data.user) throw new Error('missing-user');
        const gateway = createGooglePlayNativeGateway(
          native,
          productId,
          userResult.data.user.id,
        );
        controller = createGooglePlayBillingController({
          native: gateway,
          productId,
          packageName,
          userId: userResult.data.user.id,
          basePlanId,
          verifyPurchase: (payload) => verifyGooglePlayPurchase(
            (name, options) => client.functions.invoke(name, options) as Promise<{
              data: { valid?: boolean } | null;
              error: unknown;
            }>,
            payload,
          ),
          refreshEntitlement,
          onError: () => {
            if (active) setError(RESTORE_ERROR);
          },
        });
        controllerRef.current = controller;
        const offer = await controller.initialize();
        if (!active) return;
        setDisplayPrice(offer.formattedPrice);
        setConnected(true);
      })
      .catch(() => {
        if (active) {
          controllerRef.current = null;
          setConnected(false);
          setError(CONNECTION_ERROR);
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      controller?.dispose();
      controllerRef.current = null;
    };
  }, [basePlanId, configured, packageName, productId, refreshEntitlement]);

  useEffect(() => {
    if (!configured) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const controller = controllerRef.current;
      if (!controller) return;
      void controller.reconcile().catch(() => setError(RESTORE_ERROR));
    });
    return () => subscription.remove();
  }, [configured]);

  const buy = useCallback(async () => {
    const controller = controllerRef.current;
    if (!configured || !controller) throw new BillingFlowError(CONNECTION_ERROR);
    setIsLoading(true);
    setError(null);
    try {
      await controller.buy();
    } catch {
      setError(PURCHASE_ERROR);
      throw new BillingFlowError(PURCHASE_ERROR);
    } finally {
      setIsLoading(false);
    }
  }, [configured]);

  const restore = useCallback(async () => {
    const controller = controllerRef.current;
    if (!configured || !controller) throw new BillingFlowError(CONNECTION_ERROR);
    setIsLoading(true);
    setError(null);
    try {
      await controller.restore();
    } catch {
      setError(RESTORE_ERROR);
      throw new BillingFlowError(RESTORE_ERROR);
    } finally {
      setIsLoading(false);
    }
  }, [configured]);

  return {
    configured,
    connected,
    isLoading,
    displayPrice,
    error,
    buy,
    restore,
  };
}

export function BillingProvider({ children }: PropsWithChildren) {
  const value = useBillingController();
  return createElement(BillingContext.Provider, { value }, children);
}

export function useBilling(): BillingState {
  const value = useContext(BillingContext);
  if (!value) throw new Error('billing_provider_missing');
  return value;
}
