import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useSubscription } from '@/contexts/subscription-context';
import { useI18n } from '@/contexts/locale-context';
import { completeTrialRegistration, getTrialRegistration, TRIAL_PRODUCT_ID, type TrialRegistration } from '@/lib/trial-registration';
import type { Locale } from '@/i18n/translations';
import { seedIndividualTrial } from '@/lib/trial-seed';
import { supabase } from '@/lib/supabase';
type TrialContextValue = { registration: TrialRegistration | null; isLoading: boolean; error: boolean; reload: () => Promise<void>; complete: (restaurant: string, accepted: boolean, locale: Locale) => Promise<void> };
const TrialContext = createContext<TrialContextValue | null>(null);
const bypass: TrialRegistration = { registered: false, eligible: false, restaurant_name: null, started_at: null, expires_at: null, registered_at: null, last_sign_in_at: null, location_id: null, terms_version: null, privacy_version: null, marketing_opt_in: false };

export function TrialRegistrationProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const subscription = useSubscription();
  const paid = subscription.isAdmin || (subscription.hasAccess
    && ![TRIAL_PRODUCT_ID, 'manager247_demo_10d', 'manager247_trial_14d'].includes(subscription.productId ?? ''));
  // Remount before descendants can see any prior account's registration.
  return <TrialSessionProvider key={`${auth.user?.id ?? 'anonymous'}:${auth.isDemo}:${paid}`} bypassRegistration={paid || auth.isDemo}>
    {children}
  </TrialSessionProvider>;
}

function TrialSessionProvider({ children, bypassRegistration }: PropsWithChildren<{ bypassRegistration: boolean }>) {
  const { user, isAuthenticated } = useAuth();
  const subscription = useSubscription();
  const { locale } = useI18n();
  const [registration, setRegistration] = useState<TrialRegistration | null>(bypassRegistration ? bypass : null);
  const [isLoading, setLoading] = useState(!bypassRegistration && isAuthenticated);
  const [error, setError] = useState(false);
  const alive = useRef(true);
  const generation = useRef(0);
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const prepareSamples = useCallback(async (record: TrialRegistration, current: () => boolean, sampleLocale: Locale) => {
    if (!record.registered || !record.eligible || !user || !supabase
      || Date.parse(record.expires_at ?? '') <= Date.now() || !current()) return;
    // A different device may already contain real or edited cloud data. Never
    // introduce new examples into any of those modules when one is populated.
    const tables = ['hr_employees', 'hr_shifts', 'hr_lifecycle', 'operational_documents', 'pnl_reports', 'stock_policies', 'supplier_orders', 'waste_entries', 'inventory_schedules'];
    const results = await Promise.all(tables.map((table) => supabase!.from(table).select('user_id').eq('user_id', user.id).limit(1)));
    if (!current()) return;
    if (results.some((result) => result.error)) throw new Error('trial-samples-unavailable');
    if (results.some((result) => result.data?.length)) return;
    await seedIndividualTrial(user.id, sampleLocale, current);
  }, [user]);

  const reload = useCallback(async () => {
    if (bypassRegistration || !isAuthenticated || !user) {
      if (alive.current) { setRegistration(bypass); setLoading(false); setError(false); }
      return;
    }
    if (subscription.isLoading) return;
    const sequence = ++generation.current;
    const current = () => alive.current && generation.current === sequence;
    setLoading(true); setError(false);
    try {
      if (!supabase) throw new Error('not-configured');
      const record = await getTrialRegistration(supabase);
      if (!current()) return;
      await prepareSamples(record, current, locale);
      if (current()) setRegistration(record);
    } catch {
      if (current()) { setRegistration(null); setError(true); }
    } finally { if (current()) setLoading(false); }
  }, [bypassRegistration, isAuthenticated, locale, prepareSamples, subscription.isLoading, user]);
  useEffect(() => { void reload(); }, [reload]);

  const complete = useCallback(async (restaurant: string, accepted: boolean, selectedLocale: Locale) => {
    if (!supabase || !user || bypassRegistration) throw new Error('trial-registration-unavailable');
    const sequence = ++generation.current;
    const current = () => alive.current && generation.current === sequence;
    const record = await completeTrialRegistration(supabase, restaurant, accepted, selectedLocale);
    if (!current()) return;
    await prepareSamples(record, current, selectedLocale);
    if (!current()) return;
    // Refresh the server entitlement before releasing the registration gate.
    await subscription.refresh();
    if (current()) { setRegistration(record); setError(false); setLoading(false); }
  }, [bypassRegistration, prepareSamples, subscription, user]);
  const value = useMemo(() => ({ registration, isLoading, error, reload, complete }), [registration, isLoading, error, reload, complete]);
  return <TrialContext.Provider value={value}>{children}</TrialContext.Provider>;
}

export function useTrialRegistration() {
  const value = useContext(TrialContext);
  if (!value) throw new Error('TrialRegistrationProvider is missing');
  return value;
}
