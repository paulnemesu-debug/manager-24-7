import { useI18n } from '@/contexts/locale-context';
import { operationalErrorMessage } from '@/lib/operational-sync';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';

/** Refresh only while focused; discard results from a previous account or screen. */
export function useOperationalResource<T>(load: () => Promise<T>) {
  const { locale } = useI18n();
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const refreshRef = useRef<() => void>(() => undefined);
  useFocusEffect(useCallback(() => {
    let active = true;
    let running = false;
    setState({ data: null, error: null, loading: true });
    const refresh = async () => {
      if (!active || running) return;
      running = true;
      try {
        const data = await load();
        if (active) setState({ data, error: null, loading: false });
      } catch (error) {
        if (active) setState((current) => ({ ...current, loading: false, error: operationalErrorMessage(error, locale, 'operational.sync.loadError') }));
      } finally { running = false; }
    };
    refreshRef.current = () => { void refresh(); };
    void refresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 30_000);
    const listener = AppState.addEventListener('change', (status) => { if (status === 'active') void refresh(); });
    return () => { active = false; refreshRef.current = () => undefined; clearInterval(timer); listener.remove(); };
  }, [load, locale]));
  return { ...state, refresh: useCallback(() => refreshRef.current(), []) };
}
