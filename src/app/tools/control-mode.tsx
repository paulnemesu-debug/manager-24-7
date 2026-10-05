import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ToolHeader } from '@/components/tool-header';
import { AppButton, Card, Screen, SectionHeader, StatusPill } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useWorkspace } from '@/contexts/workspace-context';
import { useOperationalResource } from '@/hooks/use-operational-resource';
import { loadDailyOperations } from '@/lib/daily-operations';
import { inspectionReadiness, readinessScore, type InspectionAuthority } from '@/lib/control-mode';
import { Brand, Fonts } from '@/constants/theme';
const authorities: InspectionAuthority[] = ['DSVSA', 'DSP', 'ITM', 'AUDIT'];
export default function ControlMode() {
  const router = useRouter();
  const auth = useAuth();
  const { recipes } = useWorkspace();
  const userId = auth.user?.id ?? 'demo';
  const [authority, setAuthority] = useState<InspectionAuthority>('DSVSA');
  const { data, error, loading, refresh } = useOperationalResource(useCallback(() => loadDailyOperations(userId, recipes), [userId, recipes]));
  const checks = data ? inspectionReadiness(authority, { ...data.input, documentCount: data.documentCount, haccpDocuments: data.haccpDocuments, haccpPending: data.input.haccpExpected - data.input.haccpToday }) : [];
  return <Screen><ToolHeader title="Control Mode" subtitle="Indicator intern de pregătire pe baza datelor introduse. Verifică separat cerințele aplicabile locației tale." />
    <View style={styles.tabs}>{authorities.map((item) => <Pressable key={item} accessibilityRole="button" onPress={() => setAuthority(item)} style={[styles.tab, item === authority && styles.active]}><Text style={[styles.tabText, item === authority && styles.activeText]}>{item === 'AUDIT' ? 'Audit intern' : item}</Text></Pressable>)}</View>
    <Card tone="navy"><SectionHeader eyebrow={`PREGĂTIRE ${authority}`} title={loading || !data ? '—' : `${readinessScore(checks)}%`} light /><Text style={styles.light}>{loading ? 'Se încarcă datele…' : data ? `${checks.filter((check) => !check.ok).length} aspecte de verificat.` : 'Evaluare indisponibilă.'}</Text></Card>
    {!!error && <Card><Text>{error}</Text><AppButton label="Reîncearcă" onPress={refresh} /></Card>}
    {!!data?.pendingSync && <Card><Text style={styles.title}>Există date nesincronizate. Evaluarea include înregistrările acestui dispozitiv.</Text></Card>}
    {checks.map((check) => <Pressable key={check.id} accessibilityRole="button" onPress={() => router.push(check.route as never)}><Card><View style={styles.row}><View style={styles.flex}><Text style={styles.title}>{check.label}</Text></View><StatusPill label={check.ok ? 'ÎNREGISTRAT' : 'VERIFICĂ'} status={check.ok ? 'healthy' : 'watch'} /></View><Text style={styles.action}>Deschide secțiunea →</Text></Card></Pressable>)}
  </Screen>;
}
const styles = StyleSheet.create({ tabs: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' }, tab: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: Brand.mint }, active: { backgroundColor: Brand.navy }, tabText: { fontFamily: Fonts.bold, color: Brand.navy }, activeText: { color: Brand.white }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, flex: { flex: 1 }, title: { fontFamily: Fonts.bold, color: Brand.navyDeep }, action: { fontFamily: Fonts.bold, color: Brand.goldInk, marginTop: 8 }, light: { fontFamily: Fonts.regular, color: Brand.white } });
