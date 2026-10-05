import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { HaccpDateInput } from '@/components/haccp-date-input';
import { HaccpTimeInput } from '@/components/haccp-time-input';
import { ChoiceRow, Select } from '@/components/inputs';
import { ToolHeader } from '@/components/tool-header';
import { AppButton, Body, Card, Field, ListSkeleton, Screen, SectionHeader, StatusPill } from '@/components/ui';
import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useFocusedSyncRetry } from '@/hooks/use-focused-sync-retry';
import { exportHrExcel, exportHrPdf } from '@/lib/hr-export';
import {
  buildHrMonthlyRows,
  changeHrPeriod,
  HR_STATUS_CODES,
  HR_STATUS_LABELS,
  hrDateForDay,
  hrDayCellValue,
  hrDayIsWeekend,
  hrPeriodLabel,
  hrPeriodParts,
  hrShiftWorkedHours,
  hrWeekdayLabel,
} from '@/lib/hr-report';
import { totalMonthlyGrossSalary } from '@/lib/hr';
import { loadHrData, removeHrEmployee, removeHrShift, saveHrEmployee, saveHrShift } from '@/lib/hr-repository';
import { listLocations, type BusinessLocation } from '@/lib/locations-repository';
import { localIsoDate } from '@/lib/local-date-time';
import type { HrAttendanceStatus, HrData, HrShift } from '@/types/hr';

type Mode = 'employees' | 'schedule' | 'reports';
const emptyData: HrData = { employees: [], shifts: [] };
const statusOptions = [
  { value: 'scheduled', label: 'Programat' },
  { value: 'present', label: 'Prezent' },
  { value: 'absent', label: 'Absent' },
  { value: 'leave', label: 'Concediu' },
  { value: 'day_off', label: 'Liber' },
] as const;

