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
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { HaccpDateInput } from '@/components/haccp-date-input';
import { Select } from '@/components/inputs';
import { ToolHeader } from '@/components/tool-header';
import { AppButton, Body, Card, Field, IconButton, Screen, SectionHeader } from '@/components/ui';
import { Brand, Fonts, TabularNumbers } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { useSubscription } from '@/contexts/subscription-context';
import { useWorkspace } from '@/contexts/workspace-context';
import { buildConsumptionImportPreview, parseConsumptionFile, type ConsumptionImportPreview } from '@/lib/consumption-import';
import { scanConsumptionDocument } from '@/lib/consumption-scan';
import { scanErrorMessage } from '@/lib/scan-errors';
import { recalculateOperationalLine } from '@/lib/operations';
import {
  createProductionDocumentId,
  saveConsumptionVoucher,
  syncConsumptionVouchers,
} from '@/lib/production-documents-repository';
import type { ConsumptionVoucher, ConsumptionVoucherDraft, OperationalLine } from '@/types/operations';
import type { QuantityUnit } from '@/types/recipe';

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function emptyDraft(): ConsumptionVoucherDraft {
  return {
    id: createProductionDocumentId(),
    documentDate: localDate(),
    reference: '',
    source: 'manual',
    sourceReference: null,
    notes: '',
    lines: [],
  };
}

function asDraft(value: ConsumptionVoucher): ConsumptionVoucherDraft {
  return {
    id: value.id,
    documentDate: value.documentDate,
    reference: value.reference,
    source: value.source,
    sourceReference: value.sourceReference,
    notes: value.notes,
    lines: value.lines,
  };
}

const UNITS: QuantityUnit[] = ['g', 'kg', 'ml', 'l', 'buc'];

