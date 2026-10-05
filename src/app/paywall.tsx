/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { AppButton, BrandHeader, Card, Screen, Subtitle, Title } from '@/components/ui';
import {
  ANNUAL_PRICE_RON,
  CAN_USE_EXTERNAL_CHECKOUT,
  CHECKOUT_URL,
  IS_PLAY_STORE_BUILD,
  MONTHLY_PRICE_RON,
} from '@/constants/paradim';
import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { useSubscription } from '@/contexts/subscription-context';
import { useBilling } from '@/hooks/use-billing';
import type { TranslationKey } from '@/i18n/translations';

const benefitKeys: TranslationKey[] = [
  'paywall.benefit1',
  'paywall.benefit2',
  'paywall.benefit3',
  'paywall.benefit4',
  'paywall.benefit5',
  'paywall.benefit6',
];

export default function PaywallScreen() {
  const router = useRouter();
  const auth = useAuth();
  const subscription = useSubscription();
  const billing = useBilling();
  const { t } = useI18n();

  if (!auth.isLoading && !auth.isAuthenticated) return <Redirect href="/sign-in" />;
  if (!subscription.isLoading && subscription.hasAccess) return <Redirect href="/(app)" />;

  const openCheckout = () => {
    const url = auth.user?.email
      ? `${CHECKOUT_URL}?email=${encodeURIComponent(auth.user.email)}`
      : CHECKOUT_URL;
    if (Platform.OS === 'web') void Linking.openURL(url);
    else void WebBrowser.openBrowserAsync(url);
  };

  const activate = async () => {
    try {
      await billing.buy();
    } catch (caught) {
      Alert.alert(
        t('paywall.purchaseFailed'),
        caught instanceof Error ? caught.message : t('common.tryAgain'),
      );
    }
  };

  const restore = async () => {
    try {
      if (IS_PLAY_STORE_BUILD) await billing.restore();
      await subscription.refresh();
    } catch (caught) {
      Alert.alert(
        t('paywall.restoreFailed'),
        caught instanceof Error ? caught.message : t('common.tryAgain'),
      );
    }
  };

  return (
    <Screen>
      <BrandHeader />
      <LinearGradient colors={[Brand.navyDeep, Brand.navy]} style={styles.hero}>
        <Text style={styles.kicker}>{t('paywall.kicker')}</Text>
        <Title light>{t('paywall.title')}</Title>
        <Subtitle light>{t('paywall.subtitle')}</Subtitle>
      </LinearGradient>

      <Card>
        {benefitKeys.map((key) => (
          <View key={key} style={styles.benefit}>
            <View style={styles.check}><Ionicons name="checkmark" size={16} color={Brand.navyDeep} /></View>
            <Text style={styles.benefitText}>{t(key)}</Text>
          </View>
        ))}

        <View style={styles.priceBox}>
          <Text style={styles.priceLabel}>{t('paywall.priceLabel')}</Text>
          <Text style={styles.price}>
            {billing.displayPrice ?? t('paywall.monthlyPrice', { price: MONTHLY_PRICE_RON })}
          </Text>
          {!billing.displayPrice && (
            <Text style={styles.annualPrice}>{t('paywall.annualPrice', { price: ANNUAL_PRICE_RON })}</Text>
          )}
          <Text style={styles.priceHint}>{t('paywall.priceHint')}</Text>
        </View>

        {CAN_USE_EXTERNAL_CHECKOUT && (
          <>
            <AppButton label={t('paywall.openSite')} icon="open-outline" fullWidth onPress={openCheckout} />
            <Text style={styles.priceHint}>{t('paywall.openSiteHint')}</Text>
          </>
        )}

        {IS_PLAY_STORE_BUILD && billing.configured && billing.connected && (
          <AppButton
            label={t('paywall.activate')}
            icon="card"
            variant="secondary"
            fullWidth
            loading={billing.isLoading}
            onPress={() => void activate()}
          />
        )}
        {!!billing.error && <Text style={styles.error}>{billing.error}</Text>}

        <AppButton
          label={IS_PLAY_STORE_BUILD ? t('paywall.restore') : t('paywall.alreadyPaid')}
          icon="refresh"
          variant="ghost"
          fullWidth
          onPress={() => void restore()}
        />
      </Card>

      <AppButton
        label={t('account.signOut')}
        variant="ghost"
        onPress={() => void auth.signOut().then(() => router.replace('/sign-in'))}
      />
      <Text style={styles.legal}>{t('paywall.legal')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: Radius.large, padding: 24, gap: 12 },
  kicker: { color: Brand.goldInk, fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 1.4 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  check: { width: 28, height: 28, borderRadius: 10, backgroundColor: Brand.gold, alignItems: 'center', justifyContent: 'center' },
  benefitText: { flex: 1, color: Brand.navyDeep, fontSize: 14, fontFamily: Fonts.extraBold },
  priceBox: { backgroundColor: '#F0F4F6', borderRadius: Radius.medium, padding: 16, gap: 5, marginTop: 4 },
  priceLabel: { color: Brand.goldInk, fontSize: 10, fontFamily: Fonts.bold, letterSpacing: 1 },
  price: { color: Brand.navyDeep, fontSize: 22, fontFamily: Fonts.extraBold, ...TabularNumbers },
  annualPrice: { color: Brand.tealDeep, fontSize: 14, fontFamily: Fonts.bold, ...TabularNumbers },
  priceHint: { color: Brand.muted, fontSize: 10, lineHeight: 15 },
  error: { color: Brand.red, fontSize: 12, lineHeight: 17 },
  legal: { color: Brand.muted, fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
