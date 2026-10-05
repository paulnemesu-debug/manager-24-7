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
  useRef,
  useState,
} from 'react';

import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { createFormatters, type CurrencyCode, type Formatters } from '@/lib/format';
import {
  DEFAULT_ACCOUNT_PREFERENCES,
  fetchPreferences,
  loadCachedPreferences,
  savePreferences,
  type AccountPreferences,
} from '@/lib/preferences-repository';

type PreferencesContextValue = AccountPreferences & {
  format: Formatters;
  isReady: boolean;
  isPendingSync: boolean;
  setCurrency: (currency: CurrencyCode) => void;
  setDefaultVatPercent: (value: number) => void;
  retrySync: () => Promise<void>;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const { locale } = useI18n();
  const userId = auth.user?.id ?? (auth.isDemo ? 'demo' : null);
  const [preferences, setPreferences] = useState(DEFAULT_ACCOUNT_PREFERENCES);
  const preferencesRef = useRef(DEFAULT_ACCOUNT_PREFERENCES);
  const [isReady, setIsReady] = useState(false);
  const [isPendingSync, setIsPendingSync] = useState(false);

  const sync = useCallback(async (next: AccountPreferences) => {
    if (!userId) return;
    setIsPendingSync(true);
    try {
      const saved = await savePreferences(userId, next);
      preferencesRef.current = saved;
      setPreferences(saved);
      setIsPendingSync(false);
    } catch {
      // Preferința rămâne aplicată și salvată local; va fi retrimisă la pornire.
      setIsPendingSync(true);
    }
  }, [userId]);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setPreferences(DEFAULT_ACCOUNT_PREFERENCES);
      setIsPendingSync(false);
      setIsReady(true);
      return () => { cancelled = true; };
    }

    setIsReady(false);
    void loadCachedPreferences(userId).then(async (cached) => {
      if (cancelled) return;
      if (cached) {
        setPreferences(cached.preferences);
        setIsPendingSync(cached.pending);
      }
      try {
        if (cached?.pending) {
          const saved = await savePreferences(userId, cached.preferences);
          if (!cancelled) {
            setPreferences(saved);
            setIsPendingSync(false);
          }
        } else {
          const remote = await fetchPreferences(userId);
          if (!cancelled) setPreferences(remote);
        }
      } catch {
        if (!cancelled && cached) setIsPendingSync(cached.pending);
      } finally {
        if (!cancelled) setIsReady(true);
      }
    });
    return () => { cancelled = true; };
  }, [userId]);

  const update = useCallback((change: Partial<AccountPreferences>) => {
    const next = { ...preferencesRef.current, ...change };
    preferencesRef.current = next;
    setPreferences(next);
    void sync(next);
  }, [sync]);

  const value = useMemo<PreferencesContextValue>(() => ({
    ...preferences,
    format: createFormatters(locale, preferences.currency),
    isReady,
    isPendingSync,
    setCurrency: (currency) => update({ currency }),
    setDefaultVatPercent: (defaultVatPercent) => update({
      defaultVatPercent: Math.min(100, Math.max(0, defaultVatPercent)),
    }),
    retrySync: () => sync(preferences),
  }), [isPendingSync, isReady, locale, preferences, sync, update]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences trebuie folosit în PreferencesProvider');
  return context;
}
