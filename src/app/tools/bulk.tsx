/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { readDocumentBytes, readDocumentText } from '@/lib/document-bytes';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { HaccpDateInput } from '@/components/haccp-date-input';
import { Select } from '@/components/inputs';
import { ToolHeader } from '@/components/tool-header';
import { AppButton, Body, Card, Field, IconButton, LoadingState, Screen, SectionHeader } from '@/components/ui';
import { Brand, Fonts, TabularNumbers } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { useSubscription } from '@/contexts/subscription-context';
import { useWorkspace } from '@/contexts/workspace-context';
import { buildConsumptionImportPreview, parseConsumptionFile, type ConsumptionImportPreview } from '@/lib/consumption-import';
import { scanConsumptionDocument } from '@/lib/consumption-scan';
import { scanErrorMessage } from '@/lib/scan-errors';
import {
  calculateBulkBatchTotals,
  calculateBulkGrossQuantity,
  recalculateBulkOperationalLine,
} from '@/lib/operations';
import { createProductionDocumentId, loadCachedBulkBatches, saveBulkBatch, syncBulkBatches } from '@/lib/production-documents-repository';
import type { BulkBatch, BulkBatchDraft, OperationalLine } from '@/types/operations';
import type { QuantityUnit } from '@/types/recipe';

const UNITS: QuantityUnit[] = ['g', 'kg', 'ml', 'l', 'buc'];

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function createDraft(defaultVatPercent: number): BulkBatchDraft {
  return {
    id: createProductionDocumentId(), recipeId: null, batchDate: localDate(), title: '', source: 'manual',
    sourceReference: null, lines: [], finalWeightGrams: 0, portions: 1, salePriceGross: 0,
    vatPercent: defaultVatPercent, notes: '',
  };
}

function asDraft(batch: BulkBatch): BulkBatchDraft {
  return {
    id: batch.id, recipeId: batch.recipeId, batchDate: batch.batchDate, title: batch.title,
    source: batch.source, sourceReference: batch.sourceReference, lines: batch.lines,
    finalWeightGrams: batch.finalWeightGrams, portions: batch.portions,
    salePriceGross: batch.salePriceGross, vatPercent: batch.vatPercent, notes: batch.notes,
  };
}

