import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { AppButton, Body, BrandHeader, Card, Field, LoadingState, Screen, Title } from '@/components/ui';
import { Brand, Fonts, Radius } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { useTrialRegistration } from '@/contexts/trial-registration-context';
import { trialLegalUrl } from '@/lib/trial-registration';

export default function TrialRegistrationScreen() {
  const auth = useAuth();
  if (auth.isLoading) return <Screen><LoadingState /></Screen>;
  if (!auth.isAuthenticated || !auth.user) return <Redirect href="/sign-in" />;
  return <RegistrationForm key={auth.user.id} />;
}

function RegistrationForm() {
  const auth = useAuth();
  const trial = useTrialRegistration();
  const { locale } = useI18n();
  const ro = locale === 'ro';
  const [restaurant, setRestaurant] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [linkFailed, setLinkFailed] = useState(false);
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const openLegal = async (kind: 'terms' | 'privacy') => {
    try {
      setLinkFailed(false);
      const url = trialLegalUrl(kind, locale);
      if (Platform.OS === 'web') await Linking.openURL(url);
      else await WebBrowser.openBrowserAsync(url);
    } catch { if (active.current) setLinkFailed(true); }
  };
  if (trial.isLoading) return <Screen><LoadingState /></Screen>;
  if (trial.error || !trial.registration) return (
    <Screen><BrandHeader compact /><Card>
      <Body>{ro ? 'Înregistrarea nu a putut fi verificată. Conectează-te la internet și reîncearcă.' : 'Registration could not be verified. Connect to the internet and try again.'}</Body>
      <AppButton label={ro ? 'Reîncearcă' : 'Retry'} onPress={() => void trial.reload()} />
      <AppButton label={ro ? 'Deconectare' : 'Sign out'} variant="ghost" onPress={() => void auth.signOut()} />
    </Card></Screen>
  );
  if (trial.registration.registered || !trial.registration.eligible) return <Redirect href="/" />;
  const date = (value: string | null) => value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString(ro ? 'ro-RO' : 'en-GB') : '—';
  const submit = async () => {
    if (pending.current || !restaurant.trim() || restaurant.trim().length > 120 || !accepted) return;
    pending.current = true; setBusy(true); setFailed(false);
    try { await trial.complete(restaurant, accepted, locale); }
    catch { if (active.current) setFailed(true); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  };
  return (
    <Screen bottomSafeArea forceLight>
      <BrandHeader compact />
      <Title>{ro ? 'Trialul tău de 10 zile' : 'Your 10-day trial'}</Title>
      <Body>{ro ? 'Acces individual, fără card și fără reînnoire sau debitare automată.' : 'Individual access, no card and no automatic renewal or charges.'}</Body>
      <Card>
        <Text selectable style={styles.email}>{auth.user?.email}</Text>
        <Body>{ro ? 'Cele 10 zile au început la prima autentificare verificată. Un cod nou sau o nouă autentificare nu schimbă expirarea.' : 'Your 10 days began at your first verified sign-in. Another code or sign-in does not change the expiry.'}</Body>
        <Body>{`${ro ? 'Început' : 'Started'}: ${date(trial.registration.started_at)}`}</Body>
        <Body>{`${ro ? 'Expiră' : 'Expires'}: ${date(trial.registration.expires_at)}`}</Body>
      </Card>
      <Card>
        <Field label={ro ? 'Denumirea restaurantului' : 'Restaurant name'} value={restaurant} onChangeText={setRestaurant} editable={!busy} maxLength={120} autoCapitalize="words" />
        <Body>{ro ? 'Vei lucra într-un mediu demonstrativ separat, cu date fictive. Nu introduce date personale reale despre angajați, clienți sau alte persoane.' : 'You will use a separate demonstration workspace containing fictional data. Do not enter real personal information about employees, customers or other people.'}</Body>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted, disabled: busy }} disabled={busy} onPress={() => setAccepted(value => !value)} style={styles.checkboxRow}>
          <View style={[styles.checkbox, accepted && styles.checked]}><Text style={styles.checkmark}>{accepted ? '✓' : ''}</Text></View>
          <Text style={styles.legal}>{ro ? 'Accept Termenii trialului Manager24/7.' : 'I accept the Manager24/7 Trial Terms.'}</Text>
        </Pressable>
        <AppButton label={ro ? 'Citește Termenii trialului' : 'Read the Trial Terms'} variant="ghost" onPress={() => void openLegal('terms')} />
        <Text style={styles.legal}>{ro ? 'Am luat cunoștință de Informarea privind confidențialitatea, inclusiv de administrarea trialului și notificarea internă a activării sale.' : 'I acknowledge the Privacy Notice, including trial administration and the internal notification of its activation.'}</Text>
        <AppButton label={ro ? 'Citește Informarea privind confidențialitatea' : 'Read the Privacy Notice'} variant="ghost" onPress={() => void openLegal('privacy')} />
        {(failed || linkFailed) && <Text accessibilityRole="alert" style={styles.error}>{linkFailed
          ? (ro ? 'Documentul nu a putut fi deschis. Verifică legătura la internet.' : 'The document could not be opened. Check your internet connection.')
          : (ro ? 'Nu am putut finaliza înregistrarea. Datele și expirarea rămân păstrate; poți reîncerca.' : 'Registration could not be completed. Your details and expiry are preserved; you can retry.')}</Text>}
        <AppButton label={ro ? 'Deschide trialul meu' : 'Open my trial'} icon="arrow-forward" fullWidth loading={busy} disabled={!restaurant.trim() || !accepted || busy} onPress={() => void submit()} />
      </Card>
      <AppButton label={ro ? 'Deconectare' : 'Sign out'} variant="ghost" onPress={() => void auth.signOut()} />
    </Screen>
  );
}
const styles = StyleSheet.create({
  email: { color: Brand.navyDeep, fontFamily: Fonts.bold, fontSize: 16 },
  legal: { color: Brand.navyDeep, fontFamily: Fonts.regular, fontSize: 13, lineHeight: 20, flexShrink: 1 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  checkbox: { width: 25, height: 25, borderRadius: Radius.small, borderWidth: 2, borderColor: Brand.teal, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: Brand.teal },
  checkmark: { color: '#FFFFFF', fontSize: 17 },
  error: { color: Brand.red, fontSize: 13, lineHeight: 20 },
});
