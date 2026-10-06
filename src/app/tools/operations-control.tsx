import { workforceTranslator } from '@/i18n/workforce-translations';
/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { HaccpDateInput } from '@/components/haccp-date-input';
import { ChoiceRow, Select } from '@/components/inputs';
import { ToolHeader } from '@/components/tool-header';
import { AppButton, Body, Card, Field, Screen, SectionHeader, StatusPill } from '@/components/ui';
import { Brand, Fonts, TabularNumbers } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useFocusedSyncRetry } from '@/hooks/use-focused-sync-retry';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { useWorkspace } from '@/contexts/workspace-context';
import { listLocations, type BusinessLocation } from '@/lib/locations-repository';
import { createManagementId, loadManagementSnapshots, saveInventoryCount } from '@/lib/management-repository';
import { buildRestockSuggestions, groupRestockBySupplier, nextInventoryDueDate, totalWasteValue } from '@/lib/operations-control';
import {
  loadOperationsControlData,
  saveInventorySchedule,
  saveStockPolicy,
  saveSupplierOrder,
  saveWasteEntry,
  type OperationsControlData,
} from '@/lib/operations-control-repository';
import { shareOnWhatsApp } from '@/lib/share-links';
import { localIsoDate } from '@/lib/local-date-time';
import { displayUnit } from '@/lib/display-unit';
import type { InventoryLine } from '@/lib/management-control';
import type { InventoryFrequency, StockPolicy, SupplierOrder, WasteReason } from '@/types/operations-control';

type ViewMode = 'orders' | 'waste' | 'inventory';
type PolicyDraftRow = { id?: string; minimum: string; target: string; zone: string };
const emptyData: OperationsControlData = { policies: [], orders: [], waste: [], schedules: [] };
const numeric = (value: string) => Math.max(0, Number(value.replace(',', '.').replace(/[^0-9.]/g, '')) || 0);

const WASTE_REASONS: { value: WasteReason; label: string }[] = [
  { value: 'expired', label: 'Expirat' },
  { value: 'preparation', label: 'Preparare' },
  { value: 'overproduction', label: 'Supraproducție' },
  { value: 'quality', label: 'Calitate' },
  { value: 'plate', label: 'Farfurie' },
  { value: 'other', label: 'Altul' },
];

