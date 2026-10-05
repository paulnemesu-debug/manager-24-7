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
import { extendOtpDemoAccess, isOtpDemoAccount } from '@/lib/demo-access';
import {
  hasEntitlementAccess,
  isEntitlementLeaseValid,
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

      // Contul demo nu primește acces permanent. După expirare, doar o sesiune
      // creată cu un OTP de email proaspăt poate consuma încă trei zile.
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
          // Un token vechi nu prelungește accesul. Continuăm cu răspunsul
          // inițial, iar utilizatorul rămâne pe ecranul de acces expirat.
        }
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

  const leaseValid = isDemoMode || isDemo || isEntitlementLeaseValid(snapshot);
  // Acces beta 1.0: plățile sunt amânate până la configurarea companiei.
  // Păstrăm citirea abonamentului pentru compatibilitate, fără a bloca produsul.
  const isPro = isDemoMode || isDemo || (leaseValid && snapshot.serverAllowed);

  const value = useMemo<SubscriptionContextValue>(() => ({
    status: snapshot.status,
    isAdmin: snapshot.isAdmin,
    plan: isPro ? 'pro' : 'free',
    hasAccess: isDemoMode || isDemo || hasEntitlementAccess(snapshot),
    isLoading,
    productId: snapshot.productId,
    periodEnd: snapshot.periodEnd,
    isViewer: snapshot.isViewer,
    refresh,
  }), [isDemo, isLoading, isPro, refresh, snapshot]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error('useSubscription trebuie folosit în SubscriptionProvider');
  return context;
}
