import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ToolHeader } from '@/components/tool-header';
import { Select } from '@/components/inputs';
import { AppButton, Card, Field, Screen, SectionHeader } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useOperationalResource } from '@/hooks/use-operational-resource';
import { loadHrData } from '@/lib/hr-repository';
import { defaultHrLifecycle, HR_LIFECYCLE_LABELS, HR_ONBOARDING_CHECKS, HR_OFFBOARDING_CHECKS, hrLifecycleProgress, loadHrLifecycle, saveHrLifecycle, resolveHrLifecycle, type HrLifecycle } from '@/lib/hr-lifecycle';
import { operationalSyncLabel } from '@/lib/operational-sync';
import type { HrEmployee } from '@/types/hr';
import { Brand, Fonts } from '@/constants/theme';

export default function HrLifecycleScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ employeeId?: string }>();
  const userId = auth.user?.id ?? 'demo';
  const { data, error, loading, refresh } = useOperationalResource(useCallback(async () => {
    const hr = await loadHrData(userId);
    return { employees: hr.employees, items: await loadHrLifecycle(userId) };
  }, [userId]));
  const [editing, setEditing] = useState<string | null>(null);
  return <Screen><ToolHeader title="HR · Angajare & plecare" subtitle="Checklist operațional legat de fișa fiecărui angajat. Bifează numai verificările efectuate." />
    {loading && <Text>Se încarcă fișele…</Text>}
    {!!error && <Card><Text>{error}</Text><AppButton label="Reîncearcă" onPress={refresh} /></Card>}
    {data?.employees.length === 0 && <Card><Text>Adaugă mai întâi fișa angajatului.</Text><AppButton label="Adaugă angajat" onPress={() => router.push('/tools/hr')} /></Card>}
    {data?.employees.map((employee) => {
      const item = data.items.find((entry) => entry.employeeId === employee.id) ?? defaultHrLifecycle(employee);
      const progress = hrLifecycleProgress(item);
      return <Card key={employee.id}><SectionHeader eyebrow={employee.role || 'ANGAJAT'} title={employee.name} />
        <Text style={styles.state}>{HR_LIFECYCLE_LABELS[item.status]} · {progress.completed}/{progress.total} verificări</Text>
        <Text style={styles.meta}>{operationalSyncLabel(item)}</Text>
        {item.syncState === 'conflict' ? <View style={styles.stack}>
          <Text style={styles.meta}>Versiunea din cont: {String(item.remoteConflict?.data.status ?? '')} · {item.remoteConflict?.updated_at}</Text>
          <AppButton label="Folosește versiunea din cont" onPress={() => void resolveHrLifecycle(userId, employee.id, 'remote').then(refresh).catch((reason) => Alert.alert('Nu s-a salvat', String(reason)))} />
          <AppButton label="Păstrează versiunea locală" variant="secondary" onPress={() => void resolveHrLifecycle(userId, employee.id, 'local').then(refresh).catch((reason) => Alert.alert('Nu s-a salvat', String(reason)))} />
        </View> : editing === employee.id || params.employeeId === employee.id ? <LifecycleEditor key={`${userId}:${employee.id}`} userId={userId} employee={employee} initial={item} onSaved={() => { setEditing(null); router.setParams({ employeeId: '' }); refresh(); }} />
          : <AppButton label="Deschide checklistul" variant="secondary" onPress={() => setEditing(employee.id)} />}
      </Card>;
    })}
  </Screen>;
}
function LifecycleEditor({ userId, employee, initial, onSaved }: { userId: string; employee: HrEmployee; initial: HrLifecycle; onSaved: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const checks = draft.status === 'offboarding' || draft.status === 'left' ? HR_OFFBOARDING_CHECKS : HR_ONBOARDING_CHECKS;
  const save = async () => {
    setBusy(true);
    try { await saveHrLifecycle(userId, draft); onSaved(); }
    catch (error) { Alert.alert('Fișa nu s-a salvat', error instanceof Error ? error.message : 'Încearcă din nou.'); }
    finally { setBusy(false); }
  };
  return <View style={styles.stack}>
    <Select label="Etapă" value={draft.status} placeholder="Alege etapa" options={Object.entries(HR_LIFECYCLE_LABELS).map(([value, label]) => ({ value: value as HrLifecycle['status'], label }))} onChange={(status) => { if (status) setDraft((current) => ({ ...current, status })); }} />
    <Field label="Data angajării (AAAA-LL-ZZ)" value={draft.hireDate} onChangeText={(hireDate) => setDraft((current) => ({ ...current, hireDate }))} />
    {(draft.status === 'offboarding' || draft.status === 'left') && <Field label="Data plecării (AAAA-LL-ZZ)" value={draft.exitDate} onChangeText={(exitDate) => setDraft((current) => ({ ...current, exitDate }))} />}
    {checks.map((check) => <Pressable key={check.key} accessibilityRole="checkbox" accessibilityState={{ checked: draft[check.key], disabled: busy }} disabled={busy} onPress={() => setDraft((current) => ({ ...current, [check.key]: !current[check.key] }))} style={styles.check}><Text style={styles.state}>{draft[check.key] ? '☑' : '☐'} {check.label}</Text></Pressable>)}
    <Field label="Observații / responsabil" value={draft.notes} multiline onChangeText={(notes) => setDraft((current) => ({ ...current, notes }))} />
    {draft.status === 'left' && <Text style={styles.meta}>După salvare, {employee.name} nu mai apare în lista personalului activ. Pontajele istorice se păstrează.</Text>}
    <AppButton label="Salvează checklistul" loading={busy} onPress={() => void save()} />
    <AppButton label="Renunță" variant="ghost" disabled={busy} onPress={onSaved} />
  </View>;
}
const styles = StyleSheet.create({ state: { fontFamily: Fonts.bold, color: Brand.navyDeep, lineHeight: 21 }, meta: { fontFamily: Fonts.regular, color: Brand.muted, fontSize: 12, lineHeight: 18, marginVertical: 7 }, stack: { gap: 10, marginTop: 10 }, check: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Brand.mint } });
