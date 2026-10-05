/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { readDocumentBytes, readDocumentText } from '@/lib/document-bytes';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, Body, Card, IconButton, Screen, SectionHeader, Title } from '@/components/ui';
import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { useWorkspace } from '@/contexts/workspace-context';
import { type ImportResult, matchPriceList, parsePriceList } from '@/lib/price-import';
import { loadSales } from '@/lib/operations-storage';
import { notifyPriceAlert, priceAlertMessage } from '@/lib/price-alert-notifier';
import { recordPriceAlert } from '@/lib/price-alert-history';
import { calculatePriceAlert } from '@/lib/price-alerts';

export default function ImportPricesScreen() {
  const router = useRouter();
  const auth = useAuth();
  const { t, locale } = useI18n();
  const { format } = usePreferences();
  const { catalog, recipes, applyPriceUpdates, importNewCatalogItems } = useWorkspace();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedNew, setSelectedNew] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);

  const changed = (result?.matches ?? []).filter((match) => match.newPrice !== match.currentPrice);
  const newItems = result?.newItems ?? [];

  const pick = async () => {
    setBusy(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/csv',
          'text/comma-separated-values',
          '*/*',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.length) return;

      const asset = picked.assets[0];
      const isCsv = (asset.name ?? '').toLowerCase().endsWith('.csv');
      const rows = await (isCsv
        ? parsePriceList(await readDocumentText(asset.uri))
        : parsePriceList(await readDocumentBytes(asset.uri, 20_000_000, 'DOCUMENT_TOO_LARGE')));

      const matched = matchPriceList(rows, catalog);
      setResult(matched);
      setSelected(new Set(
        matched.matches
          .filter((match) => match.newPrice !== match.currentPrice)
          .map((match) => match.catalog.id),
      ));
      setSelectedNew(new Set(matched.newItems.map((_, index) => index)));
    } catch {
      Alert.alert(t('import.failedTitle'), t('import.failedBody'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (catalogId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(catalogId)) next.delete(catalogId);
      else next.add(catalogId);
      return next;
    });
  };

  const toggleNew = (index: number) => {
    setSelectedNew((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const apply = async () => {
    const sourceDate = new Date().toISOString().slice(0, 10);
    const selectedMatches = changed.filter((match) => selected.has(match.catalog.id));
    const updates = selectedMatches
      .map((match) => ({
        id: match.catalog.id,
        purchasePrice: match.newPrice,
        supplier: 'METRO',
        source: 'supplier_import',
        sourceDate,
      }));
    if (!updates.length) return;

    setBusy(true);
    try {
      const recalculated = await applyPriceUpdates(updates);
      const sales = await loadSales(auth.user?.id ?? 'demo').catch(() => ({}));
      const summary = calculatePriceAlert(selectedMatches.map((match) => ({
        catalogId: match.catalog.id,
        name: match.catalog.name,
        oldPrice: match.currentPrice,
        newPrice: match.newPrice,
      })), recipes, sales);
      const alertText = summary ? priceAlertMessage(summary, locale, format.money) : null;
      if (summary) {
        await recordPriceAlert(auth.user?.id ?? 'demo', summary);
        void notifyPriceAlert(summary, locale, format.money).catch(() => undefined);
      }
      Alert.alert(
        t('import.doneTitle'),
        `${t('import.doneBody', { count: updates.length, recipes: recalculated })}${alertText ? `\n\n${alertText.title}\n${alertText.body}` : ''}`,
      );
      router.replace('/(app)/recipes?section=ingredients' as never);
    } catch (caught) {
      Alert.alert(
        t('import.failedTitle'),
        caught instanceof Error ? caught.message : t('common.tryAgain'),
      );
    } finally {
      setBusy(false);
    }
  };

  const addNew = async () => {
    const rows = newItems.filter((_, index) => selectedNew.has(index));
    if (!rows.length) return;

    setIsAddingNew(true);
    try {
      const count = await importNewCatalogItems(rows.map((row) => ({
        name: row.name,
        purchasePrice: row.price,
        priceUnit: row.unit ?? 'kg',
        supplier: 'METRO',
        notes: row.notes,
      })));
      Alert.alert(t('import.newItemsAddedTitle'), t('import.newItemsAddedBody', { count }));
      router.replace('/(app)/recipes?section=ingredients' as never);
    } catch (caught) {
      Alert.alert(
        t('import.failedTitle'),
        caught instanceof Error ? caught.message : t('common.tryAgain'),
      );
    } finally {
      setIsAddingNew(false);
    }
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" label={t('common.back')} onPress={() => router.back()} />
        <Text style={styles.topTitle}>{t('import.title')}</Text>
        <View style={styles.topSpacer} />
      </View>

      <View>
        <Title>{t('import.title')}</Title>
        <Body>{t('import.subtitle')}</Body>
      </View>

      {catalog.length === 0 && (
        <Card tone="gold">
          <Body>{t('import.emptyCatalogHint')}</Body>
        </Card>
      )}

      <Card>
        <AppButton
          label={busy ? t('import.parsing') : t('import.pick')}
          icon="document-attach-outline"
          fullWidth
          loading={busy && !result}
          onPress={() => void pick()}
        />
        <Body>{t('import.formats')}</Body>
      </Card>

      {!!result && (
        <Card>
          <SectionHeader title={t('import.summaryTitle')} />
          <Body>
            {t('import.summaryBody', { matched: result.matches.length, total: result.totalRows })}
          </Body>
          {result.totalRows === 0 && <Body>{t('import.noRows')}</Body>}
          {result.newItems.length > 0 && (
            <Body>{t('import.newItemsFound', { count: result.newItems.length })}</Body>
          )}
          {result.unmatched.length > 0 && (
            <Body>{t('import.unmatched', { count: result.unmatched.length })}</Body>
          )}
          {result.matches.length > 0 && changed.length === 0 && <Body>{t('import.noChanges')}</Body>}

          {changed.length > 0 && (
            <View style={styles.actions}>
              <AppButton
                label={t('import.selectAll')}
                variant="ghost"
                onPress={() => setSelected(new Set(changed.map((match) => match.catalog.id)))}
              />
              <AppButton
                label={t('import.clearAll')}
                variant="ghost"
                onPress={() => setSelected(new Set())}
              />
            </View>
          )}
        </Card>
      )}

      {changed.map((match) => {
        const isSelected = selected.has(match.catalog.id);
        const increased = match.newPrice > match.currentPrice;
        return (
          <Pressable
            key={match.catalog.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={match.catalog.name}
            onPress={() => toggle(match.catalog.id)}
            style={({ pressed }) => pressed && styles.pressed}>
            <Card style={styles.row}>
              <View style={[styles.check, isSelected && styles.checkActive]}>
                {isSelected && <Ionicons name="checkmark" size={15} color={Brand.navyDeep} />}
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle} numberOfLines={1}>{match.catalog.name}</Text>
                <Text style={styles.rowMeta} numberOfLines={1}>{match.row.name}</Text>
              </View>
              <View style={styles.prices}>
                <Text style={styles.oldPrice}>
                  {t('import.current')} {format.money(match.currentPrice)}
                </Text>
                <Text style={[styles.newPrice, increased ? styles.up : styles.down]}>
                  {format.money(match.newPrice)} ({increased ? '+' : ''}{format.percent(match.deltaPercent)})
                </Text>
              </View>
            </Card>
          </Pressable>
        );
      })}

      {changed.length > 0 && (
        <AppButton
          label={t('import.apply', { count: selected.size })}
          icon="checkmark"
          fullWidth
          loading={busy}
          disabled={selected.size === 0}
          onPress={() => void apply()}
        />
      )}

      {newItems.length > 0 && (
        <Card>
          <SectionHeader
            eyebrow={t('import.newItemsEyebrow')}
            title={t('import.newItemsTitle', { count: newItems.length })}
          />
          <Body>{t('import.newItemsBody')}</Body>
          <View style={styles.actions}>
            <AppButton
              label={t('import.selectAll')}
              variant="ghost"
              onPress={() => setSelectedNew(new Set(newItems.map((_, index) => index)))}
            />
            <AppButton
              label={t('import.clearAll')}
              variant="ghost"
              onPress={() => setSelectedNew(new Set())}
            />
          </View>
        </Card>
      )}

      {newItems.map((row, index) => {
        const isSelected = selectedNew.has(index);
        return (
          <Pressable
            key={`${row.name}-${index}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={row.name}
            onPress={() => toggleNew(index)}
            style={({ pressed }) => pressed && styles.pressed}>
            <Card style={styles.row}>
              <View style={[styles.check, isSelected && styles.checkActive]}>
                {isSelected && <Ionicons name="checkmark" size={15} color={Brand.navyDeep} />}
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle} numberOfLines={1}>{row.name}</Text>
                {!!row.notes && <Text style={styles.rowMeta} numberOfLines={1}>{row.notes}</Text>}
              </View>
              <View style={styles.prices}>
                <Text style={styles.newPrice}>
                  {format.money(row.price)} / {row.unit}
                </Text>
              </View>
            </Card>
          </Pressable>
        );
      })}

      {newItems.length > 0 && (
        <AppButton
          label={t('import.addNew', { count: selectedNew.size })}
          icon="add-circle-outline"
          variant="secondary"
          fullWidth
          loading={isAddingNew}
          disabled={selectedNew.size === 0}
          onPress={() => void addNew()}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  topTitle: { flex: 1, textAlign: 'center', color: Brand.navy, fontSize: 15, fontFamily: Fonts.bold },
  topSpacer: { width: 42 },
  actions: { flexDirection: 'row', gap: 8 },
  pressed: { opacity: 0.76 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Brand.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkActive: { borderColor: Brand.gold, backgroundColor: Brand.goldSoft },
  rowCopy: { flex: 1 },
  rowTitle: { color: Brand.navyDeep, fontSize: 14, fontFamily: Fonts.bold },
  rowMeta: { color: Brand.muted, fontSize: 11, marginTop: 3 },
  prices: { alignItems: 'flex-end' },
  oldPrice: { color: Brand.muted, fontSize: 10 },
  newPrice: { fontSize: 13, fontFamily: Fonts.extraBold, marginTop: 3, ...TabularNumbers },
  up: { color: Brand.red },
  down: { color: Brand.green },
  rowBadge: { borderRadius: Radius.pill },
});
