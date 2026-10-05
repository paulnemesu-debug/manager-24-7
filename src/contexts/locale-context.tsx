/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
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

import {
  type Locale,
  SUPPORTED_LOCALES,
  type TranslationKey,
  translate,
} from '@/i18n/translations';
import { createFormatters, type Formatters } from '@/lib/format';

const STORAGE_KEY = 'professional_foodcost.locale.v1';

function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Produsul se adresează întâi pieței din România, deci româna este limba
 * implicită atât pentru un dispozitiv setat pe română, cât și pentru unul
 * setat pe altă limbă, dar cu regiunea România (de exemplu `en-RO`).
 * Restul pornesc în engleză și pot comuta din steagurile de lângă siglă.
 */
export function detectDeviceLocale(): Locale {
  try {
    const resolved = (new Intl.DateTimeFormat().resolvedOptions().locale ?? '').toLowerCase();
    if (resolved.startsWith('ro')) return 'ro';
    if (resolved.endsWith('-ro') || resolved.includes('-ro-')) return 'ro';
    return resolved ? 'en' : 'ro';
  } catch {
    return 'ro';
  }
}

type LocaleContextValue = {
  locale: Locale;
  isReady: boolean;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  format: Formatters;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: PropsWithChildren) {
  // Primul randare folosește româna pe orice platformă. Pe web, pagina este
  // generată static pe server, iar o limbă dedusă din dispozitiv ar diferi de
  // cea a serverului și ar strica hidratarea. Limba reală se aplică imediat
  // după montare, din preferința salvată sau din setările dispozitivului.
  const [locale, setLocaleState] = useState<Locale>('ro');
  const [isReady, setIsReady] = useState(false);
  const chosenThisSession = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled || chosenThisSession.current) return;
        setLocaleState(isLocale(stored) ? stored : detectDeviceLocale());
      })
      .catch(() => {
        if (!cancelled && !chosenThisSession.current) setLocaleState(detectDeviceLocale());
      })
      .finally(() => {
        if (!cancelled) setIsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    chosenThisSession.current = true;
    setLocaleState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    isReady,
    setLocale,
    t: (key, params) => translate(locale, key, params),
    format: createFormatters(locale),
  }), [isReady, locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useI18n trebuie folosit în LocaleProvider');
  return context;
}
