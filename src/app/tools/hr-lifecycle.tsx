import { useI18n } from '@/contexts/locale-context';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ToolHeader } from '@/components/tool-header';
import { Select } from '@/components/inputs';
import { AppButton, Card, Field, Screen, SectionHeader } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useOperationalResource } from '@/hooks/use-operational-resource';
import { loadHrData } from '@/lib/hr-repository';
import { defaultHrLifecycle, getHrLifecycleLabels, getHrLifecycleChecks, hrLifecycleProgress, loadHrLifecycle, saveHrLifecycle, resolveHrLifecycle, type HrLifecycle } from '@/lib/hr-lifecycle';
import { operationalSyncLabel, operationalErrorMessage } from '@/lib/operational-sync';
import type { HrEmployee } from '@/types/hr';
import { Brand, Fonts } from '@/constants/theme';

export default function HrLifecycleScreen() {
  const auth = useAuth();
  const { locale, t } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ employeeId?: string }>();
  const userId = auth.user?.id ?? 'demo';
  const { data, error, loading, refresh } = useOperationalResource(useCallback(async () => {
    const hr = await loadHrData(userId);
    return { employees: hr.employees, items: await loadHrLifecycle(userId) };
  }, [userId]));
  const [editing, setEditing] = useState<string | null>(null);
  return <Screen><ToolHeader title={t('operational.lifecycle.title')} subtitle={t('operational.lifecycle.subtitle')} />
    {loading && <Text>{t('operational.lifecycle.loading')}</Text>}
    {!!error && <Card><Text>{error}</Text><AppButton label={t('operational.common.retry')} onPress={refresh} /></Card>}
    {data?.employees.length === 0 && <Card><Text>{t('operational.lifecycle.empty')}</Text><AppButton label={t('operational.lifecycle.addEmployee')} onPress={() => router.push('/tools/hr')} /></Card>}
    {data?.employees.map((employee) => {
      const item = data.items.find((entry) => entry.employeeId === employee.id) ?? defaultHrLifecycle(employee);
      const progress = hrLifecycleProgress(item);
      return <Card key={employee.id}><SectionHeader eyebrow={employee.role || t('operational.lifecycle.employee')} title={employee.name} />
        <Text style={styles.state}>{t('operational.lifecycle.progress', { status: getHrLifecycleLabels(locale)[item.status], completed: progress.completed, total: progress.total })}</Text>
        <Text style={styles.meta}>{operationalSyncLabel(item, locale)}</Text>
        {item.syncState === 'conflict' ? <View style={styles.stack}>
          <Text style={styles.meta}>{t('operational.lifecycle.remoteSummary', { status: getHrLifecycleLabels(locale)[item.remoteConflict?.data.status as HrLifecycle['status']] ?? String(item.remoteConflict?.data.status ?? ''), date: item.remoteConflict?.updated_at ?? '' })}</Text>
          <AppButton label={t('operational.common.remote')} onPress={() => void resolveHrLifecycle(userId, employee.id, 'remote').then(refresh).catch((reason) => Alert.alert(t('operational.common.notSaved'), operationalErrorMessage(reason, locale)))} />
          <AppButton label={t('operational.common.local')} variant="secondary" onPress={() => void resolveHrLifecycle(userId, employee.id, 'local').then(refresh).catch((reason) => Alert.alert(t('operational.common.notSaved'), operationalErrorMessage(reason, locale)))} />
        </View> : editing === employee.id || params.employeeId === employee.id ? <LifecycleEditor key={`${userId}:${employee.id}`} userId={userId} employee={employee} initial={item} onSaved={() => { setEditing(null); router.setParams({ employeeId: '' }); refresh(); }} />
          : <AppButton label={t('operational.lifecycle.open')} variant="secondary" onPress={() => setEditing(employee.id)} />}
      </Card>;
    })}
  </Screen>;
}
function LifecycleEditor({ userId, employee, initial, onSaved }: { userId: string; employee: HrEmployee; initial: HrLifecycle; onSaved: () => void }) {
  const { locale, t } = useI18n();
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const checks = getHrLifecycleChecks(draft.status, locale);
  const save = async () => {
    setBusy(true);
    try { await saveHrLifecycle(userId, draft, locale); onSaved(); }
    catch (error) { Alert.alert(t('operational.lifecycle.saveError'), operationalErrorMessage(error, locale)); }
    finally { setBusy(false); }
  };
  return <View style={styles.stack}>
    <Select label={t('operational.lifecycle.stage')} value={draft.status} placeholder={t('operational.lifecycle.chooseStage')} options={Object.entries(getHrLifecycleLabels(locale)).map(([value, label]) => ({ value: value as HrLifecycle['status'], label }))} onChange={(status) => { if (status) setDraft((current) => ({ ...current, status })); }} />
    <Field label={t('operational.lifecycle.hireDate')} value={draft.hireDate} onChangeText={(hireDate) => setDraft((current) => ({ ...current, hireDate }))} />
    {(draft.status === 'offboarding' || draft.status === 'left') && <Field label={t('operational.lifecycle.exitDate')} value={draft.exitDate} onChangeText={(exitDate) => setDraft((current) => ({ ...current, exitDate }))} />}
    {checks.map((check) => <Pressable key={check.key} accessibilityRole="checkbox" accessibilityState={{ checked: draft[check.key], disabled: busy }} disabled={busy} onPress={() => setDraft((current) => ({ ...current, [check.key]: !current[check.key] }))} style={styles.check}><Text style={styles.state}>{draft[check.key] ? '☑' : '☐'} {check.label}</Text></Pressable>)}
    <Field label={t('operational.lifecycle.notes')} value={draft.notes} multiline onChangeText={(notes) => setDraft((current) => ({ ...current, notes }))} />
    {draft.status === 'left' && <Text style={styles.meta}>{t('operational.lifecycle.leftNote', { name: employee.name })}</Text>}
    <AppButton label={t('operational.lifecycle.save')} loading={busy} onPress={() => void save()} />
    <AppButton label={t('operational.common.cancel')} variant="ghost" disabled={busy} onPress={onSaved} />
  </View>;
}
const styles = StyleSheet.create({ state: { fontFamily: Fonts.bold, color: Brand.navyDeep, lineHeight: 21 }, meta: { fontFamily: Fonts.regular, color: Brand.muted, fontSize: 12, lineHeight: 18, marginVertical: 7 }, stack: { gap: 10, marginTop: 10 }, check: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Brand.mint } });
