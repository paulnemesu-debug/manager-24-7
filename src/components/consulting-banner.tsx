/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppButton, Body, Card, SectionHeader } from '@/components/ui';
import { CONSULTING_MIN_RECIPES, whatsAppUrl } from '@/constants/paradim';
import { Brand } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';

const DISMISS_KEY = 'professional_foodcost.consulting_dismissed_until';
const DISMISS_DAYS = 7;

/** O singură afișare per pornire a aplicației, indiferent câte ecrane se deschid. */
let shownThisSession = false;

export function ConsultingBanner({
  recipeCount,
  measuredCount,
  averageFoodCost,
}: {
  recipeCount: number;
  measuredCount: number;
  averageFoodCost: number;
}) {
  const { t } = useI18n();
  const { format } = usePreferences();
  const [visible, setVisible] = useState(false);

  const qualifies = recipeCount >= CONSULTING_MIN_RECIPES
    && measuredCount >= CONSULTING_MIN_RECIPES
    && averageFoodCost > 0;

  useEffect(() => {
    if (!qualifies || shownThisSession) return;
    let cancelled = false;

    AsyncStorage.getItem(DISMISS_KEY)
      .then((stored) => {
        if (cancelled) return;
        const until = stored ? Number(stored) : 0;
        if (Number.isFinite(until) && until > Date.now()) return;
        shownThisSession = true;
        setVisible(true);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [qualifies]);

  if (!visible) return null;

  const value = format.percent(averageFoodCost);

  const dismiss = () => {
    setVisible(false);
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    void AsyncStorage.setItem(DISMISS_KEY, String(until)).catch(() => undefined);
  };

  const open = () => {
    const url = whatsAppUrl(t('consulting.message', { value }));
    if (Platform.OS === 'web') void Linking.openURL(url);
    else void WebBrowser.openBrowserAsync(url);
  };

  return (
    <Card tone="gold">
      <View style={styles.header}>
        <View style={styles.copy}>
          <SectionHeader
            eyebrow={t('consulting.eyebrow')}
            title={t('consulting.title', { value })}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('consulting.dismiss')}
          onPress={dismiss}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <Ionicons name="close" size={18} color={Brand.navyDeep} />
        </Pressable>
      </View>
      <Body>{t('consulting.body')}</Body>
      <AppButton label={t('consulting.cta')} icon="logo-whatsapp" fullWidth onPress={open} />
      <AppButton label={t('consulting.dismiss')} variant="ghost" onPress={dismiss} />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  copy: { flex: 1 },
  close: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  pressed: { opacity: 0.7 },
});
