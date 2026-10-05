import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ToolHeader } from '@/components/tool-header';
import { AppButton, Card, Screen, SectionHeader, StatusPill } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useWorkspace } from '@/contexts/workspace-context';
import { useI18n } from '@/contexts/locale-context';
import { useOperationalResource } from '@/hooks/use-operational-resource';
import { loadDailyOperations } from '@/lib/daily-operations';
import { Brand, Fonts } from '@/constants/theme';

export default function DailyManager() {
  const router = useRouter();
  const auth = useAuth();
  const { recipes } = useWorkspace();
  const { locale } = useI18n();
  const userId = auth.user?.id ?? 'demo';
  const identity = auth.user?.email ?? 'Operator demo';
  const { data, error, loading, refresh } = useOperationalResource(useCallback(() => loadDailyOperations(userId, recipes, locale, identity), [userId, recipes, locale, identity]));
  return <Screen>
    <ToolHeader title="AI Daily Manager" subtitle="Priorități explicabile din datele tale: costuri, tura HACCP, HR, documente, comenzi, inventar și risipă." />
    <Card tone="navy"><SectionHeader eyebrow="SCOR OPERAȚIONAL AZI" title={loading || !data ? '—' : `${data.score}/100`} light />
      <Text style={styles.light}>{loading ? 'Se încarcă datele…' : data ? `${data.signals.length} acțiuni necesită atenție.` : 'Scor indisponibil.'}</Text>
      <Text style={styles.light}>Scor orientativ pe baza înregistrărilor disponibile.</Text>
    </Card>
    {!!error && <Card><Text style={styles.detail}>{error}</Text><AppButton label="Reîncearcă" onPress={refresh} /></Card>}
    {!!data?.pendingSync && <Card><Text style={styles.detail}>{data.pendingSync} înregistrări locale așteaptă sincronizarea sau rezolvarea unui conflict. Prioritățile includ modificările locale.</Text></Card>}
    {data && <Card><SectionHeader eyebrow="DAILY OPERATIONS" title="Tura de azi" />
      <Text style={styles.detail}>HACCP: {data.input.haccpToday}/{data.input.haccpExpected} conforme · Pontaj confirmat: {data.input.attendanceRecorded}/{data.input.activeEmployees}</Text>
      <View style={styles.row}><AppButton label="HACCP" variant="secondary" onPress={() => router.push('/tools/haccp')} /><AppButton label="Pontaj" variant="secondary" onPress={() => router.push('/tools/hr?mode=schedule' as never)} /></View>
    </Card>}
    {data?.signals.map((signal) => <Pressable key={signal.id} accessibilityRole="button" onPress={() => router.push(signal.route as never)}>
      <Card><View style={styles.row}><View style={styles.flex}><Text style={styles.title}>{signal.title}</Text><Text style={styles.detail}>{signal.detail}</Text></View>
        <StatusPill label={signal.severity === 'critical' ? 'CRITIC' : signal.severity === 'warning' ? 'ATENȚIE' : 'INFO'} status={signal.severity === 'critical' ? 'critical' : signal.severity === 'warning' ? 'watch' : 'neutral'} /></View>
        <Text style={styles.action}>{signal.action} →</Text></Card>
    </Pressable>)}
  </Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 8 }, flex: { flex: 1 }, title: { fontFamily: Fonts.extraBold, color: Brand.navyDeep, fontSize: 15 }, detail: { fontFamily: Fonts.regular, color: Brand.muted, fontSize: 13, lineHeight: 19, marginTop: 3 }, action: { fontFamily: Fonts.bold, color: Brand.goldInk, marginTop: 10 }, light: { fontFamily: Fonts.regular, color: Brand.white, marginTop: 6 } });
