/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { HaccpField } from '@/components/haccp-field';
import { HaccpMonthGrid } from '@/components/haccp-month-grid';
import { ToolHeader } from '@/components/tool-header';
import { AppButton, Body, Card, IconButton, Screen, SectionHeader, StatusPill } from '@/components/ui';
import {
  defaultHaccpValue,
  displayHaccpValue,
  getHaccpForm,
  localize,
  type HaccpFieldDefinition,
} from '@/constants/haccp-forms';
import { Brand, Fonts, TabularNumbers } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { useHaccpDocuments } from '@/hooks/use-haccp-documents';
import { clearUnconfirmedHeader, clearUnconfirmedMeasurements, haccpHeaderNeedsConfirmation, haccpLocationMatches, haccpRowNeedsConfirmation } from '@/lib/haccp-confirmation';
import { exportHaccpDocumentPdf } from '@/lib/haccp-export';
import { createHaccpDocumentId, createHaccpRowId } from '@/lib/haccp-repository';
import { syncHaccpReminders } from '@/lib/haccp-reminders';
import { defaultHaccpProfile, loadHaccpProfile } from '@/lib/haccp-routine-repository';
import { haccpDocumentSummary, sortHaccpRows } from '@/lib/haccp-sheet';
import { haccpIdentityStamp, localTimeKey } from '@/lib/haccp-today';
import type { HaccpDocument, HaccpDocumentRow, HaccpValues } from '@/types/haccp';
import type { HaccpRoutineProfile } from '@/types/haccp-routine';

function initialValues(fields: readonly HaccpFieldDefinition[], now = new Date()) {
  return fields.reduce<HaccpValues>((values, field) => {
    values[field.key] = defaultHaccpValue(field, now);
    return values;
  }, {});
}

function initialHeaderValues(
  fields: readonly HaccpFieldDefinition[],
  profile: HaccpRoutineProfile,
  now = new Date(),
) {
  const values = initialValues(fields, now);
  fields.forEach((field) => {
    if (field.key === 'location' && !values[field.key]) values[field.key] = profile.defaultLocationName;
    if (/responsible|supervisor/.test(field.key) && field.type !== 'signature' && !values[field.key]) {
      values[field.key] = profile.responsibleName;
    }
  });
  values._location_id = profile.defaultLocationId ?? '';
  values._location_name = profile.defaultLocationName;
  return values;
}

function initialRowValues(fields: readonly HaccpFieldDefinition[], now = new Date()) {
  const values = initialValues(fields, now);
  if (fields.some((field) => field.key === 'day')) values.day = String(now.getDate());
  const firstTime = fields.find((field) => field.type === 'time' && !values[field.key]);
  if (firstTime) values[firstTime.key] = localTimeKey(now);
  return values;
}

function copyDocument(document: HaccpDocument): HaccpDocument {
  const form = getHaccpForm(document.formCode);
  return {
    ...document,
    headerValues: form ? clearUnconfirmedHeader(document.headerValues, form) : { ...document.headerValues },
    rows: document.rows.map((row) => ({ ...row, values: { ...row.values } })),
  };
}

function requiredMissing(fields: readonly HaccpFieldDefinition[], values: HaccpValues) {
  return fields.find((field) => field.required && !values[field.key]?.trim()) ?? null;
}

function newDocument(
  formCode: string,
  documentFields: readonly HaccpFieldDefinition[],
  profile: HaccpRoutineProfile,
): HaccpDocument {
  const now = new Date().toISOString();
  return {
    id: createHaccpDocumentId(),
    formCode,
    headerValues: initialHeaderValues(documentFields, profile),
    rows: [],
    createdAt: now,
    updatedAt: now,
    syncState: 'local',
  };
}

