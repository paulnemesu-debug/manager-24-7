import type { PropsWithChildren } from 'react';
import { Redirect, usePathname } from 'expo-router';
import { AppButton, Body, Card, LoadingState, Screen } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { useTrialRegistration } from '@/contexts/trial-registration-context';

export function TrialRegistrationBoundary({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const auth = useAuth();
  const trial = useTrialRegistration();
  const { locale } = useI18n();
  const ro = locale === 'ro';
  // Account export/deletion and the documents remain available even when
  // registration fails. Other routes cannot mount workspace effects early.
  if (/^\/(?:sign-in|auth\/callback|trial-registration|terms|privacy|account)(?:\/|$)/.test(pathname)
    || !auth.isAuthenticated || auth.isDemo) return children;
  if (auth.isLoading || trial.isLoading) return <Screen scroll={false}><LoadingState /></Screen>;
  if (trial.error || !trial.registration) return (
    <Screen><Card>
      <Body>{ro ? 'Nu putem verifica înregistrarea trialului. Reconectează-te la internet și încearcă din nou.' : 'We could not verify your trial registration. Connect to the internet and try again.'}</Body>
      <AppButton label={ro ? 'Reîncearcă' : 'Retry'} onPress={() => void trial.reload()} />
    </Card></Screen>
  );
  if (trial.registration.eligible && !trial.registration.registered) return <Redirect href="/trial-registration" />;
  return children;
}