export default function ConsumptionVouchersScreen() {
  const params = useLocalSearchParams<{ mode?: string; id?: string }>();
  const auth = useAuth();
  const { t, locale } = useI18n();
  const { format } = usePreferences();
  const { catalog } = useWorkspace();
  const { isViewer } = useSubscription();
  const userId = auth.user?.id ?? 'demo';
  const [draft, setDraft] = useState<ConsumptionVoucherDraft>(() => emptyDraft());
  const [documents, setDocuments] = useState<ConsumptionVoucher[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ConsumptionImportPreview | null>(null);
  const [importName, setImportName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void syncConsumptionVouchers(userId).then((loaded) => {
      if (cancelled) return;
      setDocuments(loaded);
      const selected = params.id ? loaded.find((item) => item.id === params.id) : null;
      if (selected) setDraft(asDraft(selected));
    });
    return () => { cancelled = true; };
  }, [params.id, userId]);

  const total = useMemo(
    () => Math.round(draft.lines.reduce((sum, line) => sum + line.cost, 0) * 100) / 100,
    [draft.lines],
  );

  const updateLine = (id: string, patch: Partial<OperationalLine>) => {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => (
        line.id === id ? recalculateOperationalLine({ ...line, ...patch }) : line
      )),
    }));
  };

  const addCatalogLine = (catalogId: string | null) => {
    setSelectedCatalogId(catalogId);
    const ingredient = catalog.find((item) => item.id === catalogId);
    if (!ingredient) return;
    const line = recalculateOperationalLine({
      id: createProductionDocumentId(),
      catalogId: ingredient.id,
      name: ingredient.name,
      quantity: 1,
      unit: ingredient.priceUnit,
      purchasePrice: ingredient.purchasePrice,
      priceUnit: ingredient.priceUnit,
      cost: 0,
    });
    setDraft((current) => ({ ...current, lines: [...current.lines, line] }));
    setSelectedCatalogId(null);
  };

  const addManualLine = () => {
    setDraft((current) => ({
      ...current,
      lines: [...current.lines, recalculateOperationalLine({
        id: createProductionDocumentId(), catalogId: null, name: '', quantity: 0,
        unit: 'kg', purchasePrice: 0, priceUnit: 'kg', cost: 0,
      })],
    }));
  };

  const pickFile = async () => {
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
      if (!next.totalRows) Alert.alert(t('voucher.importEmptyTitle'), t('voucher.importEmptyBody'));
    } catch {
      Alert.alert(t('voucher.importFailedTitle'), t('voucher.importFailedBody'));
    } finally {
      setBusy(false);
    }
  };

  const scanPhoto = async () => {
    setBusy(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('voucher.scanPermissionTitle'), t('voucher.scanPermissionBody'));
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
      setImportName(`scan-${draft.documentDate}.jpg`);
      if (!next.totalRows) Alert.alert(t('voucher.importEmptyTitle'), t('voucher.scanEmptyBody'));
    } catch (caught) {
      Alert.alert(t('voucher.scanFailedTitle'), scanErrorMessage(caught, locale, t('voucher.scanFailedBody')));
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = () => {
    if (!preview) return;
    setDraft((current) => ({
      ...current,
      source: 'file_import',
      sourceReference: importName,
      reference: current.reference || importName || '',
      lines: preview.lines,
    }));
    setPreview(null);
  };

  const save = async () => {
    const lines = draft.lines.filter((line) => line.name.trim() && line.quantity > 0);
    if (!lines.length) {
      Alert.alert(t('voucher.noLinesTitle'), t('voucher.noLinesBody'));
      return;
    }
    setBusy(true);
    try {
      const saved = await saveConsumptionVoucher(userId, {
        ...draft,
        reference: draft.reference.trim() || t('voucher.defaultReference', { date: draft.documentDate }),
        lines,
      });
      setDraft(asDraft(saved));
      setDocuments((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      Alert.alert(
        t('voucher.savedTitle'),
        saved.syncState === 'synced' ? t('voucher.savedSynced') : t('voucher.savedOffline'),
      );
    } catch {
      Alert.alert(t('voucher.saveFailedTitle'), t('voucher.saveFailedBody'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      bottomSafeArea
      footer={!isViewer ? <AppButton label={t('voucher.save')} icon="checkmark" fullWidth loading={busy} onPress={() => void save()} /> : null}>
      <ToolHeader title={t('voucher.title')} subtitle={t('voucher.subtitle')} />

      <Card tone="soft">
        <SectionHeader eyebrow={t('voucher.fastEyebrow')} title={t('voucher.fastTitle')} />
        <Body>{t('voucher.fastBody')}</Body>
        <View style={styles.actions}>
          <AppButton label={t('voucher.scan')} icon="camera-outline" variant="secondary" loading={busy && !preview} onPress={() => void scanPhoto()} />
          <AppButton label={t('voucher.import')} icon="document-attach-outline" variant="secondary" loading={busy && !preview} onPress={() => void pickFile()} />
          <AppButton label={t('voucher.new')} icon="add" variant="ghost" onPress={() => setDraft(emptyDraft())} />
        </View>
      </Card>

      {!!preview && (
        <Card>
          <SectionHeader eyebrow={t('voucher.previewEyebrow')} title={t('voucher.previewTitle')} />
          <Body>{t('voucher.previewBody', {
            accepted: preview.lines.length,
            total: preview.totalRows,
            unresolved: preview.unresolved.length,
          })}</Body>
          {preview.lines.slice(0, 12).map((line) => (
            <View key={line.id} style={styles.previewRow}>
              <Text style={styles.lineName}>{line.name}</Text>
              <Text style={styles.money}>{format.money(line.cost)}</Text>
            </View>
          ))}
          <View style={styles.actions}>
            <AppButton label={t('common.cancel')} variant="ghost" onPress={() => setPreview(null)} />
            <AppButton label={t('voucher.confirmImport')} icon="checkmark" disabled={!preview.lines.length} onPress={confirmImport} />
          </View>
        </Card>
      )}

      <Card>
        <SectionHeader eyebrow={t('voucher.detailsEyebrow')} title={t('voucher.detailsTitle')} />
        <HaccpDateInput label={t('voucher.date')} locale={locale} value={draft.documentDate} onChange={(documentDate) => setDraft((current) => ({ ...current, documentDate }))} />
        <Field label={t('voucher.reference')} value={draft.reference} onChangeText={(reference) => setDraft((current) => ({ ...current, reference }))} />
        <Field label={t('voucher.notes')} value={draft.notes} multiline onChangeText={(notes) => setDraft((current) => ({ ...current, notes }))} />
      </Card>

      <Card>
        <SectionHeader eyebrow={t('voucher.linesEyebrow')} title={t('voucher.linesTitle')} />
        <Select
          label={t('voucher.addFromCatalog')}
          placeholder={t('voucher.chooseIngredient')}
          value={selectedCatalogId}
          options={catalog.filter((item) => item.active).map((item) => ({ value: item.id, label: item.name }))}
          onChange={addCatalogLine}
          allowClear
        />
        <AppButton label={t('voucher.addManual')} icon="create-outline" variant="secondary" onPress={addManualLine} />
        {!draft.lines.length && <Body>{t('voucher.noLines')}</Body>}
        {draft.lines.map((line, index) => (
          <View key={line.id} style={styles.lineCard}>
            <View style={styles.lineHeader}>
              <Text style={styles.lineIndex}>{index + 1}</Text>
              <Text style={styles.lineName} numberOfLines={1}>{line.name || t('voucher.unnamedIngredient')}</Text>
              <IconButton
                icon="trash-outline"
                danger
                label={t('common.delete')}
                onPress={() => setDraft((current) => ({ ...current, lines: current.lines.filter((item) => item.id !== line.id) }))}
              />
            </View>
            <Field label={t('voucher.ingredient')} value={line.name} onChangeText={(name) => updateLine(line.id, { name })} />
            <View style={styles.fieldsRow}>
              <Field style={styles.field} label={t('voucher.quantity')} keyboardType="decimal-pad" value={line.quantity ? String(line.quantity) : ''} onChangeText={(value) => updateLine(line.id, { quantity: number(value) })} />
              <View style={styles.field}>
                <Select
                  label={t('voucher.unit')}
                  placeholder="—"
                  value={line.unit}
                  options={UNITS.map((unit) => ({ value: unit, label: unit }))}
                  onChange={(unit) => unit && updateLine(line.id, {
                    unit,
                    priceUnit: unit === 'g' ? 'kg' : unit === 'ml' ? 'l' : unit,
                  })}
                />
              </View>
              <Field style={styles.field} label={t('voucher.unitPrice')} keyboardType="decimal-pad" value={line.purchasePrice ? String(line.purchasePrice) : ''} onChangeText={(value) => updateLine(line.id, { purchasePrice: number(value) })} />
            </View>
            <Text style={styles.lineCost}>{t('voucher.lineCost')}: {format.money(line.cost)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t('voucher.total')}</Text>
          <Text style={styles.totalValue}>{format.money(total)}</Text>
        </View>
      </Card>

      {!!documents.length && (
        <Card>
          <SectionHeader eyebrow={t('voucher.historyEyebrow')} title={t('voucher.historyTitle')} />
          {documents.slice(0, 8).map((item) => (
            <View key={item.id} style={styles.historyRow}>
              <View style={styles.historyIcon}><Ionicons name="receipt-outline" size={17} color={Brand.tealDeep} /></View>
              <View style={styles.copy}>
                <Text style={styles.lineName}>{item.reference}</Text>
                <Text style={styles.meta}>{format.date(item.documentDate)} · {item.lines.length} · {item.syncState === 'synced' ? t('voucher.synced') : t('voucher.pending')}</Text>
              </View>
              <Text style={styles.money}>{format.money(item.totalCost)}</Text>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

function number(value: string) {
  return Math.max(0, Number(value.replace(',', '.').replace(/[^0-9.]/g, '')) || 0);
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: Brand.line, paddingTop: 8 },
  lineCard: { borderTopWidth: 1, borderTopColor: Brand.line, paddingTop: 11, gap: 9 },
  lineHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  lineIndex: { width: 28, height: 28, borderRadius: 10, textAlign: 'center', textAlignVertical: 'center', backgroundColor: Brand.tealSoft, color: Brand.tealDeep, fontFamily: Fonts.bold, ...TabularNumbers },
  lineName: { flex: 1, color: Brand.navyDeep, fontSize: 13, fontFamily: Fonts.bold },
  fieldsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { flex: 1, minWidth: 92 },
  lineCost: { alignSelf: 'flex-end', color: Brand.goldInk, fontSize: 12, fontFamily: Fonts.bold, ...TabularNumbers },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: Brand.line, paddingTop: 12 },
  totalLabel: { color: Brand.navy, fontSize: 13, fontFamily: Fonts.bold },
  totalValue: { color: Brand.navyDeep, fontSize: 24, fontFamily: Fonts.extraBold, ...TabularNumbers },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderTopColor: Brand.line, paddingTop: 9 },
  historyIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: Brand.tealSoft, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  meta: { color: Brand.muted, fontSize: 10, marginTop: 2, fontFamily: Fonts.regular },
  money: { color: Brand.navyDeep, fontSize: 13, fontFamily: Fonts.extraBold, ...TabularNumbers },
});