function parseMoney(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function displayMoney(value: number | null) {
  return value === null ? null : `${value.toFixed(2)} lei`;
}

function validTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export default function HrScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const auth = useAuth();
  const userId = auth.user?.id ?? 'demo';
  const [mode, setMode] = useState<Mode>('employees');
  useEffect(() => { if (params.mode === 'employees' || params.mode === 'schedule' || params.mode === 'reports') setMode(params.mode); }, [params.mode]);
  const [data, setData] = useState<HrData>(emptyData);
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [locationId, setLocationId] = useState<string | null>(null);
  const [grossSalary, setGrossSalary] = useState('');
  const [netSalary, setNetSalary] = useState('');
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);

  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [sheetMonth, setSheetMonth] = useState(localIsoDate().slice(0, 7));
  const [workDate, setWorkDate] = useState(localIsoDate());
  const [plannedStart, setPlannedStart] = useState('08:00');
  const [plannedEnd, setPlannedEnd] = useState('16:00');
  const [actualStart, setActualStart] = useState('');
  const [actualEnd, setActualEnd] = useState('');
  const [status, setStatus] = useState<HrAttendanceStatus>('scheduled');
  const [notes, setNotes] = useState('');
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);

  const [reportMonth, setReportMonth] = useState(localIsoDate().slice(0, 7));
  const [reportLocation, setReportLocation] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  useFocusedSyncRetry(useCallback(() => loadHrData(userId).then(setData), [userId]));
  useFocusEffect(useCallback(() => {
    let active = true;
    void loadHrData(userId).then((next) => { if (active) setData(next); }).catch(() => undefined);
    return () => { active = false; };
  }, [userId]));

  const refresh = () => Promise.all([loadHrData(userId), listLocations(userId)])
    .then(([next, savedLocations]) => {
      setData(next);
      setLocations(savedLocations);
    });

  useEffect(() => {
    let active = true;
    void Promise.all([loadHrData(userId), listLocations(userId)])
      .then(([next, savedLocations]) => {
        if (!active) return;
        setData(next);
        setLocations(savedLocations);
        setEmployeeId((current) => current ?? next.employees.find((item) => item.active)?.id ?? null);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  const totalGross = useMemo(() => totalMonthlyGrossSalary(data.employees), [data.employees]);
  const totalNet = useMemo(() => data.employees
    .filter((item) => item.active)
    .reduce((sum, item) => sum + (item.netSalary ?? 0), 0), [data.employees]);

  const activeEmployees = useMemo(() => data.employees.filter((item) => item.active), [data.employees]);
  const monthRows = useMemo(() => buildHrMonthlyRows(activeEmployees, data.shifts, sheetMonth), [activeEmployees, data.shifts, sheetMonth]);
  const selectedMonthRow = monthRows.find((row) => row.employee.id === employeeId) ?? null;
  const selectedMonthShifts = useMemo(() => data.shifts
    .filter((item) => item.employeeId === employeeId && item.workDate.startsWith(`${sheetMonth}-`))
    .sort((left, right) => left.workDate.localeCompare(right.workDate)), [data.shifts, employeeId, sheetMonth]);

  const reportEmployees = useMemo(() => data.employees.filter((item) => (
    !reportLocation || item.locationId === reportLocation
  )), [data.employees, reportLocation]);
  const reportIds = useMemo(() => new Set(reportEmployees.map((item) => item.id)), [reportEmployees]);
  const reportShifts = useMemo(() => data.shifts.filter((item) => (
    item.workDate.startsWith(reportMonth) && reportIds.has(item.employeeId)
  )), [data.shifts, reportIds, reportMonth]);
  const reportRows = useMemo(() => buildHrMonthlyRows(reportEmployees, reportShifts, reportMonth), [reportEmployees, reportShifts, reportMonth]);
  const reportHours = useMemo(() => reportRows.reduce((sum, item) => sum + item.totalHours, 0), [reportRows]);
  const selectedReportLocation = locations.find((item) => item.id === reportLocation)?.name ?? 'Toate locațiile';

  const resetEmployeeForm = () => {
    setEditingEmployeeId(null);
    setName('');
    setRole('');
    setLocationId(null);
    setGrossSalary('');
    setNetSalary('');
  };

  const editEmployee = (id: string) => {
    const employee = data.employees.find((item) => item.id === id);
    if (!employee) return;
    setEditingEmployeeId(employee.id);
    setName(employee.name);
    setRole(employee.role);
    setLocationId(employee.locationId);
    setGrossSalary(employee.grossSalary === null ? '' : String(employee.grossSalary).replace('.', ','));
    setNetSalary(employee.netSalary === null ? '' : String(employee.netSalary).replace('.', ','));
  };

  const saveEmployee = async () => {
    if (!name.trim()) return Alert.alert('Nume obligatoriu', 'Completează numele angajatului.');
    setBusy(true);
    try {
      const location = locations.find((item) => item.id === locationId);
      const saved = await saveHrEmployee(userId, {
        id: editingEmployeeId ?? undefined,
        name,
        role,
        locationId,
        locationName: location?.name ?? '',
        grossSalary: parseMoney(grossSalary),
        netSalary: parseMoney(netSalary),
        active: data.employees.find((employee) => employee.id === editingEmployeeId)?.active ?? true,
      });
      resetEmployeeForm();
      setEmployeeId(saved.id);
      await refresh();
    } catch (error) {
      Alert.alert('Angajatul nu a fost salvat', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally {
      setBusy(false);
    }
  };

  const clearShiftFields = (nextEmployeeId = employeeId, nextDate = workDate) => {
    setEditingShiftId(null);
    setEmployeeId(nextEmployeeId);
    setWorkDate(nextDate);
    setPlannedStart('08:00');
    setPlannedEnd('16:00');
    setActualStart('');
    setActualEnd('');
    setStatus('scheduled');
    setNotes('');
  };

  const editShift = (shift: HrShift) => {
    setEditingShiftId(shift.id);
    setEmployeeId(shift.employeeId);
    setWorkDate(shift.workDate);
    setPlannedStart(shift.plannedStart);
    setPlannedEnd(shift.plannedEnd);
    setActualStart(shift.actualStart);
    setActualEnd(shift.actualEnd);
    setStatus(shift.status);
    setNotes(shift.notes);
  };

  const openEmployeeSheet = (id: string) => {
    const date = workDate.startsWith(`${sheetMonth}-`) ? workDate : hrDateForDay(sheetMonth, 1);
    clearShiftFields(id, date);
  };

  const openDay = (day: number) => {
    if (!employeeId) return;
    const date = hrDateForDay(sheetMonth, day);
    const existing = data.shifts.find((item) => item.employeeId === employeeId && item.workDate === date);
    if (existing) editShift(existing);
    else clearShiftFields(employeeId, date);
  };

  const saveShift = async () => {
    if (!employeeId) return Alert.alert('Alege angajatul', 'Deschide fișa angajatului înainte de a adăuga o zi.');
    if (!validTime(plannedStart) || !validTime(plannedEnd) || (
      status === 'present' && (!validTime(actualStart || plannedStart) || !validTime(actualEnd || plannedEnd))
    )) return Alert.alert('Oră incorectă', 'Selectează o oră validă.');

    const sameDay = data.shifts.find((item) => (
      item.employeeId === employeeId && item.workDate === workDate && item.id !== editingShiftId
    ));
    if (editingShiftId && sameDay) {
      return Alert.alert('Există deja un pontaj', 'Ziua este deja în fișa angajatului. Deschide și actualizează înregistrarea existentă.');
    }

    setBusy(true);
    try {
      await saveHrShift(userId, {
        id: editingShiftId ?? sameDay?.id,
        employeeId,
        workDate,
        plannedStart,
        plannedEnd,
        actualStart: status === 'present' ? actualStart || plannedStart : '',
        actualEnd: status === 'present' ? actualEnd || plannedEnd : '',
        status,
        notes,
      });
      await refresh();
      setEditingShiftId(null);
      if (sameDay) Alert.alert('Zi actualizată', 'Înregistrarea existentă a fost actualizată în aceeași fișă, fără duplicat.');
    } catch (error) {
      Alert.alert('Pontajul nu a fost salvat', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally {
      setBusy(false);
    }
  };

  const deleteEmployee = (id: string) => {
    Alert.alert('Ștergi angajatul?', 'Se vor șterge și înregistrările sale de pontaj.', [
      { text: 'Renunță', style: 'cancel' },
      {
        text: 'Șterge', style: 'destructive', onPress: () => void removeHrEmployee(userId, id)
          .then((next) => {
            setData(next);
            if (employeeId === id) setEmployeeId(next.employees.find((item) => item.active)?.id ?? null);
          })
          .catch(() => Alert.alert('Ștergere nereușită', 'Verifică conexiunea și încearcă din nou.')),
      },
    ]);
  };

  const deleteShift = (shift: HrShift) => {
    Alert.alert('Ștergi ziua din fișă?', `Înregistrarea din ${shift.workDate} va fi eliminată.`, [
      { text: 'Renunță', style: 'cancel' },
      {
        text: 'Șterge', style: 'destructive', onPress: () => void removeHrShift(userId, shift.id)
          .then((next) => {
            setData(next);
            if (editingShiftId === shift.id) clearShiftFields(shift.employeeId, shift.workDate);
          })
          .catch(() => Alert.alert('Ștergere nereușită', 'Verifică conexiunea și încearcă din nou.')),
      },
    ]);
  };

  const exportReport = async (format: 'excel' | 'pdf') => {
    setExporting(format);
    try {
      if (format === 'excel') await exportHrExcel(reportEmployees, reportShifts, reportMonth, selectedReportLocation);
      else await exportHrPdf(reportEmployees, reportShifts, reportMonth, selectedReportLocation);
    } catch (error) {
      Alert.alert('Export nereușit', error instanceof Error ? error.message : 'Fișierul nu a putut fi generat. Încearcă din nou.');
    } finally {
      setExporting(null);
    }
  };

  if (loading) return <Screen><ListSkeleton rows={4} /></Screen>;

  return <Screen>
    <ToolHeader title="HR · Prezență angajați" subtitle="O fișă lunară pentru fiecare angajat, salarii lunare și exporturi pe locație." />
    <AppButton label="Angajare / plecare angajat" icon="person-add-outline" variant="secondary" onPress={() => router.push('/tools/hr-lifecycle' as never)} />
    {[...data.employees, ...data.shifts].some((item) => item.syncState === 'pending') && (
      <Card tone="gold"><Body>Salvat pe dispozitiv · pontajele sau angajații așteaptă sincronizarea. Reîncercarea este automată când revii în aplicație sau cât timp acest ecran este deschis.</Body></Card>
    )}
    <View style={styles.tabs}>
      {(['employees', 'schedule', 'reports'] as Mode[]).map((item) => (
        <Pressable key={item} onPress={() => setMode(item)} style={[styles.tab, mode === item && styles.tabActive]}>
          <Text style={[styles.tabText, mode === item && styles.tabTextActive]}>
            {item === 'employees' ? 'Angajați' : item === 'schedule' ? 'Fișe pontaj' : 'Rapoarte'}
          </Text>
        </Pressable>
      ))}
    </View>

    {mode === 'employees' && <>
      <Card tone="navy">
        <SectionHeader eyebrow="SALARII LUNARE ACTIVE" title={`${totalGross.toFixed(2)} lei brut`} light />
        <Text style={styles.heroSmall}>{totalNet.toFixed(2)} lei net declarat</Text>
        <Text style={styles.lightNote}>Totalul brut este preluat automat în raportul P&amp;L.</Text>
      </Card>
      <Card>
        <SectionHeader eyebrow={editingEmployeeId ? 'EDITARE FIȘĂ' : 'FIȘĂ NOUĂ'} title={editingEmployeeId ? 'Modifică angajatul' : 'Adaugă angajat'} />
        <Field label="Nume și prenume" value={name} onChangeText={setName} />
        <Field label="Rol / funcție" value={role} onChangeText={setRole} />
        <Select label="Locație" placeholder="Fără locație" value={locationId} allowClear options={locations.map((item) => ({ value: item.id, label: item.name, description: item.address }))} onChange={setLocationId} />
        <View style={styles.row}>
          <View style={styles.flex}><Field label="Salariu brut lunar (lei)" keyboardType="decimal-pad" value={grossSalary} onChangeText={setGrossSalary} /></View>
          <View style={styles.flex}><Field label="Salariu net lunar (lei)" keyboardType="decimal-pad" value={netSalary} onChangeText={setNetSalary} /></View>
        </View>
        <AppButton label={editingEmployeeId ? 'Salvează modificările' : 'Salvează angajatul'} icon={editingEmployeeId ? 'save-outline' : 'person-add-outline'} fullWidth loading={busy} onPress={() => void saveEmployee()} />
        {editingEmployeeId && <AppButton label="Renunță la editare" variant="secondary" fullWidth onPress={resetEmployeeForm} />}
      </Card>
      <Card>
        <SectionHeader eyebrow={`${data.employees.length} ANGAJAȚI`} title="Echipă" />
        {data.employees.map((employee) => (
          <View key={employee.id} style={styles.listRow}>
            <View style={styles.avatar}><Ionicons name="person-outline" size={18} color={Brand.navy} /></View>
            <View style={styles.flex}>
              <Text style={styles.name}>{employee.name}</Text>
              <Text style={styles.meta}>{[
                employee.role, employee.locationName,
                employee.grossSalary === null ? null : `Brut ${displayMoney(employee.grossSalary)}`,
                employee.netSalary === null ? null : `Net ${displayMoney(employee.netSalary)}`,
              ].filter(Boolean).join(' · ') || 'Fără detalii'}</Text>
            </View>
            <Pressable accessibilityLabel={`Checklist ${employee.name}`} onPress={() => router.push({ pathname: '/tools/hr-lifecycle', params: { employeeId: employee.id } } as never)} style={styles.iconButton}><Ionicons name="checkbox-outline" size={19} color={Brand.navy} /></Pressable>
            <Pressable accessibilityLabel={`Editează ${employee.name}`} onPress={() => editEmployee(employee.id)} style={styles.iconButton}><Ionicons name="create-outline" size={20} color={Brand.navy} /></Pressable>
            <Pressable accessibilityLabel={`Șterge ${employee.name}`} onPress={() => deleteEmployee(employee.id)} style={styles.iconButton}><Ionicons name="trash-outline" size={19} color={Brand.red} /></Pressable>
          </View>
        ))}
        {!data.employees.length && <Body>Adaugă primul angajat pentru a crea fișa de pontaj.</Body>}
      </Card>
    </>}

    {mode === 'schedule' && <>
      <Card tone="navy">
        <SectionHeader eyebrow="LUNA FIȘELOR" title={hrPeriodLabel(sheetMonth)} light />
        <View style={styles.monthNav}>
          <Pressable accessibilityLabel="Luna anterioară" onPress={() => setSheetMonth(changeHrPeriod(sheetMonth, -1))} style={styles.monthNavButton}><Ionicons name="chevron-back" size={22} color={Brand.white} /></Pressable>
          <Text style={styles.monthCode}>{sheetMonth}</Text>
          <Pressable accessibilityLabel="Luna următoare" onPress={() => setSheetMonth(changeHrPeriod(sheetMonth, 1))} style={styles.monthNavButton}><Ionicons name="chevron-forward" size={22} color={Brand.white} /></Pressable>
        </View>
      </Card>

      <Card>
        <SectionHeader eyebrow={`${monthRows.length} FIȘE`} title="Alege angajatul" />
        <Body>Fiecare angajat are o singură fișă pe lună. O zi salvată din nou este actualizată, nu duplicată.</Body>
        {monthRows.map((row) => {
          const selected = row.employee.id === employeeId;
          const completed = row.presentDays + row.absentDays + row.leaveDays + row.dayOffDays + row.scheduledDays;
          return (
            <Pressable key={row.employee.id} onPress={() => openEmployeeSheet(row.employee.id)} style={({ pressed }) => [styles.sheetRow, selected && styles.sheetRowSelected, pressed && styles.pressed]}>
              <View style={[styles.avatar, selected && styles.avatarSelected]}><Ionicons name="document-text-outline" size={18} color={selected ? Brand.white : Brand.navy} /></View>
              <View style={styles.flex}><Text style={styles.name}>{row.employee.name}</Text><Text style={styles.meta}>{row.employee.role || 'Fără funcție'} · {completed} zile · {row.totalHours.toFixed(1)} ore</Text></View>
              <Ionicons name={selected ? 'checkmark-circle' : 'chevron-forward'} size={21} color={selected ? Brand.teal : Brand.muted} />
            </Pressable>
          );
        })}
        {!monthRows.length && <Body>Nu există angajați activi.</Body>}
      </Card>

      {selectedMonthRow && <>
        <Card>
          <SectionHeader eyebrow="FIȘĂ LUNARĂ UNICĂ" title={selectedMonthRow.employee.name} />
          <View style={styles.sheetSummary}>
            <StatusPill label={`${selectedMonthRow.totalHours.toFixed(1)} ore`} status="healthy" />
            <StatusPill label={`${selectedMonthRow.presentDays} prezente`} status="healthy" />
            <StatusPill label={`${selectedMonthRow.absentDays} absențe`} status={selectedMonthRow.absentDays ? 'critical' : 'neutral'} />
            <StatusPill label={`${selectedMonthRow.leaveDays} concediu`} status="neutral" />
          </View>
          <View style={styles.monthGrid}>
            {Array.from({ length: hrPeriodParts(sheetMonth).days }, (_, index) => {
              const day = index + 1;
              const shift = selectedMonthRow.shiftsByDay.get(day);
              const selected = workDate === hrDateForDay(sheetMonth, day);
              return (
                <Pressable
                  key={day}
                  accessibilityLabel={`Ziua ${day}, ${shift ? HR_STATUS_LABELS[shift.status] : 'necompletată'}`}
                  onPress={() => openDay(day)}
                  style={({ pressed }) => [
                    styles.dayCell,
                    hrDayIsWeekend(sheetMonth, day) && styles.dayWeekend,
                    shift?.status === 'present' && styles.dayPresent,
                    shift?.status === 'absent' && styles.dayAbsent,
                    shift?.status === 'leave' && styles.dayLeave,
                    shift?.status === 'day_off' && styles.dayOff,
                    shift?.status === 'scheduled' && styles.dayScheduled,
                    selected && styles.daySelected,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={styles.dayNumber}>{day}</Text>
                  <Text style={styles.dayWeek}>{hrWeekdayLabel(sheetMonth, day)}</Text>
                  <Text style={styles.dayValue}>{shift ? hrDayCellValue(shift) || HR_STATUS_CODES[shift.status] : '—'}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card>
          <SectionHeader eyebrow={editingShiftId ? 'ACTUALIZARE ZI' : 'ZI NOUĂ'} title={`${selectedMonthRow.employee.name} · ${workDate}`} />
          <HaccpDateInput label="Data" locale="ro" value={workDate} onChange={(next) => {
            setWorkDate(next);
            const existing = data.shifts.find((item) => item.employeeId === employeeId && item.workDate === next);
            if (existing) editShift(existing);
            else clearShiftFields(employeeId, next);
          }} />
          <View style={styles.row}>
            <View style={styles.flex}><HaccpTimeInput label="Program început" locale="ro" value={plannedStart} onChange={setPlannedStart} /></View>
            <View style={styles.flex}><HaccpTimeInput label="Program sfârșit" locale="ro" value={plannedEnd} onChange={setPlannedEnd} /></View>
          </View>
          <ChoiceRow label="Status" value={status} options={[...statusOptions]} onChange={setStatus} />
          {status === 'present' && <View style={styles.row}>
            <View style={styles.flex}><HaccpTimeInput label="Ora intrării" locale="ro" value={actualStart || plannedStart} onChange={setActualStart} /></View>
            <View style={styles.flex}><HaccpTimeInput label="Ora ieșirii" locale="ro" value={actualEnd || plannedEnd} onChange={setActualEnd} /></View>
          </View>}
          <Field label="Observații" multiline numberOfLines={3} value={notes} onChangeText={setNotes} />
          <AppButton label={editingShiftId ? 'Actualizează ziua' : 'Salvează ziua în fișă'} icon="save-outline" fullWidth loading={busy} onPress={() => void saveShift()} />
          {editingShiftId && <AppButton label="Renunță la editare" variant="secondary" fullWidth onPress={() => clearShiftFields(employeeId, workDate)} />}
        </Card>

        <Card>
          <SectionHeader eyebrow={`${selectedMonthShifts.length} ZILE`} title="Înregistrările fișei" />
          {selectedMonthShifts.map((shift) => (
            <View key={shift.id} style={styles.listRow}>
              <View style={styles.flex}>
                <Text style={styles.name}>{shift.workDate} · {HR_STATUS_LABELS[shift.status]}</Text>
                <Text style={styles.meta}>{shift.plannedStart}–{shift.plannedEnd}{shift.actualStart ? ` · ${shift.actualStart}–${shift.actualEnd}` : ''} · {hrShiftWorkedHours(shift).toFixed(1)} ore</Text>
              </View>
              <Pressable accessibilityLabel={`Editează ziua ${shift.workDate}`} onPress={() => editShift(shift)} style={styles.iconButton}><Ionicons name="create-outline" size={19} color={Brand.navy} /></Pressable>
              <Pressable accessibilityLabel={`Șterge ziua ${shift.workDate}`} onPress={() => deleteShift(shift)} style={styles.iconButton}><Ionicons name="trash-outline" size={18} color={Brand.red} /></Pressable>
            </View>
          ))}
          {!selectedMonthShifts.length && <Body>Fișa nu are încă nicio zi completată.</Body>}
        </Card>
      </>}
    </>}

    {mode === 'reports' && <>
      <Card tone="navy">
        <SectionHeader eyebrow="RAPORT SELECTAT" title={`${reportEmployees.length} fișe · ${reportHours.toFixed(1)} ore`} light />
        <Text style={styles.hero}>{reportMonth}</Text>
      </Card>
      <Card>
        <SectionHeader title="Filtre și export" />
        <Field label="Luna (AAAA-LL)" value={reportMonth} onChangeText={setReportMonth} placeholder="2026-09" />
        <Select label="Locație" placeholder="Toate locațiile" value={reportLocation} allowClear options={locations.map((item) => ({ value: item.id, label: item.name }))} onChange={setReportLocation} />
        <Body>Excelul conține matricea lunară ca în modelul furnizat și câte o filă individuală pentru fiecare angajat.</Body>
        <AppButton label="Descarcă Excel" icon="grid-outline" fullWidth loading={exporting === 'excel'} disabled={!reportEmployees.length || exporting !== null} onPress={() => void exportReport('excel')} />
        <AppButton label="Descarcă PDF" icon="document-text-outline" variant="secondary" fullWidth loading={exporting === 'pdf'} disabled={!reportEmployees.length || exporting !== null} onPress={() => void exportReport('pdf')} />
      </Card>
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tab: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: Radius.pill, backgroundColor: Brand.white },
  tabActive: { backgroundColor: Brand.navy },
  tabText: { color: Brand.navy, fontSize: 11, fontFamily: Fonts.bold },
  tabTextActive: { color: Brand.white },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  flex: { flex: 1, minWidth: 130 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: Brand.line, paddingBottom: 10 },
  sheetRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Brand.line, borderRadius: 15, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: Brand.white },
  sheetRowSelected: { borderColor: Brand.teal, backgroundColor: '#EEF8F6' },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEF3F6', alignItems: 'center', justifyContent: 'center' },
  avatarSelected: { backgroundColor: Brand.teal },
  iconButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F7F8' },
  name: { color: Brand.navyDeep, fontFamily: Fonts.bold, fontSize: 13 },
  meta: { color: Brand.muted, fontFamily: Fonts.regular, fontSize: 10, lineHeight: 15, marginTop: 2 },
  hero: { color: Brand.white, fontSize: 28, fontFamily: Fonts.extraBold, ...TabularNumbers },
  heroSmall: { color: Brand.white, fontSize: 18, fontFamily: Fonts.extraBold, ...TabularNumbers },
  lightNote: { color: '#D9EEE9', fontSize: 11, lineHeight: 16, fontFamily: Fonts.medium },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  monthNavButton: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  monthCode: { color: Brand.white, fontSize: 18, fontFamily: Fonts.extraBold, ...TabularNumbers },
  sheetSummary: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  dayCell: { width: '13.1%', minHeight: 74, borderWidth: 1, borderColor: Brand.line, borderRadius: 12, backgroundColor: Brand.white, alignItems: 'center', justifyContent: 'center', paddingVertical: 5 },
  dayWeekend: { backgroundColor: '#F5F2F2' },
  dayPresent: { backgroundColor: '#E2F4EA', borderColor: '#A9D9BD' },
  dayAbsent: { backgroundColor: '#FDE6E6', borderColor: '#E8A9AE' },
  dayLeave: { backgroundColor: '#E8F0FB', borderColor: '#B4CAE8' },
  dayOff: { backgroundColor: '#ECEFF1', borderColor: '#C8D0D5' },
  dayScheduled: { backgroundColor: '#FFF2CC', borderColor: '#E5C969' },
  daySelected: { borderWidth: 3, borderColor: Brand.gold },
  dayNumber: { color: Brand.navyDeep, fontSize: 16, fontFamily: Fonts.extraBold, ...TabularNumbers },
  dayWeek: { color: Brand.muted, fontSize: 8, fontFamily: Fonts.bold, marginTop: 1 },
  dayValue: { color: Brand.navy, fontSize: 10, fontFamily: Fonts.extraBold, marginTop: 4, ...TabularNumbers },
  pressed: { opacity: 0.72 },
});
