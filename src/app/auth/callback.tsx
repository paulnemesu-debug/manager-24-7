/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { LoadingState, Screen } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { useMounted } from '@/hooks/use-mounted';

/**
 * Pagina pe care aterizează linkul de acces din email.
 * Clientul Supabase citește singur sesiunea din adresa paginii; noi doar
 * așteptăm până se termină și trimitem utilizatorul mai departe.
 */
export default function AuthCallbackScreen() {
  const auth = useAuth();
  const { t } = useI18n();
  const mounted = useMounted();
  const [waitedTooLong, setWaitedTooLong] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setWaitedTooLong(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  if (!mounted || (auth.isLoading && !waitedTooLong)) {
    return <Screen scroll={false}><LoadingState label={t('boot.loading')} /></Screen>;
  }

  return <Redirect href={auth.isAuthenticated ? '/' : '/sign-in'} />;
}