export default function BulkScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const auth = useAuth();
  const { t, locale } = useI18n();
  const { format, defaultVatPercent } = usePreferences();
  const { isViewer } = useSubscription();
  const { recipes, catalog } = useWorkspace();
  const userId = auth.user?.id ?? 'demo';
  const sellable = recipes.filter((recipe) => !recipe.isSubRecipe);
  const [draft, setDraft] = useState<BulkBatchDraft>(() => createDraft(defaultVatPercent));
  const [batches, setBatches] = useState<BulkBatch[]>([]);
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ConsumptionImportPreview | null>(null);
  const [importName, setImportName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(Boolean(params.id));
  const [recordMissing, setRecordMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingSaved(Boolean(params.id));
    setRecordMissing(false);
    void syncBulkBatches(userId).catch(() => loadCachedBulkBatches(userId)).then((items) => {
      if (cancelled) return;
      setBatches(items);
      if (params.id) {
        const saved = items.find((item) => item.id === params.id && !item.deletedAt);
        if (saved) setDraft(asDraft(saved));
        else setRecordMissing(true);
      }
    }).catch(() => { if (!cancelled && params.id) setRecordMissing(true); })
      .finally(() => { if (!cancelled) setLoadingSaved(false); });
    return () => { cancelled = true; };
  }, [userId, params.id]);

  const totals = useMemo(() => calculateBulkBatchTotals(draft), [draft]);

  const selectRecipe = (recipeId: string | null) => {
    const recipe = sellable.find((item) => item.id === recipeId);
    if (!recipe) { setDraft((current) => ({ ...current, recipeId: null })); return; }
    setDraft((current) => ({
      ...current,
      recipeId: recipe.id,
      title: recipe.title,
      lines: recipe.ingredients.map((ingredient) => recalculateBulkOperationalLine({
        id: createProductionDocumentId(), catalogId: ingredient.catalogId ?? null,
        name: ingredient.name, quantity: ingredient.quantity, unit: ingredient.unit,
        purchasePrice: ingredient.purchasePrice, priceUnit: ingredient.priceUnit,
        lossPercent: ingredient.lossPercent, cost: 0,
      })),
      portions: recipe.servings,
      salePriceGross: recipe.salePriceGross,
      vatPercent: recipe.vatPercent,
      finalWeightGrams: recipe.compliance?.finalWeightGrams ?? 0,
    }));
  };

  const updateLine = (id: string, patch: Partial<OperationalLine>) => {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => line.id === id
        ? recalculateBulkOperationalLine({ ...line, ...patch })
        : line),
    }));
  };

  const addCatalogLine = (value: string | null) => {
    setCatalogId(value);
    const item = catalog.find((entry) => entry.id === value);
    if (!item) return;
    setDraft((current) => ({
      ...current,
      lines: [...current.lines, recalculateBulkOperationalLine({
        id: createProductionDocumentId(), catalogId: item.id, name: item.name, quantity: 1,
        unit: item.priceUnit, purchasePrice: item.purchasePrice, priceUnit: item.priceUnit,
        lossPercent: item.defaultLossPercent, cost: 0,
      })],
    }));
    setCatalogId(null);
  };

  const addManualLine = () => setDraft((current) => ({
    ...current,
    lines: [...current.lines, recalculateBulkOperationalLine({
      id: createProductionDocumentId(), catalogId: null, name: '', quantity: 0,
      unit: 'kg', purchasePrice: 0, priceUnit: 'kg', lossPercent: 0, cost: 0,
    })],
  }));

  const importLines = async () => {
    setBusy(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'text/comma-separated-values', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets[0]) return;
      const asset = picked.assets[0];
      const rows = await parseConsumptionFile(
        asset.name.toLowerCase().endsWith('.csv') ? await readDocumentText(asset.uri) : await readDocumentBytes(asset.uri, 20_000_000, 'DOCUMENT_TOO_LARGE'),
      );
      const next = buildConsumptionImportPreview(rows, catalog);
      setPreview(next);
      setImportName(asset.name);
      if (!next.totalRows) Alert.alert(t('bulk.importEmptyTitle'), t('bulk.importEmptyBody'));
    } catch {
      Alert.alert(t('bulk.importFailedTitle'), t('bulk.importFailedBody'));
    } finally {
      setBusy(false);
    }
  };

  const scanPhoto = async () => {
    setBusy(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('bulk.scanPermissionTitle'), t('bulk.scanPermissionBody'));
        return;
      }
      const picked = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
      });
      if (picked.canceled || !picked.assets[0]) return;
      const rows = await scanConsumptionDocument(picked.assets[0].uri);
      const next = buildConsumptionImportPreview(rows, catalog);
      setPreview(next);
      setImportName(`scan-${draft.batchDate}.jpg`);
      if (!next.totalRows) Alert.alert(t('bulk.importEmptyTitle'), t('bulk.scanEmptyBody'));
    } catch (caught) {
      Alert.alert(t('bulk.scanFailedTitle'), scanErrorMessage(caught, locale, t('bulk.scanFailedBody')));
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = () => {
    if (!preview) return;
    const lines = preview.lines.map((line) => {
      const catalogItem = line.catalogId ? catalog.find((item) => item.id === line.catalogId) : null;
      return recalculateBulkOperationalLine({
        ...line,
        lossPercent: catalogItem?.defaultLossPercent ?? line.lossPercent ?? 0,
      });
    });
    setDraft((current) => ({ ...current, source: 'file_import', sourceReference: importName, lines }));
    setPreview(null);
  };

  const save = async () => {
    const lines = draft.lines.filter((line) => line.name.trim() && line.quantity > 0);
    if (!draft.title.trim() || !lines.length || draft.finalWeightGrams <= 0) {
      Alert.alert(t('bulk.incompleteTitle'), t('bulk.incompleteBody'));
      return;
    }
    setBusy(true);
    try {
      const saved = await saveBulkBatch(userId, { ...draft, title: draft.title.trim(), lines });
      setDraft(asDraft(saved));
      setBatches((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      Alert.alert(t('bulk.savedTitle'), saved.syncState === 'synced' ? t('bulk.savedSynced') : t('bulk.savedOffline'));
      router.replace({ pathname: '/(app)/recipes', params: { section: 'mine', kind: 'bulk', saved: saved.id } });
    } catch {
      Alert.alert(t('bulk.saveFailedTitle'), t('bulk.saveFailedBody'));
    } finally {
      setBusy(false);
    }
  };

  if (loadingSaved) {
    return <Screen scroll={false}><LoadingState label={t('boot.loading')} /></Screen>;
  }
  if (recordMissing) {
    return (
      <Screen>
        <ToolHeader title={t('bulk.title')} subtitle={locale === 'ro' ? 'Lot indisponibil' : 'Batch unavailable'} />
        <Body>{locale === 'ro' ? 'Lotul nu mai este disponibil în contul tău. Întoarce-te la Rețetele mele.' : 'This batch is no longer available in your account. Return to My recipes.'}</Body>
      </Screen>
    );
  }

  return (
    <Screen bottomSafeArea footer={!isViewer ? <AppButton label={t('bulk.save')} icon="checkmark" fullWidth loading={busy} onPress={() => void save()} /> : null}>
      <ToolHeader title={t('bulk.title')} subtitle={t('bulk.subtitle')} />

      <Card tone="soft">
        <SectionHeader eyebrow={t('bulk.startEyebrow')} title={t('bulk.startTitle')} />
        <Body>{t('bulk.startBody')}</Body>
        <Select label={t('bulk.recipe')} placeholder={t('bulk.recipePlaceholder')} value={draft.recipeId}
          options={sellable.map((item) => ({ value: item.id, label: item.title }))} onChange={selectRecipe} allowClear />
        <View style={styles.actions}>
          <AppButton label={t('bulk.scan')} icon="camera-outline" variant="secondary" loading={busy && !preview} onPress={() => void scanPhoto()} />
          <AppButton label={t('bulk.import')} icon="document-attach-outline" variant="secondary" loading={busy && !preview} onPress={() => void importLines()} />
          <AppButton label={t('bulk.new')} icon="add" variant="ghost" onPress={() => setDraft(createDraft(defaultVatPercent))} />
        </View>
      </Card>

      {!!preview && (
        <Card>
          <SectionHeader eyebrow={t('bulk.previewEyebrow')} title={t('bulk.previewTitle')} />
          <Body>{t('bulk.previewBody', { accepted: preview.lines.length, total: preview.totalRows, unresolved: preview.unresolved.length })}</Body>
          {preview.lines.slice(0, 12).map((line) => (
            <View key={line.id} style={styles.previewRow}><Text style={styles.name}>{line.name}</Text><Text style={styles.value}>{format.money(line.cost)}</Text></View>
          ))}
          <View style={styles.actions}>
            <AppButton label={t('common.cancel')} variant="ghost" onPress={() => setPreview(null)} />
            <AppButton label={t('bulk.confirmImport')} icon="checkmark" disabled={!preview.lines.length} onPress={confirmImport} />
          </View>
        </Card>
      )}

      <Card>
        <SectionHeader eyebrow={t('bulk.detailsEyebrow')} title={t('bulk.detailsTitle')} />
        <HaccpDateInput label={t('bulk.date')} locale={locale} value={draft.batchDate} onChange={(batchDate) => setDraft((current) => ({ ...current, batchDate }))} />
        <Field label={t('bulk.batchName')} value={draft.title} onChangeText={(title) => setDraft((current) => ({ ...current, title }))} />
        <View style={styles.fieldsRow}>
          <Field style={styles.field} label={t('bulk.finalWeight')} hint={t('bulk.gramsTotal')} keyboardType="decimal-pad" value={draft.finalWeightGrams ? String(draft.finalWeightGrams) : ''} onChangeText={(value) => setDraft((current) => ({ ...current, finalWeightGrams: toNumber(value) }))} />
          <Field style={styles.field} label={t('bulk.portions')} keyboardType="decimal-pad" value={String(draft.portions)} onChangeText={(value) => setDraft((current) => ({ ...current, portions: Math.max(1, toNumber(value)) }))} />
          <Field style={styles.field} label={t('bulk.salePrice')} keyboardType="decimal-pad" value={draft.salePriceGross ? String(draft.salePriceGross) : ''} onChangeText={(value) => setDraft((current) => ({ ...current, salePriceGross: toNumber(value) }))} />
        </View>
      </Card>

      <Card>
        <SectionHeader eyebrow={t('bulk.issueEyebrow')} title={t('bulk.issueTitle')} />
        <Body>{t('bulk.issueBody')}</Body>
        <Select label={t('bulk.addFromCatalog')} placeholder={t('bulk.chooseIngredient')} value={catalogId}
          options={catalog.filter((item) => item.active).map((item) => ({ value: item.id, label: item.name }))} onChange={addCatalogLine} allowClear />
        <AppButton label={t('bulk.addManual')} icon="create-outline" variant="secondary" onPress={addManualLine} />
        {!draft.lines.length && <Body>{t('bulk.noLines')}</Body>}
        {draft.lines.map((line, index) => (
          <View key={line.id} style={styles.line}>
            <View style={styles.lineHeader}>
              <Text style={styles.index}>{index + 1}</Text>
              <Text style={styles.name} numberOfLines={1}>{line.name || t('bulk.unnamedIngredient')}</Text>
              <IconButton icon="trash-outline" danger label={t('common.delete')} onPress={() => setDraft((current) => ({ ...current, lines: current.lines.filter((item) => item.id !== line.id) }))} />
            </View>
            <Field label={t('bulk.ingredient')} value={line.name} onChangeText={(name) => updateLine(line.id, { name })} />
            <View style={styles.fieldsRow}>
              <Field style={styles.field} label={t('bulk.quantity')} keyboardType="decimal-pad" value={line.quantity ? String(line.quantity) : ''} onChangeText={(value) => updateLine(line.id, { quantity: toNumber(value) })} />
              <View style={styles.field}>
                <Select label={t('bulk.unit')} placeholder="—" value={line.unit} options={UNITS.map((unit) => ({ value: unit, label: unit }))}
                  onChange={(unit) => unit && updateLine(line.id, { unit, priceUnit: unit === 'g' ? 'kg' : unit === 'ml' ? 'l' : unit })} />
              </View>
              <Field style={styles.field} label={t('bulk.unitPrice')} keyboardType="decimal-pad" value={line.purchasePrice ? String(line.purchasePrice) : ''} onChangeText={(value) => updateLine(line.id, { purchasePrice: toNumber(value) })} />
              <Field
                style={styles.field}
                label={t('bulk.lossPercent')}
                hint={t('bulk.lossHint')}
                keyboardType="decimal-pad"
                value={(line.lossPercent ?? 0) ? String(line.lossPercent) : ''}
                onChangeText={(value) => updateLine(line.id, { lossPercent: toNumber(value) })}
              />
            </View>
            <View style={styles.lineSummary}>
              <Text style={styles.grossQuantity}>
                {t('bulk.grossQuantity', {
                  value: format.number(calculateBulkGrossQuantity(line.quantity, line.lossPercent ?? 0)),
                  unit: line.unit,
                })}
              </Text>
              <Text style={styles.lineCost}>{format.money(line.cost)}</Text>
            </View>
          </View>
        ))}
      </Card>

      <Card tone="navy">
        <SectionHeader eyebrow={t('bulk.resultEyebrow')} title={t('bulk.resultTitle')} light />
        <View style={styles.results}>
          <Result label={t('bulk.totalCost')} value={format.money(totals.totalCost)} />
          <Result label={t('bulk.portionCost')} value={format.money(totals.portionCost)} />
          <Result label={t('bulk.costPerKg')} value={format.money(totals.costPerKg)} />
          <Result label={t('bulk.servingWeight')} value={totals.servingWeightGrams === null ? '—' : `${format.number(totals.servingWeightGrams)} g`} />
          <Result label={t('bulk.foodCost')} value={format.percent(totals.foodCostPercent)} accent={totals.foodCostPercent !== null && totals.foodCostPercent > 35} />
        </View>
      </Card>

      {!!batches.length && (
        <Card>
          <SectionHeader eyebrow={t('bulk.historyEyebrow')} title={t('bulk.historyTitle')} />
          {batches.slice(0, 8).map((batch) => (
            <View key={batch.id} style={styles.historyRow}>
              <View style={styles.historyIcon}><Ionicons name="scale-outline" size={17} color={Brand.tealDeep} /></View>
              <View style={styles.copy}><Text style={styles.name}>{batch.title}</Text><Text style={styles.meta}>{format.date(batch.batchDate)} · {format.number(batch.finalWeightGrams)} g · {batch.syncState === 'synced' ? t('bulk.synced') : t('bulk.pending')}</Text></View>
              <Text style={styles.value}>{format.money(batch.portionCost)}</Text>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

function Result({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <View style={styles.result}><Text style={styles.resultLabel}>{label}</Text><Text style={[styles.resultValue, accent && styles.resultAlert]}>{value}</Text></View>;
}

function toNumber(value: string) {
  return Math.max(0, Number(value.replace(',', '.').replace(/[^0-9.]/g, '')) || 0);
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: Brand.line, paddingTop: 8 },
  fieldsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { flex: 1, minWidth: 96 },
  line: { borderTopWidth: 1, borderTopColor: Brand.line, paddingTop: 10, gap: 8 },
  lineHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  index: { width: 28, height: 28, borderRadius: 10, textAlign: 'center', textAlignVertical: 'center', backgroundColor: Brand.goldSoft, color: Brand.goldInk, fontFamily: Fonts.bold, ...TabularNumbers },
  name: { flex: 1, color: Brand.navyDeep, fontSize: 13, fontFamily: Fonts.bold },
  lineCost: { alignSelf: 'flex-end', color: Brand.goldInk, fontSize: 12, fontFamily: Fonts.bold, ...TabularNumbers },
  lineSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  grossQuantity: { flex: 1, color: Brand.muted, fontSize: 10, fontFamily: Fonts.medium, ...TabularNumbers },
  results: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  result: { flex: 1, minWidth: 118, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 12 },
  resultLabel: { color: '#C9D6DE', fontSize: 9, textTransform: 'uppercase', fontFamily: Fonts.bold },
  resultValue: { color: Brand.white, fontSize: 19, fontFamily: Fonts.extraBold, marginTop: 6, ...TabularNumbers },
  resultAlert: { color: '#FFB5AE' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderTopColor: Brand.line, paddingTop: 9 },
  historyIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: Brand.tealSoft, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  meta: { color: Brand.muted, fontSize: 10, marginTop: 2, fontFamily: Fonts.regular },
  value: { color: Brand.navyDeep, fontSize: 13, fontFamily: Fonts.extraBold, ...TabularNumbers },
});