export default function OperationsControlScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const auth = useAuth();
  const { locale } = useI18n();
  const tr = workforceTranslator(locale);
  const wasteReasons = WASTE_REASONS.map(item => ({ ...item, label: tr(item.label as keyof typeof import('@/i18n/workforce-translations').workforceEnglish) }));
  const { format } = usePreferences();
  const { catalog } = useWorkspace();
  const userId = auth.user?.id ?? 'demo';
  const [mode, setMode] = useState<ViewMode>('orders');
  useEffect(() => { if (params.mode === 'orders' || params.mode === 'waste' || params.mode === 'inventory') setMode(params.mode); }, [params.mode]);
  const [data, setData] = useState<OperationsControlData>(emptyData);
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [locationId, setLocationId] = useState('all');
  const [policies, setPolicies] = useState<Record<string, PolicyDraftRow>>({});
  const [onHand, setOnHand] = useState<Record<string, string>>({});
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [wasteDate, setWasteDate] = useState(localIsoDate());
  const [wasteCatalogId, setWasteCatalogId] = useState<string | null>(null);
  const [wasteQuantity, setWasteQuantity] = useState('');
  const [wasteReason, setWasteReason] = useState<WasteReason>('preparation');
  const [wasteNotes, setWasteNotes] = useState('');
  const [frequency, setFrequency] = useState<InventoryFrequency>('weekly');
  const [weekday, setWeekday] = useState('1');
  const [monthDay, setMonthDay] = useState('1');
  const formDirty = useRef(false);
  const scheduleDirty = useRef(false);

  const actualLocationId = locationId === 'all' ? null : locationId;
  useFocusedSyncRetry(useCallback(() => loadOperationsControlData(userId).then(setData), [userId]));

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadOperationsControlData(userId),
      listLocations(userId),
      loadManagementSnapshots(userId),
    ]).then(([nextData, nextLocations, snapshots]) => {
      if (!active) return;
      setData(nextData);
      setLocations(nextLocations);
      const latest = snapshots[0];
      if (latest) setOnHand(Object.fromEntries(latest.inventory.filter((line) => line.catalogId).map((line) => [line.catalogId!, String(line.closingQuantity)])));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    setWasteCatalogId((current) => current ?? catalog[0]?.id ?? null);
  }, [catalog]);

  useEffect(() => {
    const rows = catalog.reduce<Record<string, PolicyDraftRow>>((result, ingredient) => {
      const existing = data.policies.find((item) => item.catalogId === ingredient.id && item.locationId === actualLocationId);
      result[ingredient.id] = {
        id: existing?.id,
        minimum: existing ? String(existing.minimumQuantity) : '',
        target: existing ? String(existing.targetQuantity) : '',
        zone: existing?.storageZone ?? '',
      };
      return result;
    }, {});
    if (!formDirty.current) setPolicies(rows);
    const schedule = data.schedules.find((item) => item.locationId === actualLocationId);
    if (schedule && !scheduleDirty.current) {
      setFrequency(schedule.frequency);
      setWeekday(String(schedule.weekday ?? 1));
      setMonthDay(String(schedule.monthDay ?? 1));
    }
  }, [actualLocationId, catalog, data.policies, data.schedules]);

  const normalizedPolicies = useMemo<StockPolicy[]>(() => catalog.flatMap((ingredient) => {
    const row = policies[ingredient.id];
    if (!row || (!row.minimum.trim() && !row.target.trim() && !row.zone.trim())) return [];
    const minimumQuantity = numeric(row.minimum);
    return [{
      id: row.id ?? `draft:${ingredient.id}`,
      catalogId: ingredient.id,
      locationId: actualLocationId,
      minimumQuantity,
      targetQuantity: Math.max(minimumQuantity, numeric(row.target)),
      storageZone: row.zone.trim(),
      updatedAt: '',
      syncState: 'local',
    }];
  }), [actualLocationId, catalog, policies]);

  const suggestions = useMemo(() => buildRestockSuggestions(
    catalog,
    normalizedPolicies,
    catalog.map((item) => ({ catalogId: item.id, onHand: numeric(onHand[item.id] ?? '') })),
    actualLocationId,
  ), [actualLocationId, catalog, normalizedPolicies, onHand]);
  const orderGroups = useMemo(() => groupRestockBySupplier(suggestions), [suggestions]);

  const saveThresholds = async () => {
    setBusy(true);
    try {
      const saved = await Promise.all(normalizedPolicies.map((policy) => saveStockPolicy(userId, {
        id: policy.id.startsWith('draft:') ? undefined : policy.id,
        catalogId: policy.catalogId,
        locationId: policy.locationId,
        minimumQuantity: policy.minimumQuantity,
        targetQuantity: policy.targetQuantity,
        storageZone: policy.storageZone,
      })));
      formDirty.current = false;
      setData((current) => ({
        ...current,
        policies: [...saved, ...current.policies.filter((item) => !saved.some((entry) => entry.id === item.id || (entry.catalogId === item.catalogId && entry.locationId === item.locationId)))],
      }));
      const pending = saved.filter((item) => item.syncState === 'pending').length;
      Alert.alert(tr("Praguri salvate"), `${saved.length} ${tr("ingrediente configurate.")}${pending ? ` ${pending} ${tr("așteaptă sincronizarea.")}` : ''}`);
    } catch (error) {
      Alert.alert(tr("Pragurile nu s-au salvat"), error instanceof Error ? error.message : tr("Încearcă din nou."));
    } finally { setBusy(false); }
  };

  const saveOrders = async () => {
    if (!orderGroups.length) return;
    setBusy(true);
    try {
      const date = localIsoDate();
      const saved = await Promise.all(orderGroups.map((group) => saveSupplierOrder(userId, {
        locationId: actualLocationId,
        supplier: group.supplier,
        orderDate: date,
        status: 'draft',
        lines: group.lines,
        totalEstimated: group.totalEstimated,
        notes: tr("Generată din pragurile de stoc Manager 24/7"),
      })));
      setData((current) => ({ ...current, orders: [...saved, ...current.orders] }));
      Alert.alert(tr("Comenzi create"), `${saved.length} ${tr("comenzi grupate pe furnizor.")}`);
    } catch (error) {
      Alert.alert(tr("Comenzile nu s-au salvat"), error instanceof Error ? error.message : tr("Încearcă din nou."));
    } finally { setBusy(false); }
  };

  const shareOrders = async () => {
    if (!orderGroups.length) return;
    const message = [
      `${tr("Comandă furnizori ·")} ${localIsoDate()}`,
      ...orderGroups.flatMap((group) => [
        `\n${group.supplier} ${tr("· estimat")} ${format.money(group.totalEstimated)}`,
        ...group.lines.map((line) => `• ${line.name}: ${format.number(line.orderQuantity)} ${displayUnit(line.unit, locale)}`),
      ]),
    ].join('\n');
    await shareOnWhatsApp(message).catch(() => Alert.alert(tr("WhatsApp nu s-a deschis")));
  };

  const updateOrderStatus = async (order: SupplierOrder, status: SupplierOrder['status']) => {
    setBusy(true);
    try {
      const saved = await saveSupplierOrder(userId, {
        id: order.id, locationId: order.locationId, supplier: order.supplier, orderDate: order.orderDate,
        status, lines: order.lines, totalEstimated: order.totalEstimated, notes: order.notes,
      });
      setData((current) => ({ ...current, orders: [saved, ...current.orders.filter((item) => item.id !== saved.id)] }));
    } finally { setBusy(false); }
  };

  const addWaste = async () => {
    const ingredient = catalog.find((item) => item.id === wasteCatalogId);
    if (!ingredient || numeric(wasteQuantity) <= 0) return;
    setBusy(true);
    try {
      const item = await saveWasteEntry(userId, {
        locationId: actualLocationId,
        eventDate: wasteDate,
        catalogId: ingredient.id,
        itemName: ingredient.name,
        quantity: numeric(wasteQuantity),
        unit: ingredient.priceUnit,
        unitCost: ingredient.purchasePrice,
        reason: wasteReason,
        notes: wasteNotes,
      });
      setData((current) => ({ ...current, waste: [item, ...current.waste] }));
      setWasteQuantity('');
      setWasteNotes('');
    } catch (error) {
      Alert.alert(tr("Risipa nu s-a salvat"), error instanceof Error ? error.message : tr("Încearcă din nou."));
    } finally { setBusy(false); }
  };

  const saveSchedule = async () => {
    setBusy(true);
    try {
      const existing = data.schedules.find((item) => item.locationId === actualLocationId);
      const nextDueDate = nextInventoryDueDate({
        from: localIsoDate(),
        frequency,
        weekday: frequency === 'weekly' ? Number(weekday) : null,
        monthDay: frequency === 'monthly' ? Number(monthDay) : null,
      });
      const item = await saveInventorySchedule(userId, {
        id: existing?.id,
        locationId: actualLocationId,
        frequency,
        weekday: frequency === 'weekly' ? Number(weekday) : null,
        monthDay: frequency === 'monthly' ? Number(monthDay) : null,
        enabled: true,
        nextDueDate,
      });
      scheduleDirty.current = false;
      setData((current) => ({ ...current, schedules: [item, ...current.schedules.filter((entry) => entry.id !== item.id)] }));
      Alert.alert(tr("Inventar programat"), `${tr("Următoarea numărătoare:")} ${format.date(`${nextDueDate}T12:00:00`)}`);
    } catch (error) {
      Alert.alert(tr("Programarea nu s-a salvat"), error instanceof Error ? error.message : tr("Încearcă din nou."));
    } finally { setBusy(false); }
  };

  const saveCount = async () => {
    const inventory: InventoryLine[] = catalog.flatMap((item) => {
      const raw = counts[item.id];
      if (!raw?.trim()) return [];
      return [{ catalogId: item.id, name: item.name, openingQuantity: 0, purchasesQuantity: 0, closingQuantity: numeric(raw), unitCost: item.purchasePrice }];
    });
    if (!inventory.length) return;
    setBusy(true);
    try {
      const snapshot = await saveInventoryCount(userId, {
        id: createManagementId(),
        date: localIsoDate(),
        inventory,
        locationId: actualLocationId,
        notes: tr("Inventar recurent pe zone de depozitare"),
      });
      setOnHand((current) => ({ ...current, ...Object.fromEntries(inventory.map((line) => [line.catalogId!, String(line.closingQuantity)])) }));
      setCounts({});
      Alert.alert(tr("Inventar salvat"), snapshot.syncState === 'synced' ? tr("Numărătoarea a fost sincronizată.") : tr("Numărătoarea este disponibilă offline."));
    } catch (error) {
      Alert.alert(tr("Inventarul nu s-a salvat"), error instanceof Error ? error.message : tr("Încearcă din nou."));
    } finally { setBusy(false); }
  };

  const filteredWaste = data.waste.filter((item) => item.locationId === actualLocationId);
  const zones = useMemo(() => {
    const policyByIngredient = new Map(normalizedPolicies.map((policy) => [policy.catalogId, policy.storageZone || tr('Nealocat')]));
    const grouped = new Map<string, typeof catalog>();
    catalog.forEach((item) => {
      const zone = policyByIngredient.get(item.id) ?? tr('Nealocat');
      grouped.set(zone, [...(grouped.get(zone) ?? []), item]);
    });
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right, locale === 'ro' ? 'ro-RO' : 'en-GB'));
  }, [catalog, normalizedPolicies, locale, tr]);
  const schedule = data.schedules.find((item) => item.locationId === actualLocationId);

  return (
    <Screen>
      <ToolHeader title={tr("Stoc, comenzi și risipă")} subtitle={tr("De la numărătoare la comandă și varianța pe ingredient.")} />
      {Object.values(data).flat().some((item) => item.syncState === 'pending') && (
        <Card tone="gold"><Body>{tr("Salvat pe dispozitiv · unele înregistrări așteaptă sincronizarea. Reîncercarea este automată când revii în aplicație sau cât timp acest ecran este deschis.")}</Body></Card>
      )}
      <View style={styles.tabs}>
        <ModeButton mode="orders" active={mode} label={tr("Comenzi")} icon="cart-outline" onPress={setMode} />
        <ModeButton mode="waste" active={mode} label={tr("Risipă")} icon="trash-bin-outline" onPress={setMode} />
        <ModeButton mode="inventory" active={mode} label={tr("Inventar")} icon="clipboard-outline" onPress={setMode} />
      </View>

      {!!locations.length && (
        <Select
          label={tr("Locație")}
          placeholder="General"
          value={locationId}
          options={[{ value: 'all', label: 'General' }, ...locations.map((item) => ({ value: item.id, label: item.name, description: item.address }))]}
          onChange={(value) => { formDirty.current = false; scheduleDirty.current = false; setLocationId(value ?? 'all'); }}
        />
      )}

      {mode === 'orders' && (
        <>
          <Card tone="navy">
            <SectionHeader eyebrow={tr('REAPROVIZIONARE')} title={tr("Praguri și stoc curent")} light />
            <Body light>{tr("La sau sub minim, aplicația propune cantitatea până la stocul țintă și grupează comanda pe furnizor.")}</Body>
          </Card>
          <Card>
            {catalog.map((item) => {
              const row = policies[item.id] ?? { minimum: '', target: '', zone: '' };
              return (
                <View key={item.id} style={styles.stockRow}>
                  <View style={styles.stockTitleRow}>
                    <View style={styles.copy}>
                      <Text style={styles.name}>{item.name}</Text>
                      <Text style={styles.meta}>{item.supplier || tr("Furnizor nealocat")} · {format.money(item.purchasePrice)}/{displayUnit(item.priceUnit, locale)}</Text>
                    </View>
                    <StatusPill label={displayUnit(item.priceUnit, locale)} status="neutral" />
                  </View>
                  <View style={styles.fieldRow}>
                    <Field style={styles.smallField} label={tr("În stoc")} keyboardType="decimal-pad" value={onHand[item.id] ?? ''} onChangeText={(value) => setOnHand((current) => ({ ...current, [item.id]: value }))} />
                    <Field style={styles.smallField} label={tr("Minim")} keyboardType="decimal-pad" value={row.minimum} onChangeText={(value) => { formDirty.current = true; setPolicies((current) => ({ ...current, [item.id]: { ...row, minimum: value } })); }} />
                    <Field style={styles.smallField} label={tr("Țintă")} keyboardType="decimal-pad" value={row.target} onChangeText={(value) => { formDirty.current = true; setPolicies((current) => ({ ...current, [item.id]: { ...row, target: value } })); }} />
                  </View>
                  <Field label={tr("Zonă de depozitare")} placeholder={tr("Ex. Camera frigorifică")} value={row.zone} onChangeText={(value) => { formDirty.current = true; setPolicies((current) => ({ ...current, [item.id]: { ...row, zone: value } })); }} />
                </View>
              );
            })}
            {!catalog.length && <Body>{tr("Adaugă ingredientele înainte de configurarea pragurilor.")}</Body>}
            <AppButton label={tr("Salvează pragurile")} icon="save-outline" fullWidth loading={busy} onPress={() => void saveThresholds()} />
          </Card>

          <Card tone={suggestions.length ? 'gold' : 'soft'}>
            <SectionHeader eyebrow={tr("PROPUNERE")} title={`${suggestions.length} ${tr("poziții de comandat")}`} />
            {!suggestions.length && <Body>{tr("Stocurile introduse sunt peste prag sau nu există praguri configurate.")}</Body>}
            {orderGroups.map((group) => (
              <View key={group.supplier} style={styles.orderGroup}>
                <View style={styles.stockTitleRow}><Text style={styles.name}>{group.supplier}</Text><Text style={styles.orderTotal}>{format.money(group.totalEstimated)}</Text></View>
                {group.lines.map((line) => <Text key={line.catalogId} style={styles.orderLine}>• {line.name}: {format.number(line.orderQuantity)} {displayUnit(line.unit, locale)}</Text>)}
              </View>
            ))}
            {!!suggestions.length && (
              <View style={styles.actions}>
                <AppButton label={tr("Creează comenzile")} icon="documents-outline" loading={busy} onPress={() => void saveOrders()} />
                <AppButton label={tr("Trimite pe WhatsApp")} icon="logo-whatsapp" variant="secondary" onPress={() => void shareOrders()} />
              </View>
            )}
          </Card>
          <Card>
            <SectionHeader eyebrow={tr("URMĂRIRE")} title={tr("Comenzi salvate")} />
            {data.orders.filter((item) => item.locationId === actualLocationId).slice(0, 30).map((order) => (
              <View key={order.id} style={styles.savedOrder}>
                <View style={styles.stockTitleRow}>
                  <View style={styles.copy}><Text style={styles.name}>{order.supplier}</Text><Text style={styles.meta}>{order.orderDate} · {order.lines.length} {tr("produse ·")} {format.money(order.totalEstimated)}</Text></View>
                  <StatusPill label={order.status === 'draft' ? tr("Ciornă") : order.status === 'sent' ? tr("Trimisă") : order.status === 'confirmed' ? tr("Confirmată") : order.status === 'received' ? tr("Recepționată") : tr("Anulată")} status={order.status === 'received' ? 'healthy' : order.status === 'cancelled' ? 'critical' : order.status === 'draft' ? 'watch' : 'neutral'} />
                </View>
                <View style={styles.actions}>
                  {order.status === 'draft' && <AppButton label={tr("Marchează trimisă")} icon="send-outline" variant="secondary" onPress={() => void updateOrderStatus(order, 'sent')} />}
                  {order.status === 'sent' && <AppButton label={tr("Confirmată")} icon="checkmark-outline" variant="secondary" onPress={() => void updateOrderStatus(order, 'confirmed')} />}
                  {(order.status === 'sent' || order.status === 'confirmed') && <AppButton label={tr("Recepționată")} icon="cube-outline" onPress={() => void updateOrderStatus(order, 'received')} />}
                </View>
              </View>
            ))}
            {!data.orders.some((item) => item.locationId === actualLocationId) && <Body>{tr("Nu există comenzi salvate pentru locația selectată.")}</Body>}
          </Card>
        </>
      )}

      {mode === 'waste' && (
        <>
          <Card tone="navy">
            <SectionHeader eyebrow={tr("REGISTRU DEȘEURI / RISIPĂ")} title={format.money(totalWasteValue(filteredWaste))} light />
            <Body light>{tr("Valoare cumulată înregistrată pentru locația selectată. Fiecare poziție păstrează motivul și costul.")}</Body>
            <AppButton label={tr("Plan, redistribuire și documente")} icon="document-text-outline" fullWidth onPress={() => router.push('/tools/waste-compliance')} />
          </Card>
          <Card>
            <SectionHeader title={tr("Înregistrează risipa")} />
            <HaccpDateInput label={tr("Data")} locale={locale} value={wasteDate} onChange={setWasteDate} />
            <Select
              label={tr("Ingredient")}
              placeholder={tr("Alege ingredientul")}
              value={wasteCatalogId}
              options={catalog.map((item) => ({ value: item.id, label: item.name, description: `${format.money(item.purchasePrice)}/${displayUnit(item.priceUnit, locale)}` }))}
              onChange={setWasteCatalogId}
            />
            <Field label={tr("Cantitate")} keyboardType="decimal-pad" value={wasteQuantity} onChangeText={setWasteQuantity} />
            <ChoiceRow label={tr("Motiv")} value={wasteReason} options={wasteReasons} onChange={setWasteReason} />
            <Field label={tr("Observații")} multiline numberOfLines={3} value={wasteNotes} onChangeText={setWasteNotes} />
            <AppButton label={tr("Adaugă în registru")} icon="add-circle-outline" fullWidth loading={busy} disabled={!wasteCatalogId || numeric(wasteQuantity) <= 0} onPress={() => void addWaste()} />
          </Card>
          <Card>
            <SectionHeader title={tr("Înregistrări recente")} />
            {filteredWaste.slice(0, 20).map((item) => (
              <View key={item.id} style={styles.wasteRow}>
                <View style={styles.copy}>
                  <Text style={styles.name}>{item.itemName}</Text>
                  <Text style={styles.meta}>{item.eventDate} · {wasteReasons.find((reason) => reason.value === item.reason)?.label ?? item.reason} · {format.number(item.quantity)} {displayUnit(item.unit, locale)}</Text>
                </View>
                <Text style={styles.wasteValue}>{format.money(item.value)}</Text>
              </View>
            ))}
            {!filteredWaste.length && <Body>{tr("Registrul nu are încă înregistrări.")}</Body>}
          </Card>
        </>
      )}

      {mode === 'inventory' && (
        <>
          <Card tone="navy">
            <SectionHeader eyebrow={tr("INVENTAR RECURENT")} title={schedule ? `${tr("Următorul:")} ${format.date(`${schedule.nextDueDate}T12:00:00`)}` : tr('Neprogramat')} light />
            <Body light>{tr("Numără pe zone, salvează fotografia stocului și folosește Control operațional pentru varianța teoretic vs. real.")}</Body>
          </Card>
          <Card>
            <SectionHeader title={tr('Programare')} />
            <ChoiceRow label={tr("Frecvență")} value={frequency} options={[{ value: 'weekly', label: tr("Săptămânal") }, { value: 'monthly', label: tr("Lunar") }]} onChange={(value) => { scheduleDirty.current = true; setFrequency(value); }} large />
            {frequency === 'weekly' ? (
              <Select label={tr("Ziua săptămânii")} placeholder={tr('Alege')} value={weekday} options={[
                { value: '1', label: tr("Luni") }, { value: '2', label: tr("Marți") }, { value: '3', label: tr("Miercuri") },
                { value: '4', label: tr("Joi") }, { value: '5', label: tr("Vineri") }, { value: '6', label: tr("Sâmbătă") }, { value: '0', label: tr("Duminică") },
              ]} onChange={(value) => { scheduleDirty.current = true; setWeekday(value ?? '1'); }} />
            ) : (
              <Field label={tr("Ziua lunii (1–28)")} keyboardType="number-pad" value={monthDay} onChangeText={(value) => { scheduleDirty.current = true; setMonthDay(value); }} />
            )}
            <AppButton label={tr("Salvează programarea")} icon="calendar-outline" fullWidth loading={busy} onPress={() => void saveSchedule()} />
          </Card>
          {zones.map(([zone, ingredients]) => (
            <Card key={zone}>
              <SectionHeader eyebrow={tr("ZONĂ")} title={zone} />
              {ingredients.map((item) => (
                <View key={item.id} style={styles.countRow}>
                  <View style={styles.copy}><Text style={styles.name}>{item.name}</Text><Text style={styles.meta}>{tr("Ultimul:")} {onHand[item.id] ? format.number(numeric(onHand[item.id])) : '—'} {displayUnit(item.priceUnit, locale)}</Text></View>
                  <Field style={styles.countField} label={`${tr("Real")} ${displayUnit(item.priceUnit, locale)}`} keyboardType="decimal-pad" value={counts[item.id] ?? ''} onChangeText={(value) => setCounts((current) => ({ ...current, [item.id]: value }))} />
                </View>
              ))}
            </Card>
          ))}
          <AppButton label={tr("Salvează numărătoarea")} icon="checkmark-circle-outline" fullWidth loading={busy} disabled={!Object.values(counts).some((value) => value.trim())} onPress={() => void saveCount()} />
          <AppButton label={tr("Deschide raportul de varianță")} icon="analytics-outline" variant="secondary" fullWidth onPress={() => router.push('/tools/management-control')} />
        </>
      )}
    </Screen>
  );
}

