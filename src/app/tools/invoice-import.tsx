/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { readDocumentText } from '@/lib/document-bytes';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ToolHeader } from '@/components/tool-header';
import { Select } from '@/components/inputs';
import { AppButton, Body, Card, Field, Screen, SectionHeader, StatusPill } from '@/components/ui';
import { Brand, Fonts, TabularNumbers } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { scanErrorMessage } from '@/lib/scan-errors';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { useSubscription } from '@/contexts/subscription-context';
import { useWorkspace } from '@/contexts/workspace-context';
import { efacturaToScannedInvoice, parseEfacturaXml } from '@/lib/efactura';
import {
  buildInvoiceImportPreview,
  invoiceCurrencySupported,
  type InvoiceProductMapping,
  type InvoiceImportPreview,
  type ScannedInvoice,
} from '@/lib/invoice-import';
import { loadInvoiceProductMappings, rememberInvoiceProductMappings } from '@/lib/invoice-mappings';
import { scanInvoiceDocument } from '@/lib/invoice-scan';
import { loadSales } from '@/lib/operations-storage';
import { recordPriceAlert } from '@/lib/price-alert-history';
import { notifyPriceAlert, priceAlertMessage } from '@/lib/price-alert-notifier';
import { calculatePriceAlert } from '@/lib/price-alerts';
import { normalizeText, parsePrice } from '@/lib/price-import';

const priceKey = (kind: 'match' | 'new', rowNumber: number) => `${kind}-${rowNumber}`;

