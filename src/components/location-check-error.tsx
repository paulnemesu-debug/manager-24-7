import { useState } from 'react';
import { Alert } from 'react-native';

import { AppButton, Body, Card, Screen, SectionHeader } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';

export function LocationCheckError({ onRetry }: { onRetry: () => void }) {
  const auth = useAuth();
  const { locale } = useI18n();
  const [signingOut, setSigningOut] = useState(false);
  const ro = locale === 'ro';

  const signOut = async () => {
    setSigningOut(true);
    try {
      await auth.signOut();
    } catch {
      Alert.alert(ro ? 'Deconectarea nu a reușit' : 'Could not sign out', ro ? 'Încearcă din nou.' : 'Try again.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Screen bottomSafeArea>
      <Card tone="soft">
        <SectionHeader title={ro ? 'Nu am putut verifica locația' : 'Could not verify your location'} />
        <Body>{ro
          ? 'Verifică conexiunea la internet și reîncearcă pentru a continua cu locația contului tău.'
          : 'Check your internet connection and retry to continue with your account location.'}</Body>
        <AppButton label={ro ? 'Reîncearcă' : 'Retry'} icon="refresh-outline" fullWidth disabled={signingOut} onPress={onRetry} />
        <AppButton label={ro ? 'Deconectare' : 'Sign out'} variant="ghost" fullWidth loading={signingOut} onPress={() => void signOut()} />
      </Card>
    </Screen>
  );
}