function ModeButton({ mode, active, label, icon, onPress }: { mode: ViewMode; active: ViewMode; label: string; icon: keyof typeof Ionicons.glyphMap; onPress: (mode: ViewMode) => void }) {
  const selected = mode === active;
  return (
    <Pressable onPress={() => onPress(mode)} style={({ pressed }) => [styles.tab, selected && styles.tabActive, pressed && styles.pressed]}>
      <Ionicons name={icon} size={19} color={selected ? Brand.white : Brand.navy} />
      <Text style={[styles.tabText, selected && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  copy: { flex: 1 },
  tabs: { flexDirection: 'row', gap: 6, padding: 5, borderRadius: 16, backgroundColor: Brand.mint },
  tab: { flex: 1, minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabActive: { backgroundColor: Brand.navy },
  tabText: { color: Brand.navy, fontSize: 10, fontFamily: Fonts.extraBold },
  tabTextActive: { color: Brand.white },
  stockRow: { gap: 8, borderBottomWidth: 1, borderBottomColor: Brand.line, paddingBottom: 12 },
  stockTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { color: Brand.navyDeep, fontSize: 13, fontFamily: Fonts.extraBold },
  meta: { color: Brand.muted, fontSize: 9.5, lineHeight: 14, marginTop: 2, fontFamily: Fonts.regular },
  fieldRow: { flexDirection: 'row', gap: 8 },
  smallField: { flex: 1 },
  orderGroup: { gap: 5, borderTopWidth: 1, borderTopColor: '#DAB85D', paddingTop: 10 },
  orderTotal: { color: Brand.navyDeep, fontSize: 14, fontFamily: Fonts.extraBold, ...TabularNumbers },
  orderLine: { color: Brand.navySoft, fontSize: 11, fontFamily: Fonts.semiBold },
  savedOrder: { gap: 9, borderBottomWidth: 1, borderBottomColor: Brand.line, paddingBottom: 11 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wasteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: Brand.line, paddingBottom: 9 },
  wasteValue: { color: Brand.red, fontSize: 14, fontFamily: Fonts.extraBold, ...TabularNumbers },
  countRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, borderBottomWidth: 1, borderBottomColor: Brand.line, paddingBottom: 8 },
  countField: { width: 110 },
  pressed: { opacity: 0.72 },
});
