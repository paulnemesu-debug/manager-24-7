import { useI18n } from '@/contexts/locale-context';
/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { readDocumentText } from '@/lib/document-bytes';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { ToolHeader } from '@/components/tool-header';
import { ChoiceRow } from '@/components/inputs';
import { AppButton, Body, Card, Field, Screen, SectionHeader, StatusPill } from '@/components/ui';
import { Brand, Fonts, TabularNumbers } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { usePreferences } from '@/contexts/preferences-context';
import { useWorkspace } from '@/contexts/workspace-context';
import { calculateCostVariance, calculateIngredientVariances, inventoryValue, laborCost, mapSalesRows, parseSalesCsv, primeCost, type InventoryLine, type SalesLine } from '@/lib/management-control';
import { acceptRemoteManagementDay, createManagementId, loadManagementDailySnapshots, ManagementDayPendingError, saveManagementSnapshot, type ManagementSnapshot } from '@/lib/management-repository';
import { listLocations, type BusinessLocation } from '@/lib/locations-repository';
import { trackEvent } from '@/lib/telemetry';
import { isIsoDate, localIsoDate } from '@/lib/local-date-time';

const quantityFields = ['openingQuantity', 'purchasesQuantity', 'closingQuantity'] as const;
const salesFields = ['quantity', 'revenue'] as const;
type QuantityField = (typeof quantityFields)[number];
type SalesField = (typeof salesFields)[number];
type InventoryDraft = Omit<InventoryLine, QuantityField> & Record<QuantityField, string>;
type SalesDraft = Omit<SalesLine, SalesField> & Record<SalesField, string>;
type DayDraft = {
  inventory: Record<string, InventoryDraft>;
  sales: Record<string, SalesDraft>;
  employeeName: string;
  employeeRole: string;
  hours: string;
  hourlyCost: string;
};

function decimal(value: string) {
  const input = value.trim();
  if (!input) return 0;
  if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(input)) return NaN;
  return Number(input.replace(',', '.'));
}

function salesDraft(lines: SalesLine[]) {
  return Object.fromEntries(lines.map((line, index) => [
    line.recipeId ?? `unknown-${index}`,
    { ...line, quantity: String(line.quantity), revenue: String(line.revenue) },
  ]));
}

function dayDraft(snapshot?: ManagementSnapshot): DayDraft {
  const labor = snapshot?.labor[0];
  return {
    inventory: Object.fromEntries((snapshot?.inventory ?? []).map((line, index) => [
      line.catalogId ?? `unknown-${index}`,
      { ...line, openingQuantity: String(line.openingQuantity), purchasesQuantity: String(line.purchasesQuantity), closingQuantity: String(line.closingQuantity) },
    ])),
    sales: salesDraft(snapshot?.sales ?? []),
    employeeName: labor?.employeeName ?? '',
    employeeRole: labor?.role ?? '',
    hours: labor ? String(labor.hours) : '',
    hourlyCost: labor ? String(labor.hourlyCost) : '',
  };
}

export default function ManagementControlScreen() {
  const { user } = useAuth();
  const userId = user?.id ?? 'demo';
  return <ManagementDayEditor key={userId} userId={userId} />;
}

