import { useI18n } from '@/contexts/locale-context';
import { operationalErrorMessage } from '@/lib/operational-sync';
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
  getFoodOriginLabels,
  MODEL_WASTE_MEASURES,
  getWasteModelObjectives,
  wasteObjectivesForDraft,
  quantityInKg,
  getWasteDossierChecklist,
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

export default function WasteComplianceScreen() {
  const auth = useAuth();
  const { locale, t } = useI18n();
  const MEASURES = [
    { value: 'staff_training', label: t('waste.training') }, { value: 'production_planning', label: t('waste.planning') },
    { value: 'fifo', label: 'FIFO/FEFO' }, { value: 'discount_sale', label: t('waste.discount') },
    { value: 'consumer_redistribution', label: t('waste.consumersMeasure') }, { value: 'receiver_donation', label: t('waste.receiversMeasure') },
    { value: 'animal_feed', label: t('waste.feed') }, { value: 'compost_biogas', label: t('waste.compost') },
  ] as const;
  const PRODUCT_ORIGINS = (Object.entries(getFoodOriginLabels(locale)) as [FoodProductOrigin, string][])
    .map(([value, label]) => ({ value, label }));

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
  const [objectives, setObjectives] = useState<string | null>(null);
  const shownObjectives = wasteObjectivesForDraft(objectives, locale);
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
      setObjectives(null);
    };
    if (!shownObjectives.trim() || objectives === null || objectives === getWasteModelObjectives(locale)) return apply();
    Alert.alert(t('waste.replaceTitle'), t('waste.replaceBody'), [
      { text: t('operational.common.cancel'), style: 'cancel' },
      { text: t('waste.apply'), onPress: apply },
    ]);
  };

  const savePlan = async () => {
    if (!companyName.trim() || !taxId.trim() || measures.length < 2) {
      Alert.alert(t('waste.incompletePlan'), t('waste.planRequired'));
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
        objectives: shownObjectives.trim(),
        status: planStatus,
        submittedAt: planStatus === 'submitted' ? new Date().toISOString() : null,
      });
      setData((existing) => ({ ...existing, plans: [item, ...existing.plans.filter((plan) => plan.id !== item.id)] }));
      Alert.alert(t('waste.planSaved'), item.syncState === 'synced' ? t('waste.planSynced') : t('waste.planLocal'));
    } catch (error) {
      Alert.alert(t('operational.common.notSaved'), operationalErrorMessage(error, locale));
    } finally { setBusy(false); }
  };

  const saveTransfer = async () => {
    const amount = numberValue(quantity);
    const reportedKg = quantityInKg(amount, unit, numberValue(quantityKg));
    if (!product.trim() || amount <= 0 || reportedKg <= 0 || (destination === 'receiver' && !receiverId)) {
      Alert.alert(t('waste.incomplete'), t('waste.transferRequired'));
      return;
    }
    if (safetyCheck !== 'compliant') {
      Alert.alert(t('waste.blockedTitle'), t('waste.blockedBody'));
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
      Alert.alert(t('waste.saved'), t('waste.transferSaved'));
    } catch (error) {
      Alert.alert(t('operational.common.notSaved'), operationalErrorMessage(error, locale));
    } finally { setBusy(false); }
  };

  const saveReceiver = async () => {
    if (!receiverName.trim()) {
      Alert.alert(t('waste.missingName'), t('waste.receiverRequired'));
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
      Alert.alert(t('waste.receiverSaved'), t('waste.receiverAvailable'));
    } catch (error) {
      Alert.alert(t('operational.common.notSaved'), operationalErrorMessage(error, locale));
    } finally { setBusy(false); }
  };

  const exportDocument = async (exportPdf: () => Promise<unknown>) => {
    try { await exportPdf(); }
    catch (error) { Alert.alert(t('operational.account.exportError'), operationalErrorMessage(error, locale)); }
  };

  if (loading) return <Screen><ListSkeleton rows={4} /></Screen>;

  return <Screen>
    <ToolHeader title={t('waste.title')} subtitle={t('waste.subtitle')} />
    <Card tone="navy"><SectionHeader eyebrow={t('waste.year')} title={`${currentYear}`} light /><View style={styles.kpis}><Kpi label={t('waste.redistributions')} value={String(yearTransfers.length)} /><Kpi label={t('waste.donatedValue')} value={format.money(donatedValue)} /><Kpi label={t('waste.wasteValue')} value={format.money(wasteValue)} /></View></Card>
    <View style={styles.tabs}>{(['plan', 'redistribution', 'receivers', 'documents'] as Mode[]).map((item) => <Pressable key={item} onPress={() => setMode(item)} style={[styles.tab, mode === item && styles.tabActive]}><Text style={[styles.tabText, mode === item && styles.tabTextActive]}>{item === 'plan' ? 'Plan' : item === 'redistribution' ? t('waste.register') : item === 'receivers' ? t('waste.receivers') : t('waste.pdfDossier')}</Text></Pressable>)}</View>

    {mode === 'plan' && <>
      <Card><SectionHeader eyebrow={t('waste.annualPlan')} title={t('waste.operatorDetails')} /><Field label={t('waste.company')} value={companyName} onChangeText={setCompanyName} /><Field label={t('waste.taxId')} value={taxId} onChangeText={setTaxId} /><Field label={t('waste.address')} value={address} onChangeText={setAddress} /><Field label={t('waste.authorization')} value={companyAuthorization} onChangeText={setCompanyAuthorization} /><View style={styles.row}><Field style={styles.flex} label={t('waste.phone')} keyboardType="phone-pad" value={companyPhone} onChangeText={setCompanyPhone} /><Field style={styles.flex} label="Email" keyboardType="email-address" autoCapitalize="none" value={companyEmail} onChangeText={setCompanyEmail} /></View><Field label={t('waste.representative')} value={representative} onChangeText={setRepresentative} /><Field label={t('waste.responsible')} value={responsible} onChangeText={setResponsible} /></Card>
      <Card><SectionHeader eyebrow={t('waste.editableTemplate')} title={t('waste.measuresObjectives')} /><Body>{t('waste.templateNote')}</Body><AppButton label={t('waste.fillTemplate')} icon="sparkles-outline" variant="secondary" fullWidth onPress={applyModel} /><ChipGroup options={MEASURES} selected={measures} onToggle={(measure) => setMeasures((existing) => existing.includes(measure) ? existing.filter((value) => value !== measure) : [...existing, measure])} /><Field label={t('waste.objectivesField')} multiline numberOfLines={16} value={shownObjectives} onChangeText={setObjectives} /><ChoiceRow label="Status" value={planStatus} options={[{ value: 'draft', label: t('waste.draft') }, { value: 'final', label: 'Final' }, { value: 'submitted', label: t('waste.submitted') }]} onChange={setPlanStatus} /><AppButton label={t('waste.savePlan')} icon="save-outline" fullWidth loading={busy} onPress={() => void savePlan()} /></Card>
    </>}

    {mode === 'redistribution' && <>
      <Card><SectionHeader eyebrow={t('waste.newRecord')} title={t('waste.redistribution')} /><ChoiceRow label={t('waste.destination')} value={destination} options={[{ value: 'consumer', label: t('waste.finalConsumers') }, { value: 'receiver', label: t('waste.operatorReceiver') }]} onChange={setDestination} /><HaccpDateInput label={t('waste.transferDate')} locale={locale} value={transferDate} onChange={setTransferDate} />{destination === 'receiver' && <Select label={t('waste.operatorReceiver')} placeholder={t('waste.chooseReceiver')} value={receiverId} options={data.receivers.filter((receiver) => receiver.active).map((receiver) => ({ value: receiver.id, label: receiver.name, description: `${receiver.taxId || t('waste.noTaxId')} · ${receiver.county || t('waste.noCounty')}` }))} onChange={setReceiverId} />}<Field label={t('waste.productDish')} value={product} onChangeText={setProduct} /><Field label={t('waste.commercialCategory')} value={category} onChangeText={setCategory} /><Select label={t('waste.annualCategory')} placeholder={t('operational.documents.chooseCategory')} value={productOrigin} options={PRODUCT_ORIGINS} onChange={(value) => value && setProductOrigin(value)} /><View style={styles.row}><Field style={styles.flex} label={t('waste.quantity')} keyboardType="decimal-pad" value={quantity} onChangeText={setQuantity} /><View style={styles.flex}><Select label={t('waste.unit')} placeholder={t('waste.unit')} value={unit} options={['g', 'kg', 'ml', 'l', 'buc'].map((value) => ({ value: value as QuantityUnit, label: value === 'buc' && locale === 'en' ? 'pcs' : value }))} onChange={(value) => value && setUnit(value)} /></View></View><Field label={t('waste.kgEquivalent')} hint={unit === 'kg' || unit === 'g' ? t('waste.kgAutomatic') : t('waste.kgRequired')} keyboardType="decimal-pad" value={quantityKg} onChangeText={setQuantityKg} /><Field label={t('waste.estimatedValue')} keyboardType="decimal-pad" value={estimatedValue} onChangeText={setEstimatedValue} /><HaccpDateInput label={t('waste.expiry')} locale={locale} value={expiry || transferDate} onChange={setExpiry} /><HaccpTemperatureInput label={t('waste.handoverTemp')} value={temperature} onChange={setTemperature} minimum={-30} maximum={100} /><Field label={t('waste.traceability')} value={traceabilityRef} onChangeText={setTraceabilityRef} />{destination === 'consumer' && <Field label={t('waste.consumerCount')} keyboardType="number-pad" value={consumerCount} onChangeText={setConsumerCount} />}<Field label={t('waste.document')} value={documentRef} onChangeText={setDocumentRef} /><ChoiceRow label={t('waste.safety')} value={safetyCheck} options={[{ value: 'compliant', label: t('waste.compliantTransfer') }, { value: 'blocked', label: t('waste.blocked') }]} onChange={setSafetyCheck} />{safetyCheck === 'blocked' && <><Field label={t('waste.corrective')} multiline numberOfLines={3} value={correctiveAction} onChangeText={setCorrectiveAction} /><View style={styles.alertBox}><Ionicons name="warning-outline" size={20} color={Brand.red} /><Body>{t('waste.blockedNotice')}</Body></View></>}<View style={styles.row}><Field style={styles.flex} label={t('waste.handedBy')} value={handedOverBy} onChangeText={setHandedOverBy} /><Field style={styles.flex} label={t('waste.receivedBy')} value={receivedBy} onChangeText={setReceivedBy} /></View><Field label={t('operational.common.notes')} multiline numberOfLines={3} value={notes} onChangeText={setNotes} /><AppButton label={t('waste.addRecord')} icon="add-circle-outline" fullWidth loading={busy} disabled={safetyCheck === 'blocked'} onPress={() => void saveTransfer()} /></Card>
      <Card><SectionHeader title={t('waste.recent')} />{yearTransfers.slice(0, 30).map((item) => <TransferRow key={item.id} item={item} receivers={data.receivers} money={format.money(item.estimatedValue)} />)}{!yearTransfers.length && <Body>{t('waste.noTransfers')}</Body>}</Card>
    </>}

    {mode === 'receivers' && <>
      <Card><SectionHeader eyebrow={t('waste.ownDirectory')} title={t('waste.addReceiver')} /><Field label={t('waste.name')} value={receiverName} onChangeText={setReceiverName} /><Field label={t('waste.taxId')} value={receiverTaxId} onChangeText={setReceiverTaxId} /><Field label={t('waste.county')} value={county} onChangeText={setCounty} /><Field label={t('waste.ansvsa')} value={authorization} onChangeText={setAuthorization} /><Field label="Contact" value={contact} onChangeText={setContact} /><Field label={t('waste.contractEvidence')} value={contractRef} onChangeText={setContractRef} /><HaccpDateInput label={t('waste.contractDate')} locale={locale} value={contractDate || localIsoDate()} onChange={setContractDate} /><AppButton label={t('waste.saveReceiver')} icon="business-outline" fullWidth loading={busy} onPress={() => void saveReceiver()} /></Card>
      <Card><SectionHeader title={t('waste.savedReceivers')} />{data.receivers.map((receiver) => <View key={receiver.id} style={styles.listRow}><View style={styles.flex}><Text style={styles.name}>{receiver.name}</Text><Text style={styles.meta}>{receiver.taxId || t('waste.taxUnspecified')} · {receiver.county || t('waste.countyUnspecified')} · {receiver.authorization || t('waste.authorizationUnspecified')}</Text></View><StatusPill label={receiver.active ? t('operational.lifecycle.active') : t('waste.inactive')} status={receiver.active ? 'healthy' : 'neutral'} /></View>)}{!data.receivers.length && <Body>{t('waste.emptyReceivers')}</Body>}</Card>
    </>}

    {mode === 'documents' && <>
      <Card><SectionHeader eyebrow={t('waste.completeDossier')} title={t('waste.reviewDocs')} /><Body>{t('waste.dossierNote')}</Body><AppButton label={t('waste.exportDossier')} icon="documents-outline" fullWidth onPress={() => void exportDocument(() => exportWasteDossierPdf(currentYear, currentPlan, data.transfers, data.receivers, wasteEntries, locale))} /><AppButton label={t('waste.exportPlan')} icon="document-text-outline" variant="secondary" fullWidth disabled={!currentPlan} onPress={() => currentPlan && void exportDocument(() => exportWastePlanPdf(currentPlan, locale))} /><AppButton label={t('waste.exportReport')} icon="download-outline" variant="secondary" fullWidth onPress={() => void exportDocument(() => exportRedistributionPdf(currentYear, data.transfers, data.receivers, currentPlan, locale))} /></Card>
      <Card><SectionHeader eyebrow="CHECKLIST" title={t('waste.beforeSigning')} />{getWasteDossierChecklist(locale).map((item) => <View key={item} style={styles.checkRow}><Ionicons name="checkbox-outline" size={19} color={Brand.tealDeep} /><Text style={styles.checkText}>{item}</Text></View>)}</Card>
      <Card tone="soft"><View style={styles.notice}><Ionicons name="information-circle-outline" size={22} color={Brand.amber} /><Body>{t('waste.sourceNote')}</Body></View></Card>
    </>}
  </Screen>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <View style={styles.kpi}><Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text><Text style={styles.kpiLabel}>{label}</Text></View>;
}

function TransferRow({ item, receivers, money }: { item: FoodRedistribution; receivers: WasteReceiver[]; money: string }) {
  const { locale, t } = useI18n();
  const target = item.destinationType === 'consumer' ? t('waste.consumers') : receivers.find((receiver) => receiver.id === item.receiverId)?.name ?? t('waste.receiver');
  return <View style={styles.listRow}><View style={styles.flex}><Text style={styles.name}>{item.productName}</Text><Text style={styles.meta}>{item.transferDate} · {target} · {item.quantity} {item.unit === 'buc' && locale === 'en' ? 'pcs' : item.unit} / {item.quantityKg.toFixed(3)} kg</Text></View><Text style={styles.money}>{money}</Text></View>;
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