export default function InvoiceImportScreen() {
  const router = useRouter();
  const auth = useAuth();
  const { t, locale } = useI18n();
  const { format } = usePreferences();
  const { isViewer } = useSubscription();
  const { catalog, recipes, applyPriceUpdates, importNewCatalogItems } = useWorkspace();
  const userId = auth.user?.id ?? 'demo';
  const [invoice, setInvoice] = useState<ScannedInvoice | null>(null);
  const [preview, setPreview] = useState<InvoiceImportPreview | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [mappings, setMappings] = useState<InvoiceProductMapping[]>([]);
  const [manualTargets, setManualTargets] = useState<Record<number, string | null>>({});
  const applying = useRef(false);

  const selectedCount = selected.size;
  const currencyOk = !invoice || invoiceCurrencySupported(invoice.currency);
  const pricesOk = [...selected].every((key) => Number.isFinite(toNumber(prices[key])) && toNumber(prices[key]) > 0);
  const lowConfidence = useMemo(() => (
    invoice?.rows.filter((row) => row.confidence < 0.65).length ?? 0
  ), [invoice]);

  const prepare = async (uri: string, mediaType: string | null | undefined, name: string) => {
    if (isViewer || busy) return;
    setBusy(true);
    setReviewed(false);
    try {
      const isXml = /xml/i.test(mediaType ?? '') || /\.xml$/i.test(name);
      const [scanned, mappings] = await Promise.all([
        isXml
          ? readDocumentText(uri).then(parseEfacturaXml).then(efacturaToScannedInvoice)
          : scanInvoiceDocument(uri, mediaType),
        loadInvoiceProductMappings(userId),
      ]);
      const next = buildInvoiceImportPreview(scanned, catalog, mappings);
      setInvoice(scanned);
      setMappings(mappings); setManualTargets({});
      setPreview(next);
      setSourceName(name);
      const defaults = new Set<string>();
      const nextPrices: Record<string, string> = {};
      next.matches.forEach((match) => {
        const key = priceKey('match', match.row.rowNumber);
        nextPrices[key] = String(match.newPrice);
        // OCR confidence says nothing about whether the catalog match is right.
      });
      next.newItems.forEach((row) => {
        const key = priceKey('new', row.rowNumber);
        nextPrices[key] = String(row.unitPrice);
      });
      setPrices(nextPrices);
      setSelected(defaults);
    } catch (caught) {
      const message = caught instanceof Error && caught.message === 'invoice_too_large'
        ? t('invoice.tooLarge') : scanErrorMessage(caught, locale, t('invoice.scanFailedBody'));
      Alert.alert(t('invoice.scanFailedTitle'), message);
    } finally {
      setBusy(false);
    }
  };

  const scanPhoto = async () => {
    if (isViewer || busy) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('invoice.cameraTitle'), t('invoice.cameraBody'));
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    await prepare(asset.uri, asset.mimeType, `invoice-${Date.now()}.jpg`);
  };

  const pickDocument = async () => {
    if (isViewer || busy) return;
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/xml', 'text/xml'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    await prepare(asset.uri, asset.mimeType, asset.name);
  };

  const toggle = (key: string) => { setReviewed(false); setSelected((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else {
      const match = preview?.matches.find((item) => priceKey('match', item.row.rowNumber) === key);
      // A catalog item may appear twice on a bill: the operator chooses one price.
      if (match) preview?.matches.filter((item) => item.catalog.id === match.catalog.id)
        .forEach((item) => next.delete(priceKey('match', item.row.rowNumber)));
      next.add(key);
    }
    return next;
  }); };

  const assign = (rowNumber: number, target: string | null) => {
    if (!invoice || !target) return;
    const targets = { ...manualTargets, [rowNumber]: target === '__new__' ? null : target };
    const next = buildInvoiceImportPreview(invoice, catalog, mappings, targets);
    setManualTargets(targets); setPreview(next); setReviewed(false);
    setSelected((current) => new Set([...current].filter((key) => key !== priceKey('match', rowNumber) && key !== priceKey('new', rowNumber))));
    const row = invoice.rows.find((item) => item.rowNumber === rowNumber);
    if (row) setPrices((current) => ({ ...current, [priceKey('match', rowNumber)]: String(row.unitPrice), [priceKey('new', rowNumber)]: String(row.unitPrice) }));
  };
  const targetOptions = (unit: string) => [{ value: '__new__', label: t('invoice.addToCatalog') },
    ...catalog.filter((item) => item.active && item.priceUnit === unit).map((item) => ({ value: item.id, label: item.name }))];
  const editPrice = (key: string, value: string) => { setReviewed(false); setPrices((current) => ({ ...current, [key]: value })); };

  const apply = async () => {
    if (!invoice || !preview || !selected.size || !reviewed || !pricesOk || !currencyOk || isViewer || applying.current) return;
    applying.current = true;
    const selectedMatches = preview.matches.flatMap((match) => {
      const key = priceKey('match', match.row.rowNumber);
      const value = toNumber(prices[key]);
      return selected.has(key) && value > 0 ? [{ match, value }] : [];
    });
    const selectedNew = preview.newItems.flatMap((row) => {
      const key = priceKey('new', row.rowNumber);
      const value = toNumber(prices[key]);
      return selected.has(key) && value > 0 ? [{ row, value }] : [];
    });
    if (!selectedMatches.length && !selectedNew.length) { applying.current = false; return; }

    setBusy(true);
    try {
      const sourceDate = invoice.invoiceDate ?? new Date().toISOString().slice(0, 10);
      const supplier = invoice.supplier ?? t('invoice.unknownSupplier');
      const source = `invoice:${invoice.invoiceNumber ?? sourceName ?? sourceDate}`;
      const updates = selectedMatches.map(({ match, value }) => ({
        id: match.catalog.id,
        purchasePrice: value,
        supplier,
        source,
        sourceDate,
      }));
      const affectedRecipes = updates.length ? await applyPriceUpdates(updates) : 0;
      const created = selectedNew.length ? await importNewCatalogItems(selectedNew.map(({ row, value }) => ({
        name: row.name,
        purchasePrice: value,
        priceUnit: row.unit,
        supplier,
        notes: `${source} · ${sourceDate}`,
      }))) : 0;

      await rememberInvoiceProductMappings(userId, selectedMatches.map(({ match }) => ({
        supplier,
        sourceName: match.row.name,
        normalizedName: normalizeText(match.row.name),
        catalogId: match.catalog.id,
      })));

      const sales = await loadSales(userId).catch(() => ({}));
      const alertSummary = calculatePriceAlert(selectedMatches.map(({ match, value }) => ({
        catalogId: match.catalog.id,
        name: match.catalog.name,
        oldPrice: match.currentPrice,
        newPrice: value,
      })), recipes, sales);
      if (alertSummary) {
        await recordPriceAlert(userId, alertSummary);
        void notifyPriceAlert(alertSummary, locale, format.money).catch(() => undefined);
      }
      const alertCopy = alertSummary ? priceAlertMessage(alertSummary, locale, format.money) : null;
      Alert.alert(
        t('invoice.appliedTitle'),
        `${t('invoice.appliedBody', { updated: updates.length, created, recipes: affectedRecipes })}${alertCopy ? `\n\n${alertCopy.title}\n${alertCopy.body}` : ''}`,
        [{ text: 'OK', onPress: () => router.replace('/(app)/recipes?section=ingredients') }],
      );
    } catch (caught) {
      Alert.alert(t('invoice.applyFailedTitle'), caught instanceof Error ? caught.message : t('common.tryAgain'));
    } finally {
      applying.current = false;
      setBusy(false);
    }
  };

  return (
    <Screen bottomSafeArea footer={preview ? (
      <View style={styles.confirmation}>
        <Pressable accessibilityRole="checkbox" accessibilityLabel={t('invoice.reviewed')} accessibilityState={{ checked: reviewed }} disabled={busy || isViewer} onPress={() => setReviewed((value) => !value)}>
          <View style={styles.safety}><Ionicons name={reviewed ? 'checkbox' : 'square-outline'} size={24} color={Brand.navy} /><Text style={styles.safetyText}>{t('invoice.reviewed')}</Text></View>
        </Pressable>
        <AppButton label={t('invoice.confirmApply', { count: selectedCount })} icon="checkmark-circle-outline" fullWidth loading={busy} disabled={!selectedCount || !reviewed || !pricesOk || !currencyOk || isViewer} onPress={() => void apply()} />
      </View>
    ) : null}>
      <ToolHeader title={t('invoice.title')} subtitle={t('invoice.subtitle')} />

      {!preview && (
        <Card tone="soft">
          <View style={styles.heroIcon}><Ionicons name="receipt-outline" size={30} color={Brand.navy} /></View>
          <SectionHeader eyebrow={t('invoice.startEyebrow')} title={t('invoice.startTitle')} />
          <Body>{t('invoice.startBody')}</Body>
          <View style={styles.actions}>
            <AppButton label={t('invoice.camera')} icon="camera-outline" loading={busy} onPress={() => void scanPhoto()} />
            <AppButton label={t('invoice.pick')} icon="document-attach-outline" variant="secondary" loading={busy} onPress={() => void pickDocument()} />
          </View>
          <View style={styles.safety}>
            <Ionicons name="shield-checkmark-outline" size={18} color={Brand.green} />
            <Text style={styles.safetyText}>{t('invoice.safety')}</Text>
          </View>
        </Card>
      )}

      {!!invoice && !!preview && (
        <>
          <Card tone="gold">
            <SectionHeader eyebrow={t('invoice.reviewEyebrow')} title={invoice.supplier ?? t('invoice.unknownSupplier')} />
            <Text style={styles.meta}>{[
              invoice.invoiceNumber ? t('invoice.number', { value: invoice.invoiceNumber }) : null,
              invoice.invoiceDate ? format.date(invoice.invoiceDate) : null,
              sourceName,
            ].filter(Boolean).join(' · ')}</Text>
            <Body>{t('invoice.reviewSummary', {
              matched: preview.matches.length,
              fresh: preview.newItems.length,
              unresolved: preview.unresolved.length,
            })}</Body>
            {lowConfidence > 0 && <StatusPill label={t('invoice.lowConfidence', { count: lowConfidence })} status="watch" />}
            <Body>{t('invoice.currency', { value: invoice.currency ?? 'RON ?' })}</Body>
            {!currencyOk && <Body>{t('invoice.currencyBlocked')}</Body>}
            {!!invoice.rejectedRows?.length && <Body>{t('invoice.rejectedRows', { count: invoice.rejectedRows.length })}</Body>}
            <AppButton label={t('invoice.scanAnother')} icon="refresh" variant="ghost" onPress={() => { setInvoice(null); setPreview(null); setSelected(new Set()); }} />
          </Card>

          {preview.matches.map((match) => {
            const key = priceKey('match', match.row.rowNumber);
            const checked = selected.has(key);
            return (
              <View key={key}>
                <Card style={[styles.line, checked && styles.lineSelected]}>
                  <Pressable accessibilityRole="checkbox" accessibilityLabel={match.row.name} accessibilityState={{ checked }} onPress={() => toggle(key)} style={[styles.check, checked && styles.checkActive]}>{checked && <Ionicons name="checkmark" size={15} color={Brand.navyDeep} />}</Pressable>
                  <View style={styles.lineBody}>
                    <View style={styles.lineHeader}>
                      <View style={styles.lineCopy}>
                        <Text style={styles.name}>{match.catalog.name}</Text>
                        <Text style={styles.rawName}>{match.row.name}{match.learned ? ` · ${t('invoice.learnedMatch')}` : ''}</Text>
                      </View>
                      <StatusPill label={`${Math.round(match.row.confidence * 100)}%`} status={match.row.confidence >= 0.8 ? 'healthy' : match.row.confidence >= 0.65 ? 'watch' : 'critical'} />
                    </View>
                    {match.matchKind === 'suggested' && <Body>{t('invoice.suggested')}</Body>}
                    <Select placeholder={t('invoice.catalogTarget')} label={t('invoice.catalogTarget')} value={match.catalog.id} options={targetOptions(match.row.unit)} onChange={(value) => assign(match.row.rowNumber, value)} />
                    <Text style={styles.current}>{t('invoice.currentPrice', { value: format.money(match.currentPrice), unit: match.catalog.priceUnit })}</Text>
                    <Field label={t('invoice.confirmedPrice', { unit: match.catalog.priceUnit })} keyboardType="decimal-pad" value={prices[key] ?? ''} onChangeText={(value) => editPrice(key, value)} />
                    {!!match.row.packageQuantity && !!match.row.packagePrice && (
                      <Text style={styles.package}>{t('invoice.packageSource', { price: format.money(match.row.packagePrice), quantity: format.number(match.row.packageQuantity), unit: match.row.unit })}</Text>
                    )}
                  </View>
                </Card>
              </View>
            );
          })}

          {preview.newItems.length > 0 && (
            <Card><SectionHeader eyebrow={t('invoice.newEyebrow')} title={t('invoice.newTitle', { count: preview.newItems.length })} /><Body>{t('invoice.newBody')}</Body></Card>
          )}
          {preview.newItems.map((row) => {
            const key = priceKey('new', row.rowNumber);
            const checked = selected.has(key);
            return (
              <View key={key}>
                <Card style={[styles.line, checked && styles.lineSelected]}>
                  <Pressable accessibilityRole="checkbox" accessibilityLabel={row.name} accessibilityState={{ checked }} onPress={() => toggle(key)} style={[styles.check, checked && styles.checkActive]}>{checked && <Ionicons name="checkmark" size={15} color={Brand.navyDeep} />}</Pressable>
                  <View style={styles.lineBody}>
                    <Text style={styles.name}>{row.name}</Text>
                    <Text style={styles.rawName}>{t('invoice.addToCatalog')} · {row.unit}</Text>
                    <Select placeholder={t('invoice.catalogTarget')} label={t('invoice.catalogTarget')} value="__new__" options={targetOptions(row.unit)} onChange={(value) => assign(row.rowNumber, value)} />
                    <Field label={t('invoice.confirmedPrice', { unit: row.unit })} keyboardType="decimal-pad" value={prices[key] ?? ''} onChangeText={(value) => editPrice(key, value)} />
                  </View>
                </Card>
              </View>
            );
          })}

          {preview.unresolved.length > 0 && (
            <Card tone="gold"><SectionHeader title={t('invoice.unresolvedTitle')} /><Body>{t('invoice.unresolvedBody', { count: preview.unresolved.length })}</Body></Card>
          )}
          {preview.unresolved.map((row) => <Card key={`unresolved-${row.rowNumber}`}><Body>{row.name} · {row.unit}</Body>
            <Select placeholder={t('invoice.catalogTarget')} label={t('invoice.catalogTarget')} value={null} options={targetOptions(row.unit)} onChange={(value) => assign(row.rowNumber, value)} />
          </Card>)}
        </>
      )}
    </Screen>
  );
}

