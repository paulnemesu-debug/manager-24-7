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
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';

import { useI18n } from '@/contexts/locale-context';
import { parseAuthLink } from '@/lib/auth-link';
import { deleteAccountAndCleanup, retryConfirmedAccountCleanup } from '@/lib/account-deletion-cleanup';
import { requestEmailCode, verifyEmailCode } from '@/lib/email-otp';
import { resetInstantDemo, seedInstantDemo } from '@/lib/instant-demo';
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
  const sessionGeneration = useRef(0);
  const acceptAuthEvents = useRef(true);
  const demoActive = useRef(false);

  useEffect(() => {
    const retry = () => { void retryConfirmedAccountCleanup(supabase).catch(() => undefined); };
    retry();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') retry();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (isDemoMode || !supabase) {
      setIsLoading(false);
      return;
    }

    let active = true;
    let authEventSeen = false;
    const generation = sessionGeneration.current;
    const loadingFallback = setTimeout(() => {
      if (active) setIsLoading(false);
    }, 5000);
    supabase.auth.getSession().then(({ data, error }) => {
      if (active && acceptAuthEvents.current && generation === sessionGeneration.current && !authEventSeen && !error) setSession(data.session);
    }).catch(() => undefined).finally(() => {
      clearTimeout(loadingFallback);
      if (active) setIsLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active || !acceptAuthEvents.current) return;
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
    const generation = ++sessionGeneration.current;
    const verifiedSession = await verifyEmailCode(client.auth, email, code);
    if (generation === sessionGeneration.current && !demoActive.current) {
      acceptAuthEvents.current = true;
      setSession(verifiedSession);
    }
    return verifiedSession;
  }, []);

  const verifyLink = useCallback(async (url: string) => {
    if (isDemoMode || demoActive.current) return;
    const client = requireClient();
    const parsed = parseAuthLink(url);
    if (!parsed) throw new Error('link-unreadable');
    if (parsed.kind === 'error') throw new Error(parsed.message);

    // Only a valid, explicitly opened link can resume Auth events after demo.
    const generation = ++sessionGeneration.current;
    const previousAcceptance = acceptAuthEvents.current;
    acceptAuthEvents.current = true;
    try {
      if (parsed.kind === 'session') {
        const { error } = await client.auth.setSession({
          access_token: parsed.accessToken,
          refresh_token: parsed.refreshToken,
        });
        if (error) throw error;
      } else if (parsed.kind === 'code') {
        const { error } = await client.auth.exchangeCodeForSession(parsed.code);
        if (error) throw error;
      } else {
        const { error } = await client.auth.verifyOtp({ token_hash: parsed.tokenHash, type: parsed.type });
        if (error) throw error;
      }
    } catch (error) {
      if (generation === sessionGeneration.current) acceptAuthEvents.current = previousAcceptance;
      throw error;
    }
  }, []);

  // Native email links use the same explicit-login boundary as pasted links.
  useEffect(() => {
    if (!supabase || isWeb || isDemoMode) return;
    const generation = sessionGeneration.current;
    const consume = async (url: string | null) => {
      if (!url || demoActive.current) return;
      await verifyLink(url).catch(() => undefined);
    };
    void Linking.getInitialURL().then(url => {
      // An initial URL resolved after demo started belongs to the old session.
      if (generation === sessionGeneration.current) return consume(url);
    }).catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({ url }) => void consume(url));
    return () => subscription.remove();
  }, [verifyLink]);

  const startDemo = useCallback(async () => {
    if (demoActive.current) return;
    // End the retained real session before the demo transport blocks HTTP.
    // scope:local leaves sessions on other devices and all workspace data intact.
    const generation = ++sessionGeneration.current;
    const previousAcceptance = acceptAuthEvents.current;
    acceptAuthEvents.current = false;
    try {
      if (supabase && !isDemoMode) {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) throw error;
      }
      if (generation !== sessionGeneration.current) return;
      setSession(null);
      await resetInstantDemo();
      await seedInstantDemo(locale);
      if (generation !== sessionGeneration.current) return;
      setInstantDemoIsolation(true);
      demoActive.current = true;
      setPublicDemo(true);
      setIsLoading(false);
    } catch (error) {
      if (generation === sessionGeneration.current) acceptAuthEvents.current = previousAcceptance;
      throw error;
    }
  }, [locale]);

  const signOut = useCallback(async () => {
    const generation = ++sessionGeneration.current;
    const previousAcceptance = acceptAuthEvents.current;
    acceptAuthEvents.current = false;
    if (demoActive.current) {
      // Entry already cleared the persisted session. No Auth HTTP is needed
      // while isolated, and late responses cannot restore the previous account.
      setSession(null);
      demoActive.current = false;
      setInstantDemoIsolation(false);
      setPublicDemo(false);
      return;
    }
    try {
      if (supabase && !isDemoMode) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        if (generation === sessionGeneration.current) setSession(null);
      }
    } catch (error) {
      if (generation === sessionGeneration.current) acceptAuthEvents.current = previousAcceptance;
      throw error;
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    if (isDemoMode || publicDemo) return;
    const userId = session?.user.id;
    if (!userId) throw new Error('missing-session');
    await deleteAccountAndCleanup(requireClient(), userId, () => {
      setSession(current => current?.user.id === userId ? null : current);
    }, locale);
  }, [locale, publicDemo, session?.user.id]);

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