function ManagementDayEditor({ userId }: { userId: string }) {
  const { t, locale } = useI18n();
  const { catalog, recipes } = useWorkspace();
  const { format } = usePreferences();
  const [date, setDate] = useState(localIsoDate);
  const [drafts, setDrafts] = useState<Record<string, DayDraft>>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const draftIds = useRef<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [locationId, setLocationId] = useState('all');
  const [retainedSnapshots, setRetainedSnapshots] = useState<ManagementSnapshot[]>([]);
  const [historySelection, setHistorySelection] = useState<string>();
  const selectedLocation = locationId === 'all' ? null : locationId;
  const matching = retainedSnapshots.filter(item => item.date === date && item.locationId === selectedLocation);
  const snapshot = matching.find(item => item.id === historySelection)
    ?? matching.find(item => item.syncIssue === 'daily_conflict')
    ?? matching.find(item => item.syncFormat === 3)
    ?? matching[0];
  const draftKey = `${locationId}/${date}`;
  const legacy = Boolean(snapshot && ((snapshot.syncFormat !== 3 && snapshot.syncState !== 'local') || snapshot.promote));
  const draft = legacy ? dayDraft(snapshot) : drafts[draftKey] ?? dayDraft(snapshot);
  const { inventory, sales, employeeName, employeeRole, hours, hourlyCost } = draft;
  const editDraft = (change: (current: DayDraft) => DayDraft) => {
    setDrafts(current => ({ ...current, [draftKey]: change(current[draftKey] ?? dayDraft(snapshot)) }));
  };

  useEffect(() => {
    let active = true;
    void listLocations(userId).then(value => { if (active) setLocations(value); }).catch(() => undefined);
    void loadManagementDailySnapshots(userId).then(value => { if (active) setRetainedSnapshots(value); })
      .catch(() => { if (active) setLoadError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  const inventoryLines = Object.values(inventory).filter(line => quantityFields.some(field => line[field].trim())).map(line => ({
    ...line, openingQuantity: decimal(line.openingQuantity), purchasesQuantity: decimal(line.purchasesQuantity), closingQuantity: decimal(line.closingQuantity),
  }));
  const salesLines = Object.values(sales).filter(line => salesFields.some(field => line[field].trim())).map(line => ({
    ...line, quantity: decimal(line.quantity), revenue: decimal(line.revenue),
  }));
  const saleRecipes = recipes.filter(recipe => !recipe.isSubRecipe);
  const catalogIds = new Set(catalog.map(item => item.id));
  const recipeIds = new Set(saleRecipes.map(item => item.id));
  const savedCatalogIds = new Set(snapshot?.inventory.map(line => line.catalogId));
  const savedRecipeIds = new Set(snapshot?.sales.map(line => line.recipeId));
  const historicalInventory = inventoryLines.filter(line => !line.catalogId || !catalogIds.has(line.catalogId));
  const historicalSales = salesLines.filter(line => !line.recipeId || !recipeIds.has(line.recipeId));
  const additionalLabor = snapshot?.labor.slice(1) ?? [];
  const savedUnitCost = locale === 'ro' ? 'Cost unitar salvat' : 'Saved unit cost';
  const savedPortionCost = locale === 'ro' ? 'Cost pe porție salvat' : 'Saved cost per portion';
  const workHours = decimal(hours);
  const rate = decimal(hourlyCost);
  const validDate = isIsoDate(date);
  const validNumbers = inventoryLines.every(line => quantityFields.every(field => Number.isFinite(line[field])))
    && salesLines.every(line => salesFields.every(field => Number.isFinite(line[field])))
    && Number.isFinite(workHours) && workHours <= 24 && Number.isFinite(rate);
  const validLabor = Boolean(employeeName.trim()) || !(employeeRole.trim() || hours.trim() || hourlyCost.trim());
  const canPromote = Boolean(snapshot && (snapshot.syncFormat === 2 || snapshot.promote)
    && snapshot.syncState !== 'local' && snapshot.labor.every((_, index) => snapshot.laborIds?.[index]));
  const conflict = snapshot?.syncIssue === 'daily_conflict';
  const validation = !validDate
    ? (locale === 'ro' ? 'Introdu o dată validă (AAAA-LL-ZZ).' : 'Enter a valid date (YYYY-MM-DD).')
    : !validNumbers
      ? (locale === 'ro' ? 'Introdu valori numerice pozitive sau zero și cel mult 24 de ore.' : 'Enter nonnegative numbers and no more than 24 hours.')
      : !validLabor
        ? (locale === 'ro' ? 'Completează numele angajatului.' : 'Enter the employee name.')
        : employeeName.trim().length > 160 || employeeRole.trim().length > 100
          ? (locale === 'ro' ? 'Scurtează numele sau funcția angajatului.' : 'Shorten the employee name or role.')
          : null;
  const variance = calculateCostVariance(salesLines, inventoryLines);
  // The saved report retains prices and totals, but does not retain each recipe's ingredient breakdown.
  const ingredientVariances = snapshot ? [] : calculateIngredientVariances(salesLines, inventoryLines, recipes);
  const revenue = salesLines.reduce((sum, line) => sum + line.revenue, 0);
  const payroll = additionalLabor.reduce((total, line) => total + laborCost(line.hours, line.hourlyCost), laborCost(workHours, rate));
  const prime = primeCost(revenue, variance.actualCost, payroll);

  const updateInventory = (id: string, field: QuantityField, raw: string) => {
    const ingredient = catalog.find((item) => item.id === id);
    if (!ingredient) return;
    editDraft((current) => {
      const previous = current.inventory[id] ?? {
        catalogId: id,
        name: ingredient.name,
        openingQuantity: '',
        purchasesQuantity: '',
        closingQuantity: '',
        unitCost: ingredient.purchasePrice,
      };
      return { ...current, inventory: { ...current.inventory, [id]: { ...previous, [field]: raw } } };
    });
  };

  const updateSale = (id: string, field: SalesField, raw: string) => {
    const recipe = recipes.find((item) => item.id === id);
    if (!recipe) return;
    editDraft((current) => {
      const previous = current.sales[id] ?? {
        recipeId: id,
        name: recipe.title,
        quantity: '',
        revenue: '',
        theoreticalUnitCost: recipe.totals.portionCost,
      };
      return { ...current, sales: { ...current.sales, [id]: { ...previous, [field]: raw } } };
    });
  };

  const save = async (promote = false) => {
    if (loading || loadError || savingRef.current || conflict || (promote ? !canPromote || !snapshot : legacy || validation)) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const id = snapshot?.id ?? (draftIds.current[draftKey] ??= createManagementId());
      const firstLabor = employeeName.trim() ? [{ employeeName: employeeName.trim(), role: employeeRole.trim(), hours: workHours, hourlyCost: rate }] : [];
      const saved = await saveManagementSnapshot(userId, promote && snapshot ? {
        id: snapshot.id, date: snapshot.date, locationId: snapshot.locationId, inventory: snapshot.inventory,
        sales: snapshot.sales, labor: snapshot.labor, laborIds: snapshot.laborIds, promote: true,
      } : {
        id, date, inventory: inventoryLines, sales: salesLines,
        labor: [...firstLabor, ...additionalLabor],
        laborIds: firstLabor.length ? snapshot?.laborIds : snapshot?.laborIds?.slice(1),
        locationId: selectedLocation, serverVersion: snapshot?.serverVersion,
      });
      setRetainedSnapshots(current => [saved, ...current.filter(item => item.id !== saved.id)]);
      if (saved.syncIssue) {
        Alert.alert(t('operational.common.notSaved'), saved.syncIssue === 'daily_conflict'
          ? (locale === 'ro' ? 'Raportul de pe server este diferit. Varianta locală a fost păstrată.' : 'The server report differs. Your local version was retained.')
          : (locale === 'ro' ? 'Serverul a refuzat salvarea. Verifică valorile și reîncearcă.' : 'The server rejected the save. Check the values and try again.'));
        return;
      }
      void trackEvent(userId === 'demo' ? null : userId, 'management_control_saved', {
        inventoryLines: inventoryLines.length,
        salesLines: salesLines.length,
        hasLabor: Boolean(employeeName.trim()),
      });
      Alert.alert(t('operational.management.saved'), saved.syncState === 'synced' ? t('operational.management.synced') : t('operational.management.offline'));
    } catch (error) {
      const message = error instanceof ManagementDayPendingError
        ? (locale === 'ro' ? 'Sincronizează mai întâi salvarea anterioară, apoi reîncearcă.' : 'Sync the previous save, then try these changes again.')
        : error instanceof Error ? error.message : t('operational.common.tryAgain');
      Alert.alert(t('operational.common.notSaved'), message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const chooseRemote = async () => {
    if (!snapshot || savingRef.current) return;
    try {
      const remote = await acceptRemoteManagementDay(userId, snapshot.id);
      if (!remote) return;
      setRetainedSnapshots(current => [remote, ...current.filter(item => item.id !== snapshot.id && item.id !== remote.id)]);
      setDrafts(current => {
        const next = { ...current };
        delete next[draftKey];
        return next;
      });
      setHistorySelection(remote.id);
    } catch (error) {
      Alert.alert(t('operational.common.notSaved'), error instanceof Error ? error.message : t('operational.common.tryAgain'));
    }
  };

  const importSales = async () => {
    if (legacy || conflict || loading || loadError) return;
    const picked = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/plain', 'application/vnd.ms-excel'], copyToCacheDirectory: true, multiple: false });
    if (picked.canceled || !picked.assets[0]) return;
    try {
      const text = await readDocumentText(picked.assets[0].uri);
      const mapped = mapSalesRows(parseSalesCsv(text), recipes.filter((item) => !item.isSubRecipe).map((item) => ({ id: item.id, title: item.title, portionCost: item.totals.portionCost })));
      editDraft(current => ({ ...current, sales: salesDraft(mapped.filter(item => item.recipeId)) }));
      const unmatched = mapped.filter((item) => !item.recipeId).length;
      Alert.alert(t('operational.management.imported'), t('operational.management.importSummary', { matched: mapped.length - unmatched, unmatched: unmatched ? t('operational.management.unmatched', { count: unmatched }) : '' }));
    } catch {
      Alert.alert(t('operational.management.importError'), t('operational.management.csv'));
    }
  };

  return (
    <Screen bottomSafeArea footer={<AppButton label={t('operational.management.save')} icon="checkmark-circle-outline" fullWidth loading={saving || loading} disabled={Boolean(validation || legacy || conflict || loadError)} onPress={() => void save()} />}>
      <ToolHeader title={t('operational.management.title')} subtitle={t('operational.management.subtitle')} />
      {loadError && <Card tone="gold"><Body>{locale === 'ro' ? 'Rapoartele nu au putut fi citite. Redeschide ecranul și reîncearcă.' : 'Reports could not be read. Reopen this screen to try again.'}</Body></Card>}
      {conflict && <Card tone="gold">
        <Body>{locale === 'ro' ? 'Varianta locală a fost păstrată. Poți încărca raportul de pe server în locul ei.' : 'Your local version was kept. You can replace it with the server report.'}</Body>
        {snapshot?.remoteConflict && <AppButton label={locale === 'ro' ? 'Încarcă raportul de pe server' : 'Use server report'} onPress={() => void chooseRemote()} />}
      </Card>}
      {legacy && !conflict && <Card tone="gold">
        <Body>{locale === 'ro' ? 'Acest raport a fost păstrat dintr-o versiune anterioară.' : 'This report was retained from an earlier version.'}</Body>
        {canPromote && <AppButton label={locale === 'ro' ? 'Verifică și recuperează raportul' : 'Verify and recover report'} loading={saving} onPress={() => void save(true)} />}
      </Card>}
      {snapshot?.syncIssue === 'daily_rejected' && <Card tone="gold">
        <Body>{locale === 'ro' ? 'Serverul a refuzat ultima salvare. Valorile au rămas pe dispozitiv.' : 'The server rejected the last save. The values are still on this device.'}</Body>
      </Card>}
      {snapshot?.syncState === 'pending' && !snapshot.syncIssue && <Card tone="gold">
        <Body>{t('operational.management.offline')}</Body>
      </Card>}
      {retainedSnapshots.some(item => item.syncIssue === 'legacy_daily_requires_review') && (
        <Card tone="gold">
          <Body>{locale === 'ro'
            ? 'Reconciliere necesară: unele rapoarte din versiuni anterioare au fost păstrate pe dispozitiv. Nu putem confirma ce linii au ajuns deja pe server, iar retrimiterea automată poate dubla vânzările sau costurile. Compară rapoartele de mai jos cu datele de pe server înainte de a reintroduce linii lipsă.'
            : 'Reconciliation required: some reports from earlier versions are retained on this device. We cannot confirm which lines already reached the server, and automatic resending could duplicate sales or costs. Compare the reports below with the server records before re-entering missing lines.'}</Body>
          {retainedSnapshots.filter(item => item.syncIssue === 'legacy_daily_requires_review').map(item => (
            <View key={item.id}>
              <Text style={styles.name}>{item.date}</Text>
              <Text style={styles.meta}>{locale === 'ro'
                ? `${item.inventory.length} linii inventar · ${item.sales.length} linii vânzări · ${item.labor.length} linii personal`
                : `${item.inventory.length} inventory lines · ${item.sales.length} sales lines · ${item.labor.length} labor lines`}</Text>
              {item.sales.map((line, index) => <Text key={`sales-${index}`} style={styles.meta}>{line.name}: {format.number(line.quantity)} · {format.money(line.revenue)}</Text>)}
              {item.labor.map((line, index) => <Text key={`labor-${index}`} style={styles.meta}>{line.employeeName}: {format.number(line.hours)} h · {format.money(line.hourlyCost)}/h</Text>)}
            </View>
          ))}
        </Card>
      )}
      <Card tone="navy">
        <Field label={t('operational.management.date')} value={date} onChangeText={(value) => { setHistorySelection(undefined); setDate(value); }} />
        {validation && <Text accessibilityRole="alert" style={styles.lightNote}>{validation}</Text>}
        {!!locations.length && (
          <ChoiceRow
            label={t('operational.management.location')}
            options={[{ value: 'all', label: 'General' }, ...locations.map((location) => ({ value: location.id, label: location.name }))]}
            value={locationId}
            onChange={(value) => { setHistorySelection(undefined); setLocationId(value); }}
          />
        )}
        <View style={styles.kpis}>
          <Kpi label={t('operational.management.theoreticalCost')} value={format.money(variance.theoreticalCost)} />
          <Kpi label={t('operational.management.actualConsumption')} value={format.money(variance.actualCost)} />
          <Kpi label={t('operational.management.variance')} value={format.money(variance.varianceValue)} alert={variance.varianceValue > 0} />
          <Kpi label="Prime Cost" value={prime.percent === null ? '—' : format.percent(prime.percent)} alert={(prime.percent ?? 0) > 65} />
        </View>
      </Card>

      {retainedSnapshots.length > 0 && <Card>
        <SectionHeader title={locale === 'ro' ? 'Rapoarte recente' : 'Recent reports'} />
        {retainedSnapshots.slice(0, 8).map(item => <AppButton key={item.id}
          label={`${item.date} · ${item.locationId === null ? 'General' : locations.find(location => location.id === item.locationId)?.name ?? `${locale === 'ro' ? 'Locație' : 'Location'} ${item.locationId.slice(0, 8)}`}`}
          variant="secondary" onPress={() => { setHistorySelection(item.id); setDate(item.date); setLocationId(item.locationId ?? 'all'); }}
        />)}
      </Card>}

      {(historicalInventory.length > 0 || historicalSales.length > 0 || additionalLabor.length > 0) && <Card>
        <SectionHeader title={locale === 'ro' ? 'Alte linii salvate în raport' : 'Other saved report lines'} />
        {historicalInventory.map((line, index) => <View key={`inventory-${index}`}>
          <Text style={styles.name}>{line.name}</Text>
          <Text style={styles.meta}>{t('operational.management.opening')} {format.number(line.openingQuantity)} · {t('operational.management.receipts')} {format.number(line.purchasesQuantity)} · {t('operational.management.closing')} {format.number(line.closingQuantity)}</Text>
          <Text style={styles.meta}>{savedUnitCost} {format.money(line.unitCost)}</Text>
        </View>)}
        {historicalSales.map((line, index) => <View key={`sale-${index}`}>
          <Text style={styles.name}>{line.name}</Text>
          <Text style={styles.meta}>{t('operational.management.portions')} {format.number(line.quantity)} · {t('operational.management.revenue')} {format.money(line.revenue)}</Text>
          <Text style={styles.meta}>{savedPortionCost} {format.money(line.theoreticalUnitCost)}</Text>
        </View>)}
        {additionalLabor.map((line, index) => <View key={snapshot?.laborIds?.[index + 1] ?? `labor-${index}`}>
          <Text style={styles.name}>{line.employeeName}</Text>
          <Text style={styles.meta}>{line.role ? `${line.role} · ` : ''}{format.number(line.hours)} h · {format.money(line.hourlyCost)}/h · {format.money(laborCost(line.hours, line.hourlyCost))}</Text>
        </View>)}
      </Card>}

      <Card>
        <SectionHeader eyebrow={t('operational.management.quickInventory')} title={t('operational.management.stock')} />
        <Body>{t('operational.management.formula')}</Body>
        {catalog.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={styles.copy}><Text style={styles.name}>{item.name}</Text><Text style={styles.meta}>{savedCatalogIds.has(item.id)
              ? `${savedUnitCost} ${format.money(inventory[item.id]?.unitCost ?? item.purchasePrice)}`
              : `${format.money(item.purchasePrice)}/${item.priceUnit}`}</Text></View>
            <SmallField label={t('operational.management.opening')} value={inventory[item.id]?.openingQuantity} editable={!legacy} onChange={(v) => updateInventory(item.id, 'openingQuantity', v)} />
            <SmallField label={t('operational.management.receipts')} value={inventory[item.id]?.purchasesQuantity} editable={!legacy} onChange={(v) => updateInventory(item.id, 'purchasesQuantity', v)} />
            <SmallField label={t('operational.management.closing')} value={inventory[item.id]?.closingQuantity} editable={!legacy} onChange={(v) => updateInventory(item.id, 'closingQuantity', v)} />
          </View>
        ))}
        {!catalog.length && <StatusPill label={t('operational.management.empty')} status="watch" />}
        <Text style={styles.total}>{t('operational.management.closingValue', { value: format.money(inventoryValue(inventoryLines)) })}</Text>
      </Card>

      {!!ingredientVariances.length && !!salesLines.length && (
        <Card tone={ingredientVariances.some((item) => item.varianceValue > 0) ? 'gold' : 'soft'}>
          <SectionHeader eyebrow={t('operational.management.ingredientVariance')} title={t('operational.management.comparison')} />
          <Body>{t('operational.management.varianceNote')}</Body>
          <View style={styles.varianceHeader}>
            <Text style={[styles.varianceHead, styles.copy]}>Ingredient</Text>
            <Text style={styles.varianceHead}>{t('operational.management.theoretical')}</Text>
            <Text style={styles.varianceHead}>{t('operational.management.actual')}</Text>
            <Text style={styles.varianceHead}>{t('operational.management.variance')}</Text>
          </View>
          {ingredientVariances.slice(0, 12).map((item) => (
            <View key={item.catalogId ?? item.name} style={styles.varianceRow}>
              <View style={styles.copy}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={[styles.meta, item.varianceValue > 0 && styles.varianceAlert]}>
                  {item.varianceValue > 0 ? '+' : ''}{format.money(item.varianceValue)}
                  {item.variancePercent === null ? '' : ` · ${item.variancePercent > 0 ? '+' : ''}${format.percent(item.variancePercent)}`}
                </Text>
              </View>
              <Text style={styles.varianceNumber}>{format.number(item.theoreticalQuantity)}</Text>
              <Text style={styles.varianceNumber}>{format.number(item.actualQuantity)}</Text>
              <Text style={[styles.varianceNumber, item.varianceQuantity > 0 && styles.varianceAlert]}>
                {item.varianceQuantity > 0 ? '+' : ''}{format.number(item.varianceQuantity)}
              </Text>
            </View>
          ))}
        </Card>
      )}

      <Card>
        <SectionHeader eyebrow={t('operational.management.sales')} title={t('operational.management.recipeCost')} />
        <Body>{t('operational.management.salesNote')}</Body>
        <AppButton label={t('operational.management.import')} icon="document-attach-outline" variant="secondary" disabled={legacy || conflict || loading || loadError} onPress={() => void importSales()} />
        {saleRecipes.map((recipe) => (
          <View key={recipe.id} style={styles.row}>
            <View style={styles.copy}><Text style={styles.name}>{recipe.title}</Text><Text style={styles.meta}>{savedRecipeIds.has(recipe.id)
              ? `${savedPortionCost} ${format.money(sales[recipe.id]?.theoreticalUnitCost ?? recipe.totals.portionCost)}`
              : t('operational.management.portionCost', { value: format.money(recipe.totals.portionCost) })}</Text></View>
            <SmallField label={t('operational.management.portions')} value={sales[recipe.id]?.quantity} editable={!legacy} onChange={(v) => updateSale(recipe.id, 'quantity', v)} />
            <SmallField label={t('operational.management.revenue')} value={sales[recipe.id]?.revenue} editable={!legacy} onChange={(v) => updateSale(recipe.id, 'revenue', v)} />
          </View>
        ))}
      </Card>

      <Card tone="soft">
        <SectionHeader eyebrow={t('operational.management.staff')} title={t('operational.management.shiftCost')} />
        <Field label={t('operational.management.employee')} value={employeeName} editable={!legacy} onChangeText={(value) => editDraft(current => ({ ...current, employeeName: value }))} />
        <Field label={t('operational.management.role')} value={employeeRole} editable={!legacy} onChangeText={(value) => editDraft(current => ({ ...current, employeeRole: value }))} />
        <View style={styles.inline}><Field style={styles.flex} label={t('operational.management.hours')} keyboardType="decimal-pad" value={hours} editable={!legacy} onChangeText={(value) => editDraft(current => ({ ...current, hours: value }))} /><Field style={styles.flex} label={t('operational.management.hourlyCost')} keyboardType="decimal-pad" value={hourlyCost} editable={!legacy} onChangeText={(value) => editDraft(current => ({ ...current, hourlyCost: value }))} /></View>
        <Text style={styles.total}>{t('operational.management.payroll', { value: format.money(payroll) })}</Text>
      </Card>

      {variance.varianceValue > 0 && (
        <Card tone="gold">
          <View style={styles.alertTitle}><Ionicons name="alert-circle-outline" size={22} color={Brand.amber} /><Text style={styles.name}>{t('operational.management.over')}</Text></View>
          <Body>{t('operational.management.overNote')}</Body>
        </Card>
      )}
    </Screen>
  );
}

function SmallField({ label, value, editable, onChange }: { label: string; value?: string; editable: boolean; onChange: (value: string) => void }) {
  return <Field style={styles.small} label={label} keyboardType="decimal-pad" value={value ?? ''} editable={editable} onChangeText={onChange} />;
}

function Kpi({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return <View style={styles.kpi}><Text style={styles.kpiLabel}>{label}</Text><Text style={[styles.kpiValue, alert && styles.red]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  lightNote: { color: '#FFB4AB', fontSize: 12, marginBottom: 8 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpi: { width: '48%', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', padding: 10 },
  kpiLabel: { color: '#C5D7DF', fontSize: 9, fontFamily: Fonts.bold, textTransform: 'uppercase' },
  kpiValue: { color: Brand.white, fontSize: 17, fontFamily: Fonts.extraBold, marginTop: 4, ...TabularNumbers },
  red: { color: '#FFB4AB' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, borderTopWidth: 1, borderTopColor: Brand.line, paddingTop: 10 },
  copy: { flex: 1, minWidth: 90, alignSelf: 'center' },
  name: { color: Brand.navyDeep, fontSize: 13, fontFamily: Fonts.extraBold },
  meta: { color: Brand.muted, fontSize: 9, marginTop: 2 },
  small: { width: 70 },
  total: { color: Brand.navyDeep, fontSize: 15, fontFamily: Fonts.extraBold, textAlign: 'right', ...TabularNumbers },
  inline: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  alertTitle: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  varianceHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: Brand.line, paddingBottom: 6 },
  varianceHead: { width: 58, color: Brand.muted, fontSize: 8, textAlign: 'right', fontFamily: Fonts.bold, textTransform: 'uppercase' },
  varianceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: Brand.line, paddingVertical: 8 },
  varianceNumber: { width: 58, color: Brand.navyDeep, fontSize: 11, textAlign: 'right', fontFamily: Fonts.bold, ...TabularNumbers },
  varianceAlert: { color: Brand.red },
});
