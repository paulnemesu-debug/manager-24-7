/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { LoadingState, Screen } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { useSubscription } from '@/contexts/subscription-context';
import { hasCompletedOnboarding } from '@/lib/onboarding';

export default function IndexScreen() {
  const router = useRouter();
  const auth = useAuth();
  const subscription = useSubscription();
  const { t } = useI18n();
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!auth.isAuthenticated) {
      setOnboardingDone(null);
      return () => { cancelled = true; };
    }
    void hasCompletedOnboarding(auth.user?.id ?? 'demo').then((done) => {
      if (!cancelled) setOnboardingDone(done);
    });
    return () => { cancelled = true; };
  }, [auth.isAuthenticated, auth.user?.id]);

  useEffect(() => {
    if (auth.isLoading) return;
    if (!auth.isAuthenticated) {
      router.replace('/sign-in');
      return;
    }
    if (auth.isDemo) { router.replace('/(app)'); return; }
    if (subscription.isLoading || onboardingDone === null) return;
    if (!subscription.hasAccess) {
      router.replace('/paywall');
      return;
    }
    router.replace(onboardingDone ? '/(app)' : '/onboarding');
  }, [auth.isAuthenticated, auth.isDemo, auth.isLoading, onboardingDone, router, subscription.hasAccess, subscription.isLoading]);

  return (
    <Screen scroll={false} forceLight>
      <LoadingState label={t('boot.loading')} />
    </Screen>
  );
}