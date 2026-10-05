import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { HaccpDateInput } from '@/components/haccp-date-input';
import { HaccpTemperatureInput } from '@/components/haccp-temperature-input';
import { ChipGroup, ChoiceRow, Select } from '@/components/inputs';
import { ToolHeader } from '@/components/tool-header';
import { AppButton, Body, Card, Field, ListSkeleton, Screen, SectionHeader, StatusPill } from '@/components/ui';
import { CONTACT_EMAIL } from '@/constants/paradim';
import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { usePreferences } from '@/contexts/preferences-context';
import { localIsoDate } from '@/lib/local-date-time';
import { loadOperationsControlData } from '@/lib/operations-control-repository';
import {
  FOOD_ORIGIN_LABELS,
  MODEL_WASTE_MEASURES,
  MODEL_WASTE_OBJECTIVES,
  quantityInKg,
  WASTE_DOSSIER_CHECKLIST,
} from '@/lib/waste-compliance-model';
import { exportRedistributionPdf, exportWasteDossierPdf, exportWastePlanPdf } from '@/lib/waste-compliance-export';
import { loadWasteCompliance, saveRedistribution, saveWastePlan, saveWasteReceiver } from '@/lib/waste-compliance-repository';
import type { WasteEntry } from '@/types/operations-control';
import type { QuantityUnit } from '@/types/recipe';
import type {
  FoodProductOrigin,
  FoodRedistribution,
  FoodSafetyCheck,
  WasteComplianceData,
  WasteMeasure,
  WastePlanStatus,
  WasteReceiver,
} from '@/types/waste-compliance';

type Mode = 'plan' | 'redistribution' | 'receivers' | 'documents';
const emptyData: WasteComplianceData = { plans: [], receivers: [], transfers: [] };
const numberValue = (value: string) => Math.max(0, Number(value.replace(',', '.').replace(/[^0-9.]/g, '')) || 0);
const optionalNumber = (value: string) => value.trim() ? Number(value.replace(',', '.').replace(/[^0-9.-]/g, '')) : null;
const currentYear = new Date().getFullYear();
const MEASURES = [
  { value: 'staff_training', label: 'Instruirea angajaților' }, { value: 'production_planning', label: 'Planificarea producției' },
  { value: 'fifo', label: 'FIFO/FEFO' }, { value: 'discount_sale', label: 'Vânzare cu preț redus' },
  { value: 'consumer_redistribution', label: 'Redistribuire consumatori' }, { value: 'receiver_donation', label: 'Donații către receptori' },
  { value: 'animal_feed', label: 'Hrană pentru animale' }, { value: 'compost_biogas', label: 'Compost/Biogaz' },
] as const;
const PRODUCT_ORIGINS = (Object.entries(FOOD_ORIGIN_LABELS) as [FoodProductOrigin, string][])
  .map(([value, label]) => ({ value, label }));

export default function WasteComplianceScreen() {
  const auth = useAuth();
  const { format } = usePreferences();
  const userId = auth.user?.id ?? 'demo';
  const [mode, setMode] = useState<Mode>('plan');
  const [data, setData] = useState<WasteComplianceData>(emptyData);
  const [wasteEntries, setWasteEntries] = useState<WasteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const currentPlan = useMemo(() => data.plans.find((plan) => plan.reportingYear === currentYear) ?? null, [data.plans]);

  const [companyName, setCompanyName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');
  const [companyAuthorization, setCompanyAuthorization] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState(CONTACT_EMAIL);
  const [representative, setRepresentative] = useState('');
  const [responsible, setResponsible] = useState('');
  const [measures, setMeasures] = useState<WasteMeasure[]>([...MODEL_WASTE_MEASURES]);
  const [objectives, setObjectives] = useState(MODEL_WASTE_OBJECTIVES);
  const [planStatus, setPlanStatus] = useState<WastePlanStatus>('draft');

  const [destination, setDestination] = useState<'consumer' | 'receiver'>('consumer');
  const [transferDate, setTransferDate] = useState(localIsoDate());
  const [product, setProduct] = useState('');
  const [category, setCategory] = useState('');
  const [productOrigin, setProductOrigin] = useState<FoodProductOrigin>('prepared_food');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<QuantityUnit>('kg');
  const [quantityKg, setQuantityKg] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [expiry, setExpiry] = useState('');
  const [temperature, setTemperature] = useState('');
  const [consumerCount, setConsumerCount] = useState('');
  const [receiverId, setReceiverId] = useState<string | null>(null);
  const [documentRef, setDocumentRef] = useState('');
  const [traceabilityRef, setTraceabilityRef] = useState('');
  const [safetyCheck, setSafetyCheck] = useState<FoodSafetyCheck>('compliant');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [handedOverBy, setHandedOverBy] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [notes, setNotes] = useState('');

  const [receiverName, setReceiverName] = useState('');
  const [receiverTaxId, setReceiverTaxId] = useState('');
  const [county, setCounty] = useState('');
  const [authorization, setAuthorization] = useState('');
  const [contact, setContact] = useState('');
  const [contractRef, setContractRef] = useState('');
  const [contractDate, setContractDate] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([loadWasteCompliance(userId), loadOperationsControlData(userId)])
      .then(([compliance, operations]) => {
        if (!active) return;
        setData(compliance);
        setWasteEntries(operations.waste);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!currentPlan) return;
    setCompanyName(currentPlan.companyName);
    setTaxId(currentPlan.companyTaxId);
    setAddress(currentPlan.companyAddress);
    setCompanyAuthorization(currentPlan.companyAuthorization);
    setCompanyPhone(currentPlan.companyPhone);
    setCompanyEmail(currentPlan.companyEmail || CONTACT_EMAIL);
    setRepresentative(currentPlan.legalRepresentative);
    setResponsible(currentPlan.responsiblePerson);
    setMeasures(currentPlan.measures);
    setObjectives(currentPlan.objectives);
    setPlanStatus(currentPlan.status);
  }, [currentPlan]);

  const yearTransfers = useMemo(() => data.transfers.filter((transfer) => transfer.transferDate.startsWith(String(currentYear))), [data.transfers]);
  const yearWaste = useMemo(() => wasteEntries.filter((entry) => entry.eventDate.startsWith(String(currentYear))), [wasteEntries]);
  const donatedValue = yearTransfers.reduce((sum, item) => sum + item.estimatedValue, 0);
  const wasteValue = yearWaste.reduce((sum, item) => sum + item.value, 0);

  const applyModel = () => {
    const apply = () => {
      setMeasures([...MODEL_WASTE_MEASURES]);
      setObjectives(MODEL_WASTE_OBJECTIVES);
    };
    if (!objectives.trim() || objectives === MODEL_WASTE_OBJECTIVES) return apply();
    Alert.alert('Înlocuiești conținutul?', 'Modelul va înlocui obiectivele scrise în acest formular.', [
      { text: 'Renunță', style: 'cancel' },
      { text: 'Aplică modelul', onPress: apply },
    ]);
  };

  const savePlan = async () => {
    if (!companyName.trim() || !taxId.trim() || measures.length < 2) {
      Alert.alert('Plan incomplet', 'Completează firma, CUI-ul și selectează minimum două măsuri.');
      return;
    }
    setBusy(true);
    try {
      const item = await saveWastePlan(userId, {
        id: currentPlan?.id,
        locationId: null,
        reportingYear: currentYear,
        companyName: companyName.trim(),
        companyTaxId: taxId.trim(),
        companyAddress: address.trim(),
        companyAuthorization: companyAuthorization.trim(),
        companyPhone: companyPhone.trim(),
        companyEmail: companyEmail.trim() || CONTACT_EMAIL,
        legalRepresentative: representative.trim(),
        responsiblePerson: responsible.trim(),
        measures,
        objectives: objectives.trim(),
        status: planStatus,
        submittedAt: planStatus === 'submitted' ? new Date().toISOString() : null,
      });
      setData((existing) => ({ ...existing, plans: [item, ...existing.plans.filter((plan) => plan.id !== item.id)] }));
      Alert.alert('Plan salvat', item.syncState === 'synced' ? 'Planul este sincronizat.' : 'Planul este salvat pe telefon.');
    } catch (error) {
      Alert.alert('Nu s-a salvat', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally { setBusy(false); }
  };

  const saveTransfer = async () => {
    const amount = numberValue(quantity);
    const reportedKg = quantityInKg(amount, unit, numberValue(quantityKg));
    if (!product.trim() || amount <= 0 || reportedKg <= 0 || (destination === 'receiver' && !receiverId)) {
      Alert.alert('Date incomplete', 'Completează produsul, cantitatea, echivalentul în kg și destinația.');
      return;
    }
    if (safetyCheck !== 'compliant') {
      Alert.alert('Transfer blocat', 'Un produs neconform nu poate fi redistribuit. Înregistrează-l în Registrul de risipă din Control operațional.');
      return;
    }
    setBusy(true);
    try {
      const item = await saveRedistribution(userId, {
        locationId: null,
        transferDate,
        destinationType: destination,
        receiverId: destination === 'receiver' ? receiverId : null,
        productName: product.trim(),
        productCategory: category.trim(),
        productOrigin,
        quantity: amount,
        unit,
        quantityKg: reportedKg,
        estimatedValue: numberValue(estimatedValue),
        temperatureC: optionalNumber(temperature),
        expiryDate: expiry || null,
        consumerCount: destination === 'consumer' ? Math.round(numberValue(consumerCount)) : null,
        documentReference: documentRef.trim(),
        traceabilityReference: traceabilityRef.trim(),
        safetyCheck,
        correctiveAction: correctiveAction.trim(),
        handedOverBy: handedOverBy.trim(),
        receivedBy: receivedBy.trim(),
        notes: notes.trim(),
      });
      setData((existing) => ({ ...existing, transfers: [item, ...existing.transfers.filter((transfer) => transfer.id !== item.id)] }));
      setProduct(''); setCategory(''); setQuantity(''); setQuantityKg(''); setEstimatedValue(''); setExpiry(''); setTemperature('');
      setConsumerCount(''); setDocumentRef(''); setTraceabilityRef(''); setCorrectiveAction(''); setHandedOverBy(''); setReceivedBy(''); setNotes('');
      Alert.alert('Înregistrare salvată', 'Transferul a fost adăugat în registru și în raportul anual.');
    } catch (error) {
      Alert.alert('Nu s-a salvat', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally { setBusy(false); }
  };

  const saveReceiver = async () => {
    if (!receiverName.trim()) {
      Alert.alert('Denumire lipsă', 'Completează denumirea operatorului receptor.');
      return;
    }
    setBusy(true);
    try {
      const item = await saveWasteReceiver(userId, {
        name: receiverName.trim(), taxId: receiverTaxId.trim(), county: county.trim(), authorization: authorization.trim(),
        contact: contact.trim(), contractReference: contractRef.trim(), contractDate: contractDate || null, notes: '', active: true,
      });
      setData((existing) => ({ ...existing, receivers: [item, ...existing.receivers.filter((receiver) => receiver.id !== item.id)] }));
      setReceiverName(''); setReceiverTaxId(''); setCounty(''); setAuthorization(''); setContact(''); setContractRef(''); setContractDate('');
      Alert.alert('Receptor salvat', 'Operatorul este disponibil în registrul de redistribuire.');
    } catch (error) {
      Alert.alert('Nu s-a salvat', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally { setBusy(false); }
  };

  if (loading) return <Screen><ListSkeleton rows={4} /></Screen>;

  return <Screen>
    <ToolHeader title="Risipă și Redistribuire" subtitle="Plan anual, registru de pierderi, trasabilitate și raport pentru operatorul donator." />
    <Card tone="navy"><SectionHeader eyebrow="ANUL CURENT" title={`${currentYear}`} light /><View style={styles.kpis}><Kpi label="Redistribuiri" value={String(yearTransfers.length)} /><Kpi label="Valoare donată" value={format.money(donatedValue)} /><Kpi label="Valoare risipă" value={format.money(wasteValue)} /></View></Card>
    <View style={styles.tabs}>{(['plan', 'redistribution', 'receivers', 'documents'] as Mode[]).map((item) => <Pressable key={item} onPress={() => setMode(item)} style={[styles.tab, mode === item && styles.tabActive]}><Text style={[styles.tabText, mode === item && styles.tabTextActive]}>{item === 'plan' ? 'Plan' : item === 'redistribution' ? 'Registru' : item === 'receivers' ? 'Receptori' : 'Dosar PDF'}</Text></Pressable>)}</View>

    {mode === 'plan' && <>
      <Card><SectionHeader eyebrow="PLAN ANUAL" title="Datele operatorului" /><Field label="Denumire firmă" value={companyName} onChangeText={setCompanyName} /><Field label="CUI" value={taxId} onChangeText={setTaxId} /><Field label="Sediu / punct de lucru" value={address} onChangeText={setAddress} /><Field label="Autorizație / înregistrare" value={companyAuthorization} onChangeText={setCompanyAuthorization} /><View style={styles.row}><Field style={styles.flex} label="Telefon" keyboardType="phone-pad" value={companyPhone} onChangeText={setCompanyPhone} /><Field style={styles.flex} label="Email" keyboardType="email-address" autoCapitalize="none" value={companyEmail} onChangeText={setCompanyEmail} /></View><Field label="Reprezentant legal" value={representative} onChangeText={setRepresentative} /><Field label="Responsabil risipă" value={responsible} onChangeText={setResponsible} /></Card>
      <Card><SectionHeader eyebrow="MODEL COMPLETABIL" title="Măsuri și obiective" /><Body>Modelul precompletează un plan practic. Adaptează țintele, responsabilii și dovezile la unitatea ta înainte de aprobare.</Body><AppButton label="Completează cu modelul recomandat" icon="sparkles-outline" variant="secondary" fullWidth onPress={applyModel} /><ChipGroup options={MEASURES} selected={measures} onToggle={(measure) => setMeasures((existing) => existing.includes(measure) ? existing.filter((value) => value !== measure) : [...existing, measure])} /><Field label="Obiective, termene, responsabili și dovezi" multiline numberOfLines={16} value={objectives} onChangeText={setObjectives} /><ChoiceRow label="Status" value={planStatus} options={[{ value: 'draft', label: 'Schiță' }, { value: 'final', label: 'Final' }, { value: 'submitted', label: 'Depus' }]} onChange={setPlanStatus} /><AppButton label="Salvează planul" icon="save-outline" fullWidth loading={busy} onPress={() => void savePlan()} /></Card>
    </>}

    {mode === 'redistribution' && <>
      <Card><SectionHeader eyebrow="ÎNREGISTRARE NOUĂ" title="Redistribuire / donație" /><ChoiceRow label="Destinație" value={destination} options={[{ value: 'consumer', label: 'Consumatori finali' }, { value: 'receiver', label: 'Operator receptor' }]} onChange={setDestination} /><HaccpDateInput label="Data transferului" locale="ro" value={transferDate} onChange={setTransferDate} />{destination === 'receiver' && <Select label="Operator receptor" placeholder="Alege receptorul" value={receiverId} options={data.receivers.filter((receiver) => receiver.active).map((receiver) => ({ value: receiver.id, label: receiver.name, description: `${receiver.taxId || 'fără CUI'} · ${receiver.county || 'fără județ'}` }))} onChange={setReceiverId} />}<Field label="Produs / preparat" value={product} onChangeText={setProduct} /><Field label="Categorie comercială" value={category} onChangeText={setCategory} /><Select label="Categorie pentru raportul anual" placeholder="Alege categoria" value={productOrigin} options={PRODUCT_ORIGINS} onChange={(value) => value && setProductOrigin(value)} /><View style={styles.row}><Field style={styles.flex} label="Cantitate" keyboardType="decimal-pad" value={quantity} onChangeText={setQuantity} /><View style={styles.flex}><Select label="Unitate" placeholder="Unitate" value={unit} options={['g', 'kg', 'ml', 'l', 'buc'].map((value) => ({ value: value as QuantityUnit, label: value }))} onChange={(value) => value && setUnit(value)} /></View></View><Field label="Echivalent pentru raport (kg)" hint={unit === 'kg' || unit === 'g' ? 'Se calculează automat din cantitate; poți corecta valoarea.' : 'Obligatoriu pentru litri, mililitri sau bucăți.'} keyboardType="decimal-pad" value={quantityKg} onChangeText={setQuantityKg} /><Field label="Valoare estimată (lei)" keyboardType="decimal-pad" value={estimatedValue} onChangeText={setEstimatedValue} /><HaccpDateInput label="Data-limită / durabilitate" locale="ro" value={expiry || transferDate} onChange={setExpiry} /><HaccpTemperatureInput label="Temperatura la predare" value={temperature} onChange={setTemperature} minimum={-30} maximum={100} /><Field label="Lot / trasabilitate" value={traceabilityRef} onChangeText={setTraceabilityRef} />{destination === 'consumer' && <Field label="Număr estimat consumatori" keyboardType="number-pad" value={consumerCount} onChangeText={setConsumerCount} />}<Field label="Proces-verbal / aviz / document" value={documentRef} onChangeText={setDocumentRef} /><ChoiceRow label="Verificarea siguranței" value={safetyCheck} options={[{ value: 'compliant', label: 'Conform pentru transfer' }, { value: 'blocked', label: 'Blocat / neconform' }]} onChange={setSafetyCheck} />{safetyCheck === 'blocked' && <><Field label="Acțiune corectivă" multiline numberOfLines={3} value={correctiveAction} onChangeText={setCorrectiveAction} /><View style={styles.alertBox}><Ionicons name="warning-outline" size={20} color={Brand.red} /><Body>Înregistrarea nu poate fi salvată ca redistribuire. Produsul trebuie trecut în Registrul de risipă.</Body></View></>}<View style={styles.row}><Field style={styles.flex} label="Predat de" value={handedOverBy} onChangeText={setHandedOverBy} /><Field style={styles.flex} label="Primit de" value={receivedBy} onChangeText={setReceivedBy} /></View><Field label="Observații" multiline numberOfLines={3} value={notes} onChangeText={setNotes} /><AppButton label="Adaugă în registru" icon="add-circle-outline" fullWidth loading={busy} disabled={safetyCheck === 'blocked'} onPress={() => void saveTransfer()} /></Card>
      <Card><SectionHeader title="Înregistrări recente" />{yearTransfers.slice(0, 30).map((item) => <TransferRow key={item.id} item={item} receivers={data.receivers} money={format.money(item.estimatedValue)} />)}{!yearTransfers.length && <Body>Nu există încă redistribuiri sau donații înregistrate.</Body>}</Card>
    </>}

    {mode === 'receivers' && <>
      <Card><SectionHeader eyebrow="NOMENCLATOR PROPRIU" title="Adaugă operator receptor" /><Field label="Denumire" value={receiverName} onChangeText={setReceiverName} /><Field label="CUI" value={receiverTaxId} onChangeText={setReceiverTaxId} /><Field label="Județ" value={county} onChangeText={setCounty} /><Field label="Autorizație / înregistrare ANSVSA" value={authorization} onChangeText={setAuthorization} /><Field label="Contact" value={contact} onChangeText={setContact} /><Field label="Contract / dovada demersului" value={contractRef} onChangeText={setContractRef} /><HaccpDateInput label="Data contractului" locale="ro" value={contractDate || localIsoDate()} onChange={setContractDate} /><AppButton label="Salvează receptorul" icon="business-outline" fullWidth loading={busy} onPress={() => void saveReceiver()} /></Card>
      <Card><SectionHeader title="Operatori salvați" />{data.receivers.map((receiver) => <View key={receiver.id} style={styles.listRow}><View style={styles.flex}><Text style={styles.name}>{receiver.name}</Text><Text style={styles.meta}>{receiver.taxId || 'CUI nespecificat'} · {receiver.county || 'județ nespecificat'} · {receiver.authorization || 'autorizație nespecificată'}</Text></View><StatusPill label={receiver.active ? 'Activ' : 'Inactiv'} status={receiver.active ? 'healthy' : 'neutral'} /></View>)}{!data.receivers.length && <Body>Adaugă operatorii cu care ai contract sau pentru care ai documentat demersuri.</Body>}</Card>
    </>}

    {mode === 'documents' && <>
      <Card><SectionHeader eyebrow="DOSAR COMPLET" title="Documente pentru verificare" /><Body>Dosarul combină planul anual, registrul intern de risipă, registrul de redistribuire, raportul anual tip Anexa nr. 2 și nomenclatorul receptorilor.</Body><AppButton label="Dosar complet PDF" icon="documents-outline" fullWidth onPress={() => void exportWasteDossierPdf(currentYear, currentPlan, data.transfers, data.receivers, wasteEntries)} /><AppButton label="Plan anual PDF" icon="document-text-outline" variant="secondary" fullWidth disabled={!currentPlan} onPress={() => currentPlan && void exportWastePlanPdf(currentPlan)} /><AppButton label="Raport anual · Anexa 2 PDF" icon="download-outline" variant="secondary" fullWidth onPress={() => void exportRedistributionPdf(currentYear, data.transfers, data.receivers, currentPlan)} /></Card>
      <Card><SectionHeader eyebrow="CHECKLIST" title="Înainte de semnare și raportare" />{WASTE_DOSSIER_CHECKLIST.map((item) => <View key={item} style={styles.checkRow}><Ionicons name="checkbox-outline" size={19} color={Brand.tealDeep} /><Text style={styles.checkText}>{item}</Text></View>)}</Card>
      <Card tone="soft"><View style={styles.notice}><Ionicons name="information-circle-outline" size={22} color={Brand.amber} /><Body>Modelul nu inventează transferuri sau pierderi. Înregistrează numai cantități și documente reale, verifică forma legală în vigoare și semnează documentele înainte de depunere.</Body></View></Card>
    </>}
  </Screen>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <View style={styles.kpi}><Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text><Text style={styles.kpiLabel}>{label}</Text></View>;
}

function TransferRow({ item, receivers, money }: { item: FoodRedistribution; receivers: WasteReceiver[]; money: string }) {
  const target = item.destinationType === 'consumer' ? 'Consumatori' : receivers.find((receiver) => receiver.id === item.receiverId)?.name ?? 'Receptor';
  return <View style={styles.listRow}><View style={styles.flex}><Text style={styles.name}>{item.productName}</Text><Text style={styles.meta}>{item.transferDate} · {target} · {item.quantity} {item.unit} / {item.quantityKg.toFixed(3)} kg</Text></View><Text style={styles.money}>{money}</Text></View>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tab: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: Radius.pill, backgroundColor: Brand.white },
  tabActive: { backgroundColor: Brand.navy },
  tabText: { color: Brand.navy, fontFamily: Fonts.bold, fontSize: 11 },
  tabTextActive: { color: Brand.white },
  kpis: { flexDirection: 'row', gap: 8 },
  kpi: { flex: 1, backgroundColor: Brand.navySoft, borderRadius: 14, padding: 10 },
  kpiValue: { color: Brand.white, fontFamily: Fonts.extraBold, fontSize: 16, ...TabularNumbers },
  kpiLabel: { color: '#D9E2E8', fontFamily: Fonts.bold, fontSize: 8, textTransform: 'uppercase', marginTop: 3 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  flex: { flex: 1, minWidth: 140 },
  listRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: Brand.line, paddingBottom: 10 },
  name: { color: Brand.navyDeep, fontFamily: Fonts.bold, fontSize: 13 },
  meta: { color: Brand.muted, fontFamily: Fonts.regular, fontSize: 10, lineHeight: 15, marginTop: 2 },
  money: { color: Brand.tealDeep, fontFamily: Fonts.extraBold, fontSize: 13, ...TabularNumbers },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  alertBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Brand.redSoft, borderRadius: Radius.medium, padding: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderBottomWidth: 1, borderBottomColor: Brand.line, paddingVertical: 8 },
  checkText: { flex: 1, color: Brand.ink, fontFamily: Fonts.regular, fontSize: 12, lineHeight: 18 },
});
