/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useAuth } from '@/contexts/auth-context';
import { DEMO_SUBSCRIPTION_PRODUCT_ID, extendOtpDemoAccess, isOtpDemoAccount } from '@/lib/demo-access';
import {
  hasEntitlementAccess,
  OFFLINE_ENTITLEMENT_DAYS,
  readEntitlementSnapshot,
  type EntitlementSnapshot,
  writeEntitlementSnapshot,
} from '@/lib/subscription-cache';
import { isDemoMode, supabase } from '@/lib/supabase';

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'grace_period'
  | 'paused'
  | 'canceled'
  | 'expired'
  | 'refunded'
  | 'none';

type SubscriptionContextValue = {
  status: SubscriptionStatus;
  /** Cont de administrator: acces complet, fără abonament și fără expirare. */
  isAdmin: boolean;
  /** Planul curent. Fișele exportate pe planul gratuit poartă filigran. */
  plan: 'free' | 'pro';
  hasAccess: boolean;
  isLoading: boolean;
  productId: string | null;
  periodEnd: string | null;
  /** Membru al echipei altcuiva, cu acces doar de citire — nu poate edita. */
  isViewer: boolean;
  refresh: () => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

const EMPTY_SNAPSHOT: EntitlementSnapshot = {
  status: 'none',
  isAdmin: false,
  isViewer: false,
  productId: null,
  periodEnd: null,
  checkedAt: '1970-01-01T00:00:00.000Z',
  serverAllowed: false,
};

export function SubscriptionProvider({ children }: PropsWithChildren) {
  const { user, isAuthenticated, isDemo } = useAuth();
  const [snapshot, setSnapshot] = useState<EntitlementSnapshot>(isDemoMode ? {
    ...EMPTY_SNAPSHOT,
    status: 'active',
    productId: 'demo_professional',
    checkedAt: new Date().toISOString(),
  } : EMPTY_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(!isDemoMode);
  const [expiryTick, setExpiryTick] = useState(0);

  const refresh = useCallback(async () => {
    if (isDemoMode || isDemo) {
      setSnapshot({
        ...EMPTY_SNAPSHOT,
        status: 'active',
        productId: 'demo_professional',
        checkedAt: new Date().toISOString(),
      });
      setIsLoading(false);
      return;
    }
    if (!supabase || !user) {
      setSnapshot(EMPTY_SNAPSHOT);
      setIsLoading(false);
      return;
    }

    const cached = await readEntitlementSnapshot(user.id).catch(() => null);
    if (cached) {
      setSnapshot(cached);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    try {
      // Rolul din profil este sursa de adevăr pentru accesul de administrator;
      // el este acordat pe server și nu poate fi modificat din aplicație.
      let [accessResult, subscriptionResult] = await Promise.all([
        supabase.rpc('has_professional_access'),
        supabase
          .from('subscriptions')
          .select('status, product_id, current_period_end')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      // Primul OTP de email proaspăt activează zece zile pentru contul demo.
      // Serverul păstrează aceeași dată de expirare la autentificările următoare.
      if (!accessResult.error && accessResult.data !== true && isOtpDemoAccount(user.email)) {
        try {
          await extendOtpDemoAccess(supabase);
          [accessResult, subscriptionResult] = await Promise.all([
            supabase.rpc('has_professional_access'),
            supabase
              .from('subscriptions')
              .select('status, product_id, current_period_end')
              .eq('user_id', user.id)
              .maybeSingle(),
          ]);
        } catch {
          // Un token vechi nu activează accesul. Continuăm cu răspunsul
          // inițial, iar utilizatorul rămâne pe ecranul de acces expirat.
        }
      }

      // An explicit server refusal is authoritative even when optional
      // profile/subscription metadata is unavailable. Persist it before those
      // reads so an old offline lease cannot restore the refused access.
      if (!accessResult.error && accessResult.data === false) {
        const denied: EntitlementSnapshot = {
          ...EMPTY_SNAPSHOT,
          status: (subscriptionResult.data?.status as SubscriptionStatus | undefined) ?? 'none',
          productId: subscriptionResult.data?.product_id ?? null,
          periodEnd: subscriptionResult.data?.current_period_end ?? null,
          checkedAt: new Date().toISOString(),
        };
        setSnapshot(denied);
        await writeEntitlementSnapshot(user.id, denied);
        return;
      }

      const [profileResult, membershipResult] = await Promise.all([
        supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle(),
        supabase
          .from('workspace_members')
          .select('id')
          .eq('member_user_id', user.id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle(),
      ]);

      if (accessResult.error || profileResult.error || subscriptionResult.error) {
        throw accessResult.error ?? profileResult.error ?? subscriptionResult.error;
      }

      const data = subscriptionResult.data;
      const next: EntitlementSnapshot = {
        status: (data?.status as SubscriptionStatus | undefined) ?? 'none',
        productId: data?.product_id ?? null,
        periodEnd: data?.current_period_end ?? null,
        isAdmin: profileResult.data?.role === 'admin',
        // O versiune de bază fără tabela de echipă rămâne compatibilă.
        isViewer: membershipResult.error ? false : Boolean(membershipResult.data),
        checkedAt: new Date().toISOString(),
        serverAllowed: accessResult.data === true,
      };
      setSnapshot(next);
      await writeEntitlementSnapshot(user.id, next);
    } catch {
      // Fără internet păstrăm ultima validare locală; lease-ul de 7 zile
      // împiedică transformarea cache-ului într-un acces permanent.
      if (!cached) setSnapshot(EMPTY_SNAPSHOT);
    } finally {
      setIsLoading(false);
    }
  }, [isDemo, user]);

  useEffect(() => {
    if (isAuthenticated) {
      // Evită un ecran de încărcare infinit; accesul rămâne însă condiționat
      // de ultima validare server și de lease-ul offline limitat.
      const loadingFallback = setTimeout(() => setIsLoading(false), 6000);
      void refresh().finally(() => clearTimeout(loadingFallback));
      return () => clearTimeout(loadingFallback);
    } else {
      setSnapshot(EMPTY_SNAPSHOT);
      setIsLoading(false);
    }
  }, [isAuthenticated, refresh]);

  const hasAccess = isDemoMode || isDemo || hasEntitlementAccess(snapshot);

  useEffect(() => {
    if (isDemoMode || isDemo || !isAuthenticated || snapshot.productId !== DEMO_SUBSCRIPTION_PRODUCT_ID) return;
    const periodEnd = new Date(snapshot.periodEnd ?? '').getTime();
    const checkedAt = new Date(snapshot.checkedAt).getTime();
    const leaseEnd = checkedAt + OFFLINE_ENTITLEMENT_DAYS * 24 * 60 * 60 * 1000 + 1;
    const remaining = Math.min(periodEnd, leaseEnd) - Date.now();
    if (!Number.isFinite(remaining)) return;
    if (remaining <= 0) {
      // Efectul poate începe chiar după limita văzută încă validă la randare.
      if (hasAccess) setExpiryTick((tick) => tick + 1);
      return;
    }

    // Un ecran lăsat deschis pierde accesul la aceeași limită ca un cache recitit.
    // Limita evită overflow-ul setTimeout pentru metadate cu o dată îndepărtată.
    const expiryTimer = setTimeout(() => setExpiryTick((tick) => tick + 1), Math.min(remaining, 2_147_483_647));
    return () => clearTimeout(expiryTimer);
  }, [expiryTick, hasAccess, isAuthenticated, isDemo, snapshot, user?.id]);

  const value = useMemo<SubscriptionContextValue>(() => ({
    status: snapshot.status,
    isAdmin: snapshot.isAdmin,
    plan: hasAccess ? 'pro' : 'free',
    hasAccess,
    isLoading,
    productId: snapshot.productId,
    periodEnd: snapshot.periodEnd,
    isViewer: snapshot.isViewer,
    refresh,
  }), [hasAccess, isLoading, refresh, snapshot]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error('useSubscription trebuie folosit în SubscriptionProvider');
  return context;
}
