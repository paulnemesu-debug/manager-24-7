/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { MenuEngineeringMatrix } from '@/components/menu-engineering-matrix';
import { ToolHeader } from '@/components/tool-header';
import { AppButton, Body, Card, EmptyStateGraphic, Field, Screen, SectionHeader } from '@/components/ui';
import { Brand, Fonts, TabularNumbers } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { useSubscription } from '@/contexts/subscription-context';
import { useWorkspace } from '@/contexts/workspace-context';
import { buildMenuEngineering, type MenuClass } from '@/lib/operations';
import { currentSalesPeriod, loadSales, saveSales } from '@/lib/operations-storage';
import { matchSalesRows, parseSalesFile, type SalesImportPreview } from '@/lib/sales-import';
import { readDocumentBytes, readDocumentText } from '@/lib/document-bytes';
import { buildMenuActions } from '@/lib/menu-actions';
import { normalizeText } from '@/lib/price-import';

const CLASS_COLORS: Record<MenuClass, string> = {
  star: Brand.green,
  plowhorse: Brand.gold,
  puzzle: Brand.teal,
  dog: Brand.red,
};

export default function MenuEngineeringScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { t } = useI18n();
  const { format } = usePreferences();
  const { recipes } = useWorkspace();
  const { isViewer } = useSubscription();
  const userId = auth.user?.id ?? 'demo';
  const [sales, setSales] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<SalesImportPreview | null>(null);
  const [importName, setImportName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(6);
  const [salesReady, setSalesReady] = useState(false);
  const periodStart = currentSalesPeriod();

  useEffect(() => {
    let cancelled = false;
    setSalesReady(false);
    void loadSales(userId, periodStart).then((value) => { if (!cancelled) setSales(value); })
      .catch(() => undefined).finally(() => { if (!cancelled) setSalesReady(true); });
    return () => { cancelled = true; };
  }, [periodStart, userId]);

  const sellable = recipes.filter((recipe) => !recipe.isSubRecipe);
  const analysis = useMemo(() => buildMenuEngineering(sellable, sales), [sales, sellable]);
  const hasSales = analysis.some((item) => item.sold > 0);
  const actions = buildMenuActions(analysis);
  const filtered = sellable.filter((recipe) => normalizeText(recipe.title).includes(normalizeText(search)));

  const update = (recipeId: string, raw: string) => {
    if (!salesReady || isViewer) return;
    const parsed = Number(raw.replace(',', '.').replace(/[^0-9.]/g, ''));
    const next = {
      ...sales,
      [recipeId]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
    };
    setSales(next);
    void saveSales(userId, next, periodStart).catch(() => undefined);
  };

  const pickSalesFile = async () => {
    if (!salesReady || isViewer || busy) return;
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
      if (picked.canceled || !picked.assets[0]) return;
      const asset = picked.assets[0];
      const parsed = await parseSalesFile(
        asset.name.toLowerCase().endsWith('.csv') ? await readDocumentText(asset.uri)
          : await readDocumentBytes(asset.uri, 10_000_000, 'DOCUMENT_TOO_LARGE'),
      );
      setPreview(matchSalesRows(parsed, sellable));
      setImportName(asset.name);
    } catch {
      Alert.alert(t('menu.importFailedTitle'), t('menu.importFailedBody'));
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async () => {
    if (!preview?.matches.length || isViewer || busy) return;
    const next = { ...sales };
    preview.matches.forEach((match) => { next[match.recipe.id] = match.row.sold; });
    setBusy(true);
    try {
      await saveSales(userId, next, periodStart, 'file_import', importName);
      setSales(next);
      setPreview(null);
      Alert.alert(t('menu.importDoneTitle'), t('menu.importDoneBody', { count: preview.matches.length }));
    } catch {
      Alert.alert(t('menu.importFailedTitle'), t('menu.importFailedBody'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ToolHeader title={t('menu.title')} subtitle={t('menu.subtitle')} />
      <Card tone="soft">
        <Body>{t('menu.instructions')}</Body>
        <Text style={styles.period}>{t('menu.period', { value: periodStart.slice(0, 7) })}</Text>
        {!isViewer && (
          <AppButton
            label={t('menu.importSales')}
            icon="document-attach-outline"
            variant="secondary"
            loading={busy && !preview}
            disabled={!salesReady}
            onPress={() => void pickSalesFile()}
          />
        )}
      </Card>

      {!!preview && (
        <Card>
          <SectionHeader eyebrow={t('menu.importPreviewEyebrow')} title={t('menu.importPreviewTitle')} />
          <Body>{t('menu.importPreviewBody', {
            matched: preview.matches.length,
            total: preview.totalRows,
            unmatched: preview.unmatched.length,
          })}</Body>
          {preview.matches.map((match) => (
            <View key={`${match.row.rowNumber}-${match.recipe.id}`} style={styles.previewRow}>
              <View style={styles.recipeCopy}>
                <Text style={styles.recipeName}>{match.row.name}</Text>
                <Text style={styles.recipeMeta}>→ {match.recipe.title}</Text>
              </View>
              <Text style={styles.previewSold}>{format.number(match.row.sold)}</Text>
            </View>
          ))}
          <View style={styles.previewActions}>
            <AppButton label={t('common.cancel')} variant="ghost" onPress={() => setPreview(null)} />
            <AppButton
              label={t('menu.importConfirm')}
              icon="checkmark"
              loading={busy}
              disabled={!preview.matches.length}
              onPress={() => void confirmImport()}
            />
          </View>
        </Card>
      )}

      <Card>
        <SectionHeader eyebrow={t('menu.salesEyebrow')} title={t('menu.salesTitle')} />
        <Field label={t('menu.search')} value={search} onChangeText={(value) => { setSearch(value); setShown(6); }} />
        <Body>{t('menu.recorded', { count: analysis.length, total: sellable.length })}</Body>
        {filtered.slice(0, shown).map((recipe) => (
          <View key={recipe.id} style={styles.inputRow}>
            <View style={styles.recipeCopy}>
              <Text style={styles.recipeName}>{recipe.title}</Text>
              <Text style={styles.recipeMeta}>
                {t('menu.marginEach', { value: format.money(recipe.totals.contributionMargin) })}
              </Text>
            </View>
            <Field
              style={styles.salesField}
              label={t('menu.sold')}
              keyboardType="number-pad"
              value={sales[recipe.id] !== undefined ? String(sales[recipe.id]) : ''}
              editable={!isViewer && salesReady}
              onChangeText={(value) => update(recipe.id, value)}
            />
          </View>
        ))}
        {filtered.length > shown && <AppButton label={t('menu.showMore')} variant="ghost" onPress={() => setShown((value) => value + 6)} />}
        {!sellable.length && (
          <View style={styles.empty}>
            <EmptyStateGraphic kind="chart" />
            <Body>{t('menu.noRecipes')}</Body>
          </View>
        )}
      </Card>

      {hasSales && <Card tone="gold">
        <SectionHeader title={t('menu.actionsTitle')} />
        <Body>{t('menu.actionsHint')}</Body>
        {actions.map((action, index) => <View key={action.item.recipe.id} style={styles.resultRow}>
          <View style={styles.recipeCopy}>
            <Text style={styles.recipeName}>{index + 1}. {action.item.recipe.title} · {t(`menu.action.${action.kind}`)}</Text>
            <Body>{t(`menu.actionBody.${action.kind}`, { ingredient: action.ingredientName ?? '—',
              margin: format.money(action.item.contributionPerPortion) })}</Body>
            {action.kind === 'recover' && <Text style={styles.recipeMeta}>{t('menu.actionGap', {
              each: format.money(action.marginGapPerPortion), total: format.money(action.marginGapAtRecordedVolume),
              price: format.money(action.scenarioPriceGross), sold: action.item.sold })}</Text>}
            {action.kind === 'recover' && <Text style={styles.recipeMeta}>{t(action.gapGoal === 'foodCost' ? 'menu.gapToTarget' : 'menu.gapToAverage')}</Text>}
            <AppButton label={t('menu.testAction')} variant="ghost" onPress={() => router.push(`/tools/simulator?recipeId=${action.item.recipe.id}`)} />
          </View>
        </View>)}
      </Card>}

      {hasSales && (
        <Card>
          <SectionHeader eyebrow={t('menu.matrixEyebrow')} title={t('menu.matrixTitle')} />
          <MenuEngineeringMatrix items={analysis} />
          {analysis.map((item) => (
            <View key={item.recipe.id} style={styles.resultRow}>
              <View style={[styles.classIcon, { backgroundColor: CLASS_COLORS[item.classification] }]}>
                <Ionicons name="restaurant-outline" size={16} color={Brand.white} />
              </View>
              <View style={styles.recipeCopy}>
                <Text style={styles.recipeName}>{item.recipe.title}</Text>
                <Text style={styles.recipeMeta}>
                  {t('menu.resultMeta', {
                    sold: item.sold,
                    popularity: format.percent(item.popularityPercent),
                    value: format.money(item.totalContribution),
                  })}
                </Text>
              </View>
              <View style={[styles.classPill, { borderColor: CLASS_COLORS[item.classification] }]}>
                <Text style={[styles.classText, { color: CLASS_COLORS[item.classification] }]}>
                  {t(`menu.class.${item.classification}`)}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: Brand.line, paddingTop: 10 },
  recipeCopy: { flex: 1 },
  recipeName: { color: Brand.navyDeep, fontSize: 13, fontFamily: Fonts.extraBold },
  recipeMeta: { color: Brand.muted, fontSize: 10, lineHeight: 14, marginTop: 2, fontFamily: Fonts.regular, ...TabularNumbers },
  salesField: { width: 86 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderTopColor: Brand.line, paddingTop: 10 },
  classIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  classPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  classText: { fontSize: 10, fontFamily: Fonts.extraBold },
  period: { color: Brand.navySoft, fontSize: 11, fontFamily: Fonts.bold, ...TabularNumbers },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: Brand.line, paddingTop: 9 },
  previewSold: { color: Brand.navyDeep, fontSize: 18, fontFamily: Fonts.extraBold, ...TabularNumbers },
  previewActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 12 },
});
