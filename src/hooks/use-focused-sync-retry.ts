import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { AppState } from 'react-native';

/** Retries existing idempotent repositories while visible, and when returning to the app. */
export function useFocusedSyncRetry(retry: () => Promise<unknown>) {
  useFocusEffect(useCallback(() => {
    let running = false;
    let active = true;
    const run = () => {
      if (!active || running || AppState.currentState !== 'active') return;
      running = true;
      void retry().catch(() => undefined).finally(() => { running = false; });
    };
    const timer = setInterval(run, 30_000);
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') run(); });
    return () => { active = false; clearInterval(timer); listener.remove(); };
  }, [retry]));
}
