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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAuth } from '@/contexts/auth-context';
import { DEMO_SUBSCRIPTION_PRODUCT_ID } from '@/lib/demo-access';
import { TRIAL_PRODUCT_ID } from '@/lib/trial-registration';
import {
  hasEntitlementAccess,
  OFFLINE_ENTITLEMENT_DAYS,
  readEntitlementSnapshot,
  type EntitlementSnapshot,
  writeEntitlementSnapshot,
} from '@/lib/subscription-cache';
import { isDemoMode, supabase } from '@/lib/supabase';
import { withStorageLock } from '@/lib/storage-lock';

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

function createSubscriptionScope(key: string) {
  let active = true;
  let generation = 0;
  return { key, isActive: () => active, currentGeneration: () => generation,
    isCurrent: (expected: number) => active && generation === expected,
    activate: () => { active = true; },
    deactivate: () => { active = false; generation += 1; } };
}

export function SubscriptionProvider({ children }: PropsWithChildren) {
  const { user, isAuthenticated, isDemo } = useAuth();
  const scope = useMemo(() => createSubscriptionScope(`${user?.id ?? 'anonymous'}:${isAuthenticated}:${isDemo}`),
    [user?.id, isAuthenticated, isDemo]);
  useLayoutEffect(() => {
    scope.activate();
    return scope.deactivate;
  }, [scope]);

  // Remount before children can observe the previous account's entitlement.
  return <SubscriptionSessionProvider key={scope.key} scope={scope}>
    {children}
  </SubscriptionSessionProvider>;
}

function SubscriptionSessionProvider({ children, scope }: PropsWithChildren<{
  scope: ReturnType<typeof createSubscriptionScope>;
}>) {
  const { user, isAuthenticated, isDemo } = useAuth();
  const refreshSequence = useRef(0);
  const validatedSnapshot = useRef<{ sequence: number; snapshot: EntitlementSnapshot } | null>(null);
  const [snapshot, setSnapshot] = useState<EntitlementSnapshot>(isDemoMode ? {
    ...EMPTY_SNAPSHOT,
    status: 'active',
    productId: 'demo_professional',
    checkedAt: new Date().toISOString(),
  } : EMPTY_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(!isDemoMode);
  const [expiryTick, setExpiryTick] = useState(0);

  const refresh = useCallback(async () => {
    if (!scope.isActive()) return;
    const scopeGeneration = scope.currentGeneration();
    const sequence = ++refreshSequence.current;
    const isCurrent = () => scope.isCurrent(scopeGeneration)
      && refreshSequence.current === sequence;
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
    if (!isCurrent()) return;
    // An older disk grant cannot replace a server denial, even if saving it failed.
    const fallback = validatedSnapshot.current?.snapshot ?? cached;
    if (fallback) {
      setSnapshot(fallback);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    const persist = (next: EntitlementSnapshot) => withStorageLock(`entitlement:${user.id}`, async () => {
      // Starting another refresh does not invalidate the last accepted server result.
      if (scope.isCurrent(scopeGeneration) && validatedSnapshot.current?.sequence === sequence) {
        await writeEntitlementSnapshot(user.id, next);
      }
    });

    try {
      // Rolul din profil este sursa de adevăr pentru accesul de administrator;
      // el este acordat pe server și nu poate fi modificat din aplicație.
      const [accessResult, subscriptionResult] = await Promise.all([
        supabase.rpc('has_professional_access'),
        supabase
          .from('subscriptions')
          .select('status, product_id, current_period_end')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);
      if (!isCurrent()) return;

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
        validatedSnapshot.current = { sequence, snapshot: denied };
        setSnapshot(denied);
        await persist(denied);
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
      if (!isCurrent()) return;

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
      validatedSnapshot.current = { sequence, snapshot: next };
      setSnapshot(next);
      await persist(next);
    } catch {
      // Fără internet păstrăm ultima validare locală; lease-ul de 7 zile
      // împiedică transformarea cache-ului într-un acces permanent.
      if (isCurrent() && !fallback && !validatedSnapshot.current) setSnapshot(EMPTY_SNAPSHOT);
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [isDemo, user, scope]);

  useEffect(() => {
    if (isAuthenticated) {
      // Evită un ecran de încărcare infinit; accesul rămâne însă condiționat
      // de ultima validare server și de lease-ul offline limitat.
      const generation = scope.currentGeneration();
      const loadingFallback = setTimeout(() => {
        if (scope.isCurrent(generation)) setIsLoading(false);
      }, 6000);
      void refresh().finally(() => clearTimeout(loadingFallback));
      return () => clearTimeout(loadingFallback);
    } else {
      setSnapshot(EMPTY_SNAPSHOT);
      setIsLoading(false);
    }
  }, [isAuthenticated, refresh, scope]);

  const hasAccess = isDemoMode || isDemo || hasEntitlementAccess(snapshot);

  useEffect(() => {
    if (isDemoMode || isDemo || !isAuthenticated
      || ![DEMO_SUBSCRIPTION_PRODUCT_ID, TRIAL_PRODUCT_ID].includes(snapshot.productId ?? '')) return;
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
