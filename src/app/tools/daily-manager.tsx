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
  const { locale, t } = useI18n();
  const { recipes } = useWorkspace();
  const userId = auth.user?.id ?? 'demo';
  const identity = auth.user?.email ?? t('operational.daily.demo');
  const { data, error, loading, refresh } = useOperationalResource(useCallback(() => loadDailyOperations(userId, recipes, locale, identity), [userId, recipes, locale, identity]));
  return <Screen>
    <ToolHeader title="AI Daily Manager" subtitle={t('operational.daily.subtitle')} />
    <Card tone="navy"><SectionHeader eyebrow={t('operational.daily.score')} title={loading || !data ? '—' : `${data.score}/100`} light />
      <Text style={styles.light}>{loading ? t('operational.common.loadingData') : data ? t('operational.daily.count', { count: data.signals.length }) : t('operational.daily.unavailable')}</Text>
      <Text style={styles.light}>{t('operational.daily.note')}</Text>
    </Card>
    {!!error && <Card><Text style={styles.detail}>{error}</Text><AppButton label={t('operational.common.retry')} onPress={refresh} /></Card>}
    {!!data?.pendingSync && <Card><Text style={styles.detail}>{t('operational.daily.pending', { count: data.pendingSync })}</Text></Card>}
    {data && <Card><SectionHeader eyebrow="DAILY OPERATIONS" title={t('operational.daily.shift')} />
      <Text style={styles.detail}>{t('operational.daily.shiftSummary', { done: data.input.haccpToday, expected: data.input.haccpExpected, recorded: data.input.attendanceRecorded, employees: data.input.activeEmployees })}</Text>
      <View style={styles.row}><AppButton label="HACCP" variant="secondary" onPress={() => router.push('/tools/haccp')} /><AppButton label={t('operational.daily.attendance')} variant="secondary" onPress={() => router.push('/tools/hr?mode=schedule' as never)} /></View>
    </Card>}
    {data?.signals.map((signal) => <Pressable key={signal.id} accessibilityRole="button" onPress={() => router.push(signal.route as never)}>
      <Card><View style={styles.row}><View style={styles.flex}><Text style={styles.title}>{signal.title}</Text><Text style={styles.detail}>{signal.detail}</Text></View>
        <StatusPill label={signal.severity === 'critical' ? t('operational.daily.critical') : signal.severity === 'warning' ? t('operational.daily.warning') : 'INFO'} status={signal.severity === 'critical' ? 'critical' : signal.severity === 'warning' ? 'watch' : 'neutral'} /></View>
        <Text style={styles.action}>{signal.action} →</Text></Card>
    </Pressable>)}
  </Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 8 }, flex: { flex: 1 }, title: { fontFamily: Fonts.extraBold, color: Brand.navyDeep, fontSize: 15 }, detail: { fontFamily: Fonts.regular, color: Brand.muted, fontSize: 13, lineHeight: 19, marginTop: 3 }, action: { fontFamily: Fonts.bold, color: Brand.goldInk, marginTop: 10 }, light: { fontFamily: Fonts.regular, color: Brand.white, marginTop: 6 } });