function toNumber(value = '') {
  return parsePrice(value) ?? 0;
}

const styles = StyleSheet.create({
  confirmation: { gap: 8 },
  heroIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: Brand.goldSoft, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  safety: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  safetyText: { flex: 1, color: Brand.green, fontSize: 11, lineHeight: 16, fontFamily: Fonts.bold },
  meta: { color: Brand.navySoft, fontSize: 11, fontFamily: Fonts.medium, ...TabularNumbers },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  lineSelected: { borderColor: Brand.gold, borderWidth: 1 },
  check: { width: 27, height: 27, borderRadius: 9, borderWidth: 2, borderColor: Brand.line, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkActive: { borderColor: Brand.gold, backgroundColor: Brand.goldSoft },
  lineBody: { flex: 1, gap: 7 },
  lineHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineCopy: { flex: 1 },
  name: { color: Brand.navyDeep, fontSize: 14, fontFamily: Fonts.bold },
  rawName: { color: Brand.muted, fontSize: 10, fontFamily: Fonts.regular, marginTop: 2 },
  current: { color: Brand.navySoft, fontSize: 11, fontFamily: Fonts.medium, ...TabularNumbers },
  package: { color: Brand.goldInk, fontSize: 10, fontFamily: Fonts.medium, ...TabularNumbers },
  pressed: { opacity: 0.76 },
});
