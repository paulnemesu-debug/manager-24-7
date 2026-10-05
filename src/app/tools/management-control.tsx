/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { readDocumentText } from '@/lib/document-bytes';
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { ToolHeader } from '@/components/tool-header';
import { ChoiceRow } from '@/components/inputs';
import { AppButton, Body, Card, Field, Screen, SectionHeader, StatusPill } from '@/components/ui';
import { Brand, Fonts, TabularNumbers } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { usePreferences } from '@/contexts/preferences-context';
import { useWorkspace } from '@/contexts/workspace-context';
import { calculateCostVariance, calculateIngredientVariances, inventoryValue, laborCost, mapSalesRows, parseSalesCsv, primeCost, type InventoryLine, type SalesLine } from '@/lib/management-control';
import { createManagementId, saveManagementSnapshot } from '@/lib/management-repository';
import { listLocations, type BusinessLocation } from '@/lib/locations-repository';
import { trackEvent } from '@/lib/telemetry';

const number = (value: string) => Math.max(0, Number(value.replace(',', '.').replace(/[^0-9.]/g, '')) || 0);
const today = () => new Date().toISOString().slice(0, 10);

export default function ManagementControlScreen() {
  const auth = useAuth();
  const { catalog, recipes } = useWorkspace();
  const { format } = usePreferences();
  const [date, setDate] = useState(today());
  const [inventory, setInventory] = useState<Record<string, InventoryLine>>({});
  const [sales, setSales] = useState<Record<string, SalesLine>>({});
  const [employeeName, setEmployeeName] = useState('');
  const [employeeRole, setEmployeeRole] = useState('');
  const [hours, setHours] = useState('');
  const [hourlyCost, setHourlyCost] = useState('');
  const [saving, setSaving] = useState(false);
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [locationId, setLocationId] = useState('all');

  useEffect(() => {
    void listLocations(auth.user?.id ?? 'demo').then(setLocations).catch(() => undefined);
  }, [auth.user?.id]);

  const inventoryLines = Object.values(inventory).filter((line) => line.openingQuantity || line.purchasesQuantity || line.closingQuantity);
  const salesLines = Object.values(sales).filter((line) => line.quantity || line.revenue);
  const variance = useMemo(() => calculateCostVariance(salesLines, inventoryLines), [inventoryLines, salesLines]);
  const ingredientVariances = useMemo(
    () => calculateIngredientVariances(salesLines, inventoryLines, recipes),
    [inventoryLines, recipes, salesLines],
  );
  const revenue = salesLines.reduce((sum, line) => sum + line.revenue, 0);
  const payroll = laborCost(number(hours), number(hourlyCost));
  const prime = primeCost(revenue, variance.actualCost, payroll);

  const updateInventory = (id: string, field: keyof InventoryLine, raw: string) => {
    const ingredient = catalog.find((item) => item.id === id);
    if (!ingredient) return;
    setInventory((current) => {
      const previous = current[id] ?? {
        catalogId: id,
        name: ingredient.name,
        openingQuantity: 0,
        purchasesQuantity: 0,
        closingQuantity: 0,
        unitCost: ingredient.purchasePrice,
      };
      return { ...current, [id]: { ...previous, [field]: number(raw) } };
    });
  };

  const updateSale = (id: string, field: 'quantity' | 'revenue', raw: string) => {
    const recipe = recipes.find((item) => item.id === id);
    if (!recipe) return;
    setSales((current) => {
      const previous = current[id] ?? {
        recipeId: id,
        name: recipe.title,
        quantity: 0,
        revenue: 0,
        theoreticalUnitCost: recipe.totals.portionCost,
      };
      return { ...current, [id]: { ...previous, [field]: number(raw) } };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const snapshot = await saveManagementSnapshot(auth.user?.id ?? 'demo', {
        id: createManagementId(), date, inventory: inventoryLines, sales: salesLines,
        labor: employeeName.trim() ? [{ employeeName, role: employeeRole, hours: number(hours), hourlyCost: number(hourlyCost) }] : [],
        locationId: locationId === 'all' ? null : locationId,
      });
      void trackEvent(auth.user?.id ?? null, 'management_control_saved', {
        inventoryLines: inventoryLines.length,
        salesLines: salesLines.length,
        hasLabor: Boolean(employeeName.trim()),
      });
      Alert.alert('Salvat', snapshot.syncState === 'synced' ? 'Controlul zilnic a fost sincronizat.' : 'Controlul zilnic este salvat offline și va putea fi sincronizat.');
    } catch (error) {
      Alert.alert('Nu s-a salvat', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally {
      setSaving(false);
    }
  };

  const importSales = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/plain', 'application/vnd.ms-excel'], copyToCacheDirectory: true, multiple: false });
    if (picked.canceled || !picked.assets[0]) return;
    try {
      const text = await readDocumentText(picked.assets[0].uri);
      const mapped = mapSalesRows(parseSalesCsv(text), recipes.filter((item) => !item.isSubRecipe).map((item) => ({ id: item.id, title: item.title, portionCost: item.totals.portionCost })));
      setSales(Object.fromEntries(mapped.filter((item) => item.recipeId).map((item) => [item.recipeId!, item])));
      const unmatched = mapped.filter((item) => !item.recipeId).length;
      Alert.alert('Vânzări importate', `${mapped.length - unmatched} preparate potrivite${unmatched ? ` · ${unmatched} rânduri necesită potrivire manuală` : ''}.`);
    } catch {
      Alert.alert('Import nereușit', 'Folosește un CSV cu denumire produs, cantitate și valoare.');
    }
  };

  return (
    <Screen bottomSafeArea footer={<AppButton label="Salvează controlul zilnic" icon="checkmark-circle-outline" fullWidth loading={saving} onPress={() => void save()} />}>
      <ToolHeader title="Control operațional" subtitle="Inventar, vânzări, personal și abaterea costului într-un singur raport." />
      <Card tone="navy">
        <Field label="Data raportului" value={date} onChangeText={setDate} />
        {!!locations.length && (
          <ChoiceRow
            label="Locație"
            options={[{ value: 'all', label: 'General' }, ...locations.map((location) => ({ value: location.id, label: location.name }))]}
            value={locationId}
            onChange={setLocationId}
          />
        )}
        <View style={styles.kpis}>
          <Kpi label="Cost teoretic" value={format.money(variance.theoreticalCost)} />
          <Kpi label="Consum real" value={format.money(variance.actualCost)} />
          <Kpi label="Abatere" value={format.money(variance.varianceValue)} alert={variance.varianceValue > 0} />
          <Kpi label="Prime Cost" value={prime.percent === null ? '—' : format.percent(prime.percent)} alert={(prime.percent ?? 0) > 65} />
        </View>
      </Card>

      <Card>
        <SectionHeader eyebrow="INVENTAR RAPID" title="Stoc și consum real" />
        <Body>Stoc inițial + intrări − stoc final = consum real. Completează numai produsele numărate.</Body>
        {catalog.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={styles.copy}><Text style={styles.name}>{item.name}</Text><Text style={styles.meta}>{format.money(item.purchasePrice)}/{item.priceUnit}</Text></View>
            <SmallField label="Inițial" value={inventory[item.id]?.openingQuantity} onChange={(v) => updateInventory(item.id, 'openingQuantity', v)} />
            <SmallField label="Intrări" value={inventory[item.id]?.purchasesQuantity} onChange={(v) => updateInventory(item.id, 'purchasesQuantity', v)} />
            <SmallField label="Final" value={inventory[item.id]?.closingQuantity} onChange={(v) => updateInventory(item.id, 'closingQuantity', v)} />
          </View>
        ))}
        {!catalog.length && <StatusPill label="Adaugă mai întâi ingredientele" status="watch" />}
        <Text style={styles.total}>Valoarea stocului final: {format.money(inventoryValue(inventoryLines))}</Text>
      </Card>

      {!!ingredientVariances.length && !!salesLines.length && (
        <Card tone={ingredientVariances.some((item) => item.varianceValue > 0) ? 'gold' : 'soft'}>
          <SectionHeader eyebrow="VARIANȚĂ PE INGREDIENT" title="Teoretic vs. consum real" />
          <Body>Pozitiv înseamnă că s-a consumat mai mult decât rezultă din rețetele vândute. Sortează automat pierderile cu impactul financiar cel mai mare.</Body>
          <View style={styles.varianceHeader}>
            <Text style={[styles.varianceHead, styles.copy]}>Ingredient</Text>
            <Text style={styles.varianceHead}>Teoretic</Text>
            <Text style={styles.varianceHead}>Real</Text>
            <Text style={styles.varianceHead}>Abatere</Text>
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
        <SectionHeader eyebrow="VÂNZĂRI" title="Cost teoretic din rețete" />
        <Body>Introdu cantitatea vândută și încasarea. Maparea rămâne legată de rețetă.</Body>
        <AppButton label="Importă vânzări CSV/POS" icon="document-attach-outline" variant="secondary" onPress={() => void importSales()} />
        {recipes.filter((recipe) => !recipe.isSubRecipe).map((recipe) => (
          <View key={recipe.id} style={styles.row}>
            <View style={styles.copy}><Text style={styles.name}>{recipe.title}</Text><Text style={styles.meta}>Cost {format.money(recipe.totals.portionCost)}/porție</Text></View>
            <SmallField label="Porții" value={sales[recipe.id]?.quantity} onChange={(v) => updateSale(recipe.id, 'quantity', v)} />
            <SmallField label="Încasări" value={sales[recipe.id]?.revenue} onChange={(v) => updateSale(recipe.id, 'revenue', v)} />
          </View>
        ))}
      </Card>

      <Card tone="soft">
        <SectionHeader eyebrow="PERSONAL" title="Costul real al turei" />
        <Field label="Angajat" value={employeeName} onChangeText={setEmployeeName} />
        <Field label="Rol" value={employeeRole} onChangeText={setEmployeeRole} />
        <View style={styles.inline}><Field style={styles.flex} label="Ore" keyboardType="decimal-pad" value={hours} onChangeText={setHours} /><Field style={styles.flex} label="Cost total/oră" keyboardType="decimal-pad" value={hourlyCost} onChangeText={setHourlyCost} /></View>
        <Text style={styles.total}>Cost tură: {format.money(payroll)}</Text>
      </Card>

      {variance.varianceValue > 0 && (
        <Card tone="gold">
          <View style={styles.alertTitle}><Ionicons name="alert-circle-outline" size={22} color={Brand.amber} /><Text style={styles.name}>Consum peste costul teoretic</Text></View>
          <Body>Verifică prețurile de achiziție, porționarea, pierderile, producția nevândută și respectarea rețetelor.</Body>
        </Card>
      )}
    </Screen>
  );
}

function SmallField({ label, value, onChange }: { label: string; value?: number; onChange: (value: string) => void }) {
  return <Field style={styles.small} label={label} keyboardType="decimal-pad" value={value ? String(value) : ''} onChangeText={onChange} />;
}

function Kpi({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return <View style={styles.kpi}><Text style={styles.kpiLabel}>{label}</Text><Text style={[styles.kpiValue, alert && styles.red]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
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
