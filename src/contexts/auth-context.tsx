/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';

import { useI18n } from '@/contexts/locale-context';
import { parseAuthLink } from '@/lib/auth-link';
import { requestEmailCode, verifyEmailCode } from '@/lib/email-otp';
import { resetInstantDemo } from '@/lib/instant-demo';
import { setInstantDemoIsolation } from '@/lib/demo-isolation';
import { isDemoMode, isSupabaseConfigured, isWeb, supabase } from '@/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isDemo: boolean;
  startDemo: () => Promise<void>;
  /**
   * Cere codul numeric. Formatul emailului și lungimea sunt configurate pe server,
   * în ambele șabloane Supabase (Magic Link și Confirm signup).
   */
  requestAccess: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<Session | null>;
  /**
   * Deschide sesiunea pornind de la linkul primit pe email, lipit ca text.
   * Folosit când emailul conține doar link, sau când linkul a fost cerut din
   * aplicație și deschis în browser, unde nu poate întoarce sesiunea.
   */
  verifyLink: (url: string) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Șterge definitiv contul și toate datele asociate (rețete, ingrediente,
   * abonament, profil). Ireversibil — cere confirmare explicită înainte de
   * apel. La final, sesiunea locală este golită.
   */
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function requireClient() {
  if (!supabase || !isSupabaseConfigured) throw new Error('not-configured');
  return supabase;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const { locale } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [publicDemo, setPublicDemo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isDemoMode || !supabase) {
      setIsLoading(false);
      return;
    }

    let active = true;
    let authEventSeen = false;
    const loadingFallback = setTimeout(() => {
      if (active) setIsLoading(false);
    }, 5000);
    supabase.auth.getSession().then(({ data, error }) => {
      if (active && !authEventSeen && !error) setSession(data.session);
    }).catch(() => undefined).finally(() => {
      clearTimeout(loadingFallback);
      if (active) setIsLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventSeen = true;
      clearTimeout(loadingFallback);
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      active = false;
      clearTimeout(loadingFallback);
      data.subscription.unsubscribe();
    };
  }, []);

  // Linkul din email deschis pe telefon revine în aplicație prin schema proprie.
  useEffect(() => {
    const client = supabase;
    if (!client || isWeb || isDemoMode) return;

    const consume = async (url: string | null) => {
      if (!url) return;
      const { queryParams } = Linking.parse(url);
      const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
      if (code) await client.auth.exchangeCodeForSession(code).catch(() => undefined);
    };

    void Linking.getInitialURL().then(consume).catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({ url }) => void consume(url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client || Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
    return () => subscription.remove();
  }, []);

  const requestAccess = useCallback(async (email: string) => {
    if (isDemoMode) return;
    const client = requireClient();
    await requestEmailCode(client.auth, email, locale);
  }, [locale]);

  const verifyCode = useCallback(async (email: string, code: string) => {
    if (isDemoMode) return null;
    const client = requireClient();
    const verifiedSession = await verifyEmailCode(client.auth, email, code);
    setSession(verifiedSession);
    return verifiedSession;
  }, []);

  const verifyLink = useCallback(async (url: string) => {
    if (isDemoMode) return;
    const client = requireClient();
    const parsed = parseAuthLink(url);

    if (!parsed) throw new Error('link-unreadable');
    if (parsed.kind === 'error') throw new Error(parsed.message);

    if (parsed.kind === 'session') {
      const { error } = await client.auth.setSession({
        access_token: parsed.accessToken,
        refresh_token: parsed.refreshToken,
      });
      if (error) throw error;
      return;
    }

    if (parsed.kind === 'code') {
      const { error } = await client.auth.exchangeCodeForSession(parsed.code);
      if (error) throw error;
      return;
    }

    const { error } = await client.auth.verifyOtp({
      token_hash: parsed.tokenHash,
      type: parsed.type,
    });
    if (error) throw error;
  }, []);

  const startDemo = useCallback(async () => {
    await resetInstantDemo();
    setInstantDemoIsolation(true);
    setPublicDemo(true);
    setIsLoading(false);
  }, []);

  const signOut = useCallback(async () => {
    if (publicDemo) { setInstantDemoIsolation(false); setPublicDemo(false); return; }
    if (supabase && !isDemoMode) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setSession(null);
    }
  }, [publicDemo]);

  const deleteAccount = useCallback(async () => {
    if (isDemoMode || publicDemo) return;
    const client = requireClient();
    const { data, error } = await client.functions.invoke<{ success: boolean; message?: string }>(
      'delete-account',
    );
    if (error) throw error;
    if (!data?.success) throw new Error(data?.message ?? 'delete-account-failed');
    await client.auth.signOut().catch(() => undefined);
    setSession(null);
  }, [publicDemo]);

  const value = useMemo<AuthContextValue>(() => ({
    session: publicDemo || isDemoMode ? null : session,
    user: publicDemo || isDemoMode ? null : session?.user ?? null,
    isLoading,
    isAuthenticated: isDemoMode || publicDemo || Boolean(session),
    isDemo: isDemoMode || publicDemo,
    startDemo,
    requestAccess,
    verifyCode,
    verifyLink,
    signOut,
    deleteAccount,
  }), [deleteAccount, isLoading, publicDemo, requestAccess, session, signOut, startDemo, verifyCode, verifyLink]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth trebuie folosit în AuthProvider');
  return context;
}
