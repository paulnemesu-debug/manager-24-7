/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { OtpInput } from '@/components/otp-input';
import { AppButton, BrandHeader, Field, LoadingState, Screen } from '@/components/ui';
import { Brand, Fonts, Radius, Shadow } from '@/constants/theme';
import { COPYRIGHT_NOTICE, COPYRIGHT_NOTICE_EN } from '@/constants/legal';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import type { TranslationKey } from '@/i18n/translations';
import { authErrorKey, isAcceptedOtpLength, isValidEmail, normalizeEmail, OTP_RESEND_SECONDS, parseOtpInput, resendSeconds } from '@/lib/email-otp';

function currentTimestamp(): number {
  return Date.now();
}

export default function SignInScreen() {
  const router = useRouter();
  const auth = useAuth();
  const { t, locale } = useI18n();
  const { width, height } = useWindowDimensions();
  const compact = width < 480 || height < 760;
  const veryShort = height < 680;
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const [now, setNow] = useState(0);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const busy = useRef(false);
  const cleanEmail = normalizeEmail(email);
  const targetEmail = sentTo ?? cleanEmail;
  const cooldown = resendSeconds(cooldowns[targetEmail] ?? 0, now);
  const appVersion = Constants.expoConfig?.version ?? '1.5.3';

  useEffect(() => {
    // A timestamp survives switching to the mail app; a decrementing timer does not.
    const tick = () => setNow(currentTimestamp());
    tick();
    const timer = setInterval(tick, 1000);
    const subscription = AppState.addEventListener('change', tick);
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);

  useEffect(() => {
    // Acoperă reluarea aplicației pe ruta de login cu o sesiune deja validă.
    // Navigarea imperativă evită înlocuirea arborelui nativ cu un Redirect gol.
    if (!auth.isLoading && auth.isAuthenticated && !loading) router.replace('/');
  }, [auth.isAuthenticated, auth.isLoading, loading, router]);

  const send = async () => {
    if (busy.current) return;
    if (!isValidEmail(targetEmail)) { setErrorKey('signIn.invalidEmailBody'); return; }
    if (resendSeconds(cooldowns[targetEmail] ?? 0) > 0) return;
    busy.current = true;
    setLoading(true);
    setErrorKey(null);
    try {
      await auth.requestAccess(targetEmail);
      setSentTo(targetEmail);
      setCode('');
      const timestamp = currentTimestamp();
      setCooldowns((current) => ({ ...current, [targetEmail]: timestamp + OTP_RESEND_SECONDS * 1000 }));
      setNow(timestamp);
    } catch (error) {
      const key = authErrorKey(error);
      setErrorKey(key);
      if (key === 'signIn.rateLimited') {
        const timestamp = currentTimestamp();
        setCooldowns((current) => ({ ...current, [targetEmail]: timestamp + OTP_RESEND_SECONDS * 1000 }));
        setNow(timestamp);
      }
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  const verify = async (raw: string) => {
    if (busy.current || !sentTo) return;
    const token = parseOtpInput(raw);
    if (!token || !isAcceptedOtpLength(token)) { setErrorKey('signIn.invalidCodeBody'); return; }
    busy.current = true;
    setLoading(true);
    setErrorKey(null);
    try {
      await auth.verifyCode(sentTo, token);
      // Toate deciziile post-login (demo, abonament și onboarding) trec prin
      // aceeași rută. Astfel nu rămânem pe spinner dacă evenimentul Auth ajunge
      // înainte ca handlerul butonului să termine.
      router.replace('/');
    } catch (error) {
      setErrorKey(authErrorKey(error));
      setCode('');
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  if (!auth.isLoading && auth.isAuthenticated) {
    return (
      <Screen scroll={false} forceLight>
        <LoadingState label={t('boot.loading')} />
      </Screen>
    );
  }

  return (
    <Screen bottomSafeArea forceLight style={[styles.screen, compact && styles.screenCompact]}>
      <View style={[styles.shell, compact && styles.shellCompact]}>
        <View style={styles.brandBlock}>
          <BrandHeader prominent />
        </View>
        <View style={[styles.card, compact && styles.cardCompact]}>
          {!sentTo ? (
            <>
              <View style={styles.welcomeHeading}>
                {!veryShort && (
                  <View style={styles.welcomeIcon}>
                    <Ionicons name="restaurant-outline" size={18} color={Brand.teal} />
                  </View>
                )}
                <Text style={styles.kicker}>{t('signIn.kicker')}</Text>
              </View>
              <Text style={[styles.heroTitle, compact && styles.heroTitleCompact]}>{t('signIn.heroTitle')}</Text>
              {!veryShort && <Text style={styles.heroBody}>{t('signIn.heroSubtitle')}</Text>}
              <View style={styles.divider} />
              <Field
                label={t('signIn.emailLabel')}
                placeholder={t('signIn.emailPlaceholder')}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                inputMode="email"
                value={email}
                editable={!loading}
                onChangeText={(value) => { setEmail(value); setErrorKey(null); }}
                onSubmitEditing={() => void send()}
                returnKeyType="send"
              />
              <AppButton
                label={cooldown > 0 ? t('signIn.resendIn', { seconds: cooldown }) : t('signIn.sendCode')}
                icon="mail-outline"
                loading={loading}
                disabled={cooldown > 0 || auth.isLoading}
                fullWidth
                onPress={() => void send()}
              />
              <Text style={styles.note}>{t('signIn.noPassword')}</Text>
              <AppButton
              label={t('operational.shared.instantDemo')}
                icon="play-circle-outline"
                variant="secondary"
                fullWidth
                disabled={loading}
                onPress={() => {
                  if (busy.current) return;
                  busy.current = true;
                  setLoading(true);
                  void auth.startDemo().then(() => router.replace('/')).catch(() => Alert.alert(t('operational.shared.demoError'), t('operational.shared.demoBody'))).finally(() => { busy.current = false; setLoading(false); });
                }}
              />
              <AppButton
                label={t('signIn.haveCode')}
                variant="ghost"
                disabled={loading}
                fullWidth
                onPress={() => {
                  if (!isValidEmail(cleanEmail)) { setErrorKey('signIn.invalidEmailBody'); return; }
                  setSentTo(cleanEmail);
                  setCode('');
                  setErrorKey(null);
                }}
              />
            </>
          ) : (
            <>
              <View style={styles.codeIcon}>
                <Ionicons name="key-outline" size={20} color={Brand.navy} />
              </View>
              <Text style={styles.codeTitle}>{t('signIn.codeTitle')}</Text>
              <Text style={styles.codeBody}>{t('signIn.codeSentBody', { email: sentTo })}</Text>
              <Text style={styles.note}>{t('signIn.inboxHint')}</Text>
              <OtpInput
                label={t('signIn.codeLabel')}
                value={code}
                disabled={loading}
                onChange={(value) => { setCode(value); setErrorKey(null); }}
                onInvalid={() => setErrorKey('signIn.invalidCodeBody')}
              />
              <AppButton
                label={t('signIn.verify')}
                icon="arrow-forward"
                loading={loading}
                fullWidth
                disabled={!isAcceptedOtpLength(code)}
                onPress={() => void verify(code)}
              />
              <AppButton
                label={cooldown > 0 ? t('signIn.resendIn', { seconds: cooldown }) : t('signIn.resend')}
                variant="ghost"
                fullWidth
                disabled={cooldown > 0 || loading}
                onPress={() => void send()}
              />
              <AppButton
                label={t('signIn.changeEmail')}
                variant="ghost"
                disabled={loading}
                fullWidth
                onPress={() => { setSentTo(null); setCode(''); setErrorKey(null); }}
              />
            </>
          )}
          {errorKey && (
            <View style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
              <Text style={styles.errorText}>{t(errorKey)}</Text>
            </View>
          )}
          <Text style={styles.legal}>{t('signIn.legal')}</Text>
        </View>
        <Text style={styles.version}>Manager 24/7 · v{appVersion}</Text>
        <Text style={styles.copyright}>{locale === 'en' ? COPYRIGHT_NOTICE_EN : COPYRIGHT_NOTICE}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  copyright: { color: Brand.muted, textAlign: 'center', fontSize: 9, marginTop: 3 },
  screen: {
    padding: 16,
    paddingBottom: 20,
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  screenCompact: { padding: 12, paddingBottom: 12, justifyContent: 'flex-start' },
  shell: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    flexDirection: 'column',
  },
  shellCompact: { paddingTop: 4 },
  brandBlock: {
    width: '100%',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  card: {
    width: '100%',
    flexDirection: 'column',
    backgroundColor: Brand.white,
    padding: 19,
    minWidth: 0,
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: '#E8D9AF',
    gap: 10,
    ...Shadow,
  },
  cardCompact: { padding: 14, borderRadius: 19, gap: 8 },
  welcomeHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  welcomeIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.tealSoft,
  },
  kicker: { color: Brand.goldInk, fontSize: 10, fontFamily: Fonts.bold, letterSpacing: 1.1 },
  heroTitle: { color: Brand.navyDeep, fontSize: 25, lineHeight: 30, fontFamily: Fonts.extraBold, letterSpacing: -0.4 },
  heroTitleCompact: { fontSize: 21, lineHeight: 25 },
  heroBody: { color: Brand.muted, fontSize: 13, lineHeight: 18, fontFamily: Fonts.regular },
  divider: { height: 1, backgroundColor: '#E9E1CE', marginVertical: 2 },
  codeIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.goldSoft,
  },
  codeTitle: { color: Brand.navyDeep, fontSize: 22, lineHeight: 27, fontFamily: Fonts.extraBold },
  codeBody: { color: Brand.muted, fontSize: 13, lineHeight: 18, fontFamily: Fonts.regular },
  note: { color: Brand.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily: Fonts.regular },
  error: { backgroundColor: Brand.redSoft, padding: 12, borderRadius: Radius.medium },
  errorText: { color: Brand.red, fontSize: 13, lineHeight: 19, fontFamily: Fonts.semiBold },
  legal: { color: Brand.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', fontFamily: Fonts.regular },
  version: {
    marginTop: 10,
    color: Brand.muted,
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
    fontFamily: Fonts.semiBold,
  },
});
