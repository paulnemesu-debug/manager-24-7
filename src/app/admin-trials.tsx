import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, Body, BrandHeader, Card, LoadingState, Screen, Title } from '@/components/ui';
import { Brand, Fonts } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { useSubscription } from '@/contexts/subscription-context';
import { listAdminTrialUsers, TRIAL_USERS_PAGE_SIZE, type AdminTrialUser } from '@/lib/trial-admin';
import { supabase } from '@/lib/supabase';

export default function AdminTrialsScreen() {
  const auth = useAuth();
  const subscription = useSubscription();
  if (auth.isLoading || subscription.isLoading) return <Screen><LoadingState /></Screen>;
  if (!auth.isAuthenticated || !auth.user) return <Redirect href="/sign-in" />;
  if (auth.isDemo || !subscription.isAdmin) return <Redirect href="/account" />;
  // Remount before a new account can observe data from the previous administrator.
  return <TrialUsers key={auth.user.id} />;
}

function TrialUsers() {
  const { locale } = useI18n();
  const router = useRouter();
  const ro = locale === 'ro';
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [rows, setRows] = useState<AdminTrialUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    let active = true;
    const sequence = ++request.current;
    setRows([]);
    setFailed(false);
    setLoading(true);
    const fetchRows = async () => {
      try {
        if (!supabase) throw new Error('not-configured');
        const result = await listAdminTrialUsers(supabase, offset);
        if (active && sequence === request.current) setRows(result);
      } catch {
        if (active && sequence === request.current) setFailed(true);
      } finally {
        if (active && sequence === request.current) setLoading(false);
      }
    };
    void fetchRows();
    return () => { active = false; };
  }, [attempt, offset]);

  const date = (value: string | null) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return '—';
    return parsed.toLocaleString(ro ? 'ro-RO' : 'en-GB');
  };
  const status = (value: string) => {
    if (value === 'active') return ro ? 'Activ' : 'Active';
    if (value === 'expired') return ro ? 'Expirat' : 'Expired';
    if (value === 'pending_registration') return ro ? 'Înregistrare nefinalizată' : 'Registration pending';
    return value;
  };
  const goToPage = (nextOffset: number) => {
    // Hide the previous page in the same render as a navigation request.
    setRows([]);
    setLoading(true);
    setOffset(nextOffset);
  };

  return (
    <Screen bottomSafeArea>
      <BrandHeader compact />
      <Title>{ro ? 'Utilizatori trial' : 'Trial users'}</Title>
      <Body>{ro ? 'Adrese verificate și perioade de evaluare. Acces rezervat administratorului.' : 'Verified addresses and evaluation periods. Administrator access only.'}</Body>
      <View style={styles.actions}>
        <AppButton label={ro ? 'Contul meu' : 'My account'} variant="ghost" onPress={() => router.replace('/account')} />
        <AppButton label={ro ? 'Actualizează' : 'Refresh'} icon="refresh" variant="secondary" disabled={loading} onPress={() => { setRows([]); setLoading(true); setAttempt(value => value + 1); }} />
      </View>
      {loading && <LoadingState />}
      {failed && <Text accessibilityRole="alert" style={styles.error}>{ro ? 'Nu am putut încărca utilizatorii trial. Verifică accesul de administrator și încearcă din nou.' : 'Unable to load trial users. Check your administrator access and try again.'}</Text>}
      {!loading && !failed && rows.length === 0 && <Card><Body>{ro ? 'Niciun utilizator pe această pagină.' : 'No users on this page.'}</Body></Card>}
      {rows.map(row => (
        <Card key={row.user_id}>
          <Text selectable style={styles.email}>{row.verified_email}</Text>
          <Body>{row.restaurant_name || (ro ? 'Restaurant necompletat' : 'Restaurant not provided')}</Body>
          <Text style={styles.status}>{status(row.status)}</Text>
          <Body>{`${ro ? 'Început' : 'Started'}: ${date(row.started_at)}`}</Body>
          <Body>{`${ro ? 'Expiră' : 'Expires'}: ${date(row.expires_at)}`}</Body>
          <Body>{`${ro ? 'Ultima autentificare' : 'Last sign-in'}: ${date(row.last_sign_in_at)}`}</Body>
          <Body>{`${ro ? 'Înregistrare finalizată' : 'Registration completed'}: ${date(row.registered_at)}`}</Body>
        </Card>
      ))}
      <View style={styles.actions}>
        <AppButton label={ro ? 'Înapoi' : 'Previous'} variant="secondary" disabled={loading || offset === 0} onPress={() => goToPage(Math.max(0, offset - TRIAL_USERS_PAGE_SIZE))} />
        <Text style={styles.page}>{ro ? 'Pagina' : 'Page'} {offset / TRIAL_USERS_PAGE_SIZE + 1}</Text>
        <AppButton label={ro ? 'Înainte' : 'Next'} variant="secondary" disabled={loading || failed || rows.length < TRIAL_USERS_PAGE_SIZE} onPress={() => goToPage(offset + TRIAL_USERS_PAGE_SIZE)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  email: { color: Brand.navyDeep, fontFamily: Fonts.bold, fontSize: 16 },
  status: { color: Brand.teal, fontFamily: Fonts.bold, fontSize: 12 },
  error: { color: Brand.red, fontFamily: Fonts.medium, fontSize: 13, lineHeight: 20 },
  page: { color: Brand.muted, fontFamily: Fonts.medium, fontSize: 12 },
});