export default function HaccpFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const form = getHaccpForm(code);
  const auth = useAuth();
  const { t, locale } = useI18n();
  const userId = auth.user?.id ?? 'demo';
  const identity = auth.user?.email ?? 'Operator';
  const { documents, isLoading, save, remove } = useHaccpDocuments(userId);
  const [profile, setProfile] = useState(() => defaultHaccpProfile(identity));
  const [draft, setDraft] = useState<HaccpDocument | null>(null);
  const [rowDraft, setRowDraft] = useState<HaccpValues>({});
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const formDocuments = useMemo(
    () => form ? documents.filter((item) => item.formCode === form.code && haccpLocationMatches(item, profile)) : [],
    [documents, form, profile],
  );
  const pendingDishNames = draft?.rows.filter((row) => row.values._name_pending === 'true').length ?? 0;

  useEffect(() => {
    void loadHaccpProfile(userId, identity).then(setProfile).catch(() => undefined);
  }, [identity, userId]);

  if (!form) {
    return (
      <Screen>
        <ToolHeader title={t('haccp.formUnavailable')} subtitle={t('haccp.formUnavailableBody')} />
        <Card tone="soft"><Body>{t('haccp.formUnavailableBody')}</Body></Card>
      </Screen>
    );
  }

  const resetRow = () => {
    setRowDraft(initialRowValues(form.rowFields));
    setEditingRowId(null);
  };

  const startNew = () => {
    setDraft(newDocument(form.code, form.documentFields, profile));
    resetRow();
  };

  const openDocument = (document: HaccpDocument) => {
    const copied = copyDocument(document);
    copied.headerValues = {
      ...initialHeaderValues(form.documentFields, profile),
      ...copied.headerValues,
    };
    setDraft(copied);
    resetRow();
  };

  const setHeaderValue = (key: string, value: string) => {
    setDraft((current) => current ? { ...current, headerValues: { ...current.headerValues, [key]: value } } : current);
  };

  const setRowValue = (key: string, value: string) => {
    setRowDraft((current) => ({ ...current, [key]: value }));
  };

  const markEverythingConform = () => {
    const now = new Date();
    setRowDraft((current) => {
      const next = { ...current };
      form.rowFields.forEach((field) => {
        if (field.type === 'choice' && field.options?.some((option) => option.value === 'yes')) next[field.key] = 'yes';
        else if (field.type === 'choice' && field.options?.some((option) => option.value === 'conform')) next[field.key] = 'conform';
        else if (field.type === 'signature') next[field.key] = haccpIdentityStamp(identity, now);
      });
      if (form.rowFields.some((field) => field.key === 'day')) next.day = String(now.getDate());
      const firstTime = form.rowFields.find((field) => field.type === 'time');
      if (firstTime && !next[firstTime.key]) next[firstTime.key] = localTimeKey(now);
      return next;
    });
    void Haptics.selectionAsync();
  };

  const addOrUpdateRow = () => {
    if (!draft) return;
    const missing = requiredMissing(form.rowFields, rowDraft);
    if (missing) {
      Alert.alert(t('haccp.missingField'), t('haccp.completeField', { field: localize(missing.label, locale) }));
      return;
    }
    if (form.rowFields.some((field) => field.type === 'temperature' && rowDraft[field.key]?.trim()
      && !Number.isFinite(Number(rowDraft[field.key].replace(',', '.'))))) {
      Alert.alert(locale === 'ro' ? 'Temperatură invalidă' : 'Invalid temperature', locale === 'ro' ? 'Introdu o valoare numerică măsurată.' : 'Enter a measured numeric value.');
      return;
    }
    const hasNonconform = form.rowFields.some((field) => {
      const value = rowDraft[field.key];
      if (value === 'no' || value === 'nonconform') return true;
      if (field.type !== 'temperature' || !value) return false;
      const amount = Number(value.replace(',', '.'));
      return Number.isFinite(amount) && (
        (field.criticalMin !== undefined && field.criticalMin !== null && amount < field.criticalMin)
        || (field.criticalMax !== undefined && field.criticalMax !== null && amount > field.criticalMax)
      );
    });
    const hasCorrectiveAction = [
      ...Object.entries(rowDraft),
      ...Object.entries(draft.headerValues),
    ].some(([key, value]) => /corrective|correction/.test(key) && value.trim());
    if (hasNonconform && !hasCorrectiveAction) {
      Alert.alert(
        locale === 'ro' ? 'Acțiune corectivă obligatorie' : 'Corrective action required',
        locale === 'ro'
          ? 'Completează acțiunea corectivă înainte de a salva neconformitatea.'
          : 'Enter the corrective action before saving a non-conformity.',
      );
      return;
    }
    const normalizedValues: HaccpValues = { ...rowDraft, _confirmed_at: new Date().toISOString(), _confirmed_by: identity };
    delete normalizedValues._requires_confirmation;
    const pendingDishKey = form.code === 'FO-H-14-01' ? 'dish'
      : form.code === 'FO-H-18-01' ? 'menu' : null;
    if (pendingDishKey) {
      const dishName = normalizedValues[pendingDishKey]?.trim() ?? '';
      if (dishName && !/(adaugă denumirea|add name)/i.test(dishName)) {
        delete normalizedValues._name_pending;
      }
    }
    const axis = form.rowFields[0];
    if (axis?.key === 'day') normalizedValues.day = String(Math.min(31, Math.max(1, Number(normalizedValues.day) || 1)));
    const now = new Date().toISOString();
    const sameAxis = form.axisOrder && axis
      ? draft.rows.find((row) => row.values[axis.key] === normalizedValues[axis.key])
      : null;
    const existing = draft.rows.find((row) => row.id === editingRowId) ?? sameAxis;
    const row: HaccpDocumentRow = {
      id: existing?.id ?? createHaccpRowId(),
      values: normalizedValues,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    setDraft({
      ...draft,
      rows: sortHaccpRows([row, ...draft.rows.filter((item) => item.id !== row.id)], form),
    });
    resetRow();
  };

  const editRow = (row: HaccpDocumentRow) => {
    setRowDraft(clearUnconfirmedMeasurements(row.values));
    setEditingRowId(row.id);
  };

  const deleteRow = (rowId: string) => {
    if (!draft) return;
    setDraft({ ...draft, rows: draft.rows.filter((row) => row.id !== rowId) });
    if (editingRowId === rowId) resetRow();
  };

  const validateDraft = () => {
    if (!draft) return false;
    const missing = requiredMissing(form.documentFields, draft.headerValues);
    if (missing) {
      Alert.alert(t('haccp.missingField'), t('haccp.completeField', { field: localize(missing.label, locale) }));
      return false;
    }
    if (form.rowFields.length && !draft.rows.length) {
      Alert.alert(t('haccp.noRowsTitle'), t('haccp.noRowsBody'));
      return false;
    }
    return true;
  };

  const persist = async (notify = true) => {
    if (!draft || !validateDraft()) return null;
    setIsSaving(true);
    try {
      const result = await save({ ...draft, headerValues: { ...draft.headerValues,
        _header_confirmed_at: new Date().toISOString(), _header_confirmed_by: identity } });
      setDraft(result.document);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void syncHaccpReminders(
        userId,
        [result.document, ...documents.filter((item) => item.id !== result.document.id)],
        locale,
      );
      if (notify) {
        Alert.alert(
          t('haccp.savedTitle'),
          result.synced ? t('haccp.savedSynced') : t('haccp.savedOffline'),
        );
      }
      return result.document;
    } catch (error) {
      Alert.alert(t('haccp.saveFailed'), error instanceof Error ? error.message : t('common.tryAgain'));
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const exportPdf = async (source?: HaccpDocument) => {
    const document = source ?? await persist(false);
    if (!document) return;
    setIsExporting(true);
    try {
      await exportHaccpDocumentPdf(document, form, locale);
    } catch (error) {
      Alert.alert(t('haccp.pdfFailed'), error instanceof Error ? error.message : t('common.tryAgain'));
    } finally {
      setIsExporting(false);
    }
  };

  const persistAndReturnToToday = async () => {
    const document = await persist(false);
    if (document) router.replace('/(app)/haccp' as never);
  };

  const confirmDelete = (document: HaccpDocument) => {
    Alert.alert(t('haccp.deleteTitle'), t('haccp.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => void remove(document).then(() => {
          if (draft?.id === document.id) setDraft(null);
        }),
      },
    ]);
  };

  if (!draft) {
    return (
      <Screen>
        <ToolHeader title={form.code} subtitle={localize(form.title, locale)} />
        <Card tone="navy">
          <SectionHeader eyebrow={form.code} title={localize(form.shortTitle, locale)} light />
          <Body light>{form.instructions ? localize(form.instructions, locale) : t('haccp.formIntro')}</Body>
          <AppButton label={t('haccp.newDocument')} icon="add" fullWidth onPress={startNew} />
        </Card>

        <SectionHeader title={t('haccp.savedForms')} />
        {!isLoading && !formDocuments.length && <Card tone="soft"><Body>{t('haccp.noDocuments')}</Body></Card>}
        {formDocuments.map((document) => (
          <View key={document.id} style={styles.documentCard}>
            <View style={styles.documentIcon}><Ionicons name="document-text-outline" size={20} color={Brand.navy} /></View>
            <Pressable onPress={() => openDocument(document)} style={({ pressed }) => [styles.flex, pressed && styles.pressed]}>
              <Text style={styles.documentTitle}>{haccpDocumentSummary(document, form, locale)}</Text>
              <Text style={styles.documentMeta}>{t('haccp.entriesAndDate', { count: document.rows.length, date: new Date(document.updatedAt).toLocaleDateString(locale === 'ro' ? 'ro-RO' : 'en-GB') })}</Text>
              {document.syncState !== 'synced' && <Text style={styles.pending}>{t('haccp.waitingForSync')}</Text>}
            </Pressable>
            <IconButton icon="download-outline" label={t('haccp.exportPdf')} onPress={() => void exportPdf(document)} />
            <IconButton icon="trash-outline" label={t('common.delete')} danger onPress={() => confirmDelete(document)} />
          </View>
        ))}
      </Screen>
    );
  }

  return (
    <Screen
      bottomSafeArea
      footer={(
        <View style={styles.footerActions}>
          <View style={styles.footerPrimary}>
            <View style={styles.flex}><AppButton label={t('haccp.saveDocument')} icon="save-outline" fullWidth loading={isSaving} onPress={() => void persist()} /></View>
            <AppButton label="PDF" icon="document-outline" variant="secondary" loading={isExporting} onPress={() => void exportPdf()} />
          </View>
          <AppButton
            label={locale === 'ro' ? 'Gata, următoarea sarcină' : 'Done, next task'}
            icon="arrow-forward-circle-outline"
            variant="secondary"
            fullWidth
            loading={isSaving}
            onPress={() => void persistAndReturnToToday()}
          />
        </View>
      )}>
      <ToolHeader title={form.code} subtitle={localize(form.shortTitle, locale)} />
      <View style={styles.editTop}>
        <AppButton label={t('haccp.backToDocuments')} icon="albums-outline" variant="ghost" onPress={() => setDraft(null)} />
        <StatusPill
          label={draft.syncState === 'synced' ? t('haccp.synced') : t('haccp.waitingForSync')}
          status={draft.syncState === 'synced' ? 'healthy' : 'watch'}
        />
      </View>

      {(haccpHeaderNeedsConfirmation(draft.headerValues) || draft.rows.some((row) => haccpRowNeedsConfirmation(row.values))) && <Card tone="gold"><Body>{locale === 'ro' ? 'Schiță: introdu și confirmă măsurătorile reale. Pozițiile generate nu dovedesc efectuarea verificărilor.' : 'Draft: enter and confirm real measurements. Generated entries do not establish that checks took place.'}</Body></Card>}
      <Card>
        <SectionHeader eyebrow={t('haccp.documentHeader')} title={localize(form.title, locale)} />
        {form.documentFields.map((field) => (
          <HaccpField key={field.key} field={field} locale={locale} identity={identity} value={draft.headerValues[field.key] ?? ''} onChange={(value) => setHeaderValue(field.key, value)} />
        ))}
        {form.rules?.length ? (
          <View style={styles.rules}>
            <Text style={styles.rulesTitle}>{t('haccp.internalRules')}</Text>
            {form.rules.map((rule, index) => <Text key={localize(rule, locale)} style={styles.rule}>{index + 1}. {localize(rule, locale)}</Text>)}
          </View>
        ) : null}
      </Card>

      {pendingDishNames > 0 && (
        <Card tone="gold">
          <SectionHeader
            eyebrow={locale === 'ro' ? 'De completat' : 'To complete'}
            title={locale === 'ro'
              ? `${pendingDishNames} denumiri de preparate`
              : `${pendingDishNames} dish names`}
          />
          <Body>
            {locale === 'ro'
              ? 'Deschide fiecare poziție, adaugă denumirea preparatului, ora și temperatura măsurată, apoi confirmă înregistrarea.'
              : 'Open each entry, add the dish name, time and measured temperature, then confirm the entry.'}
          </Body>
        </Card>
      )}

      {!!form.rowFields.length && (
        <Card tone="soft">
          <SectionHeader eyebrow={editingRowId ? t('haccp.editEntry') : t('haccp.newEntry')} title={t('haccp.completeEntry')} />
          {form.rowFields.some((field) => field.type === 'choice' && field.options?.some((option) => option.value === 'yes' || option.value === 'conform')) && (
            <AppButton
              label={locale === 'ro' ? 'Totul conform' : 'Everything conforms'}
              icon="checkmark-done-circle-outline"
              variant="secondary"
              fullWidth
              onPress={markEverythingConform}
            />
          )}
          {form.rowFields.map((field) => (
            <HaccpField key={field.key} field={field} locale={locale} identity={identity} value={rowDraft[field.key] ?? ''} onChange={(value) => setRowValue(field.key, value)} />
          ))}
          <View style={styles.rowActions}>
            <View style={styles.flex}><AppButton label={editingRowId ? t('haccp.updateEntry') : t('haccp.addEntry')} icon={editingRowId ? 'checkmark' : 'add'} fullWidth onPress={addOrUpdateRow} /></View>
            {editingRowId && <AppButton label={t('common.cancel')} variant="ghost" onPress={resetRow} />}
          </View>
        </Card>
      )}

      {!!form.rowFields.length && (
        <Card>
          <SectionHeader title={t('haccp.entries', { count: draft.rows.length })} />
          {form.rowFields[0]?.key === 'day' && (
            <HaccpMonthGrid
              rows={draft.rows}
              selectedDay={rowDraft.day}
              onSelectDay={(day, row) => {
                if (row) editRow(row);
                else {
                  setEditingRowId(null);
                  setRowDraft({ ...initialRowValues(form.rowFields), day });
                }
              }}
            />
          )}
          {!draft.rows.length && <Body>{t('haccp.noRowsYet')}</Body>}
          {draft.rows.map((row, index) => {
            const primary = form.rowFields[0];
            const secondary = form.rowFields.find((field, fieldIndex) => fieldIndex > 0 && row.values[field.key]);
            return (
              <View key={row.id} style={styles.entryRow}>
                <View style={styles.entryNumber}><Text style={styles.entryNumberText}>{index + 1}</Text></View>
                <View style={styles.flex}>
                  <Text style={styles.entryTitle}>{localize(primary.label, locale)}: {displayHaccpValue(primary, row.values[primary.key] ?? '', locale)}</Text>
                  {secondary && <Text style={styles.entryMeta}>{localize(secondary.label, locale)}: {displayHaccpValue(secondary, row.values[secondary.key] ?? '', locale)}</Text>}
                </View>
                <IconButton icon="create-outline" label={t('haccp.editEntry')} onPress={() => editRow(row)} />
                <IconButton icon="trash-outline" label={t('common.delete')} danger onPress={() => deleteRow(row.id)} />
              </View>
            );
          })}
        </Card>
      )}

      {form.instructions && <Body>{localize(form.instructions, locale)}</Body>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.72 },
  documentCard: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: Brand.white, borderWidth: 1, borderColor: Brand.line, borderRadius: 16, padding: 11 },
  documentIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: Brand.goldSoft, alignItems: 'center', justifyContent: 'center' },
  documentTitle: { color: Brand.navyDeep, fontSize: 13, fontFamily: Fonts.extraBold },
  documentMeta: { color: Brand.muted, fontSize: 10, marginTop: 3, fontFamily: Fonts.regular, ...TabularNumbers },
  pending: { color: Brand.amber, fontSize: 9, fontFamily: Fonts.bold, marginTop: 3 },
  footerActions: { gap: 8 },
  footerPrimary: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rules: { gap: 6, borderTopWidth: 1, borderTopColor: Brand.line, paddingTop: 10 },
  rulesTitle: { color: Brand.navyDeep, fontSize: 14, fontFamily: Fonts.extraBold },
  rule: { color: Brand.muted, fontSize: 12, lineHeight: 17, fontFamily: Fonts.regular },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: Brand.line, paddingTop: 9 },
  entryNumber: { width: 26, height: 26, borderRadius: 9, backgroundColor: Brand.tealSoft, alignItems: 'center', justifyContent: 'center' },
  entryNumberText: { color: Brand.navy, fontSize: 10, fontFamily: Fonts.extraBold, ...TabularNumbers },
  entryTitle: { color: Brand.navyDeep, fontSize: 12, fontFamily: Fonts.extraBold },
  entryMeta: { color: Brand.muted, fontSize: 10, lineHeight: 14, marginTop: 2, fontFamily: Fonts.regular, ...TabularNumbers },
});
