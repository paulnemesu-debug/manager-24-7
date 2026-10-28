import { Redirect, usePathname } from 'expo-router';
import type { PropsWithChildren } from 'react';

import { LoadingState, Screen } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useSubscription } from '@/contexts/subscription-context';

/** Protect direct/deep links before an operational screen or its effects mount. */
export function OperationalAccessBoundary({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const auth = useAuth();
  const subscription = useSubscription();
  const operational = /^\/(?:tools|recipe|ingredient)(?:\/|$)/.test(pathname);
  if (!operational) return children;
  if (auth.isLoading || subscription.isLoading) return <Screen scroll={false}><LoadingState /></Screen>;
  if (!auth.isAuthenticated) return <Redirect href="/sign-in" />;
  if (!subscription.hasAccess) return <Redirect href="/paywall" />;
  return children;
}
