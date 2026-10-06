import { useI18n } from '@/contexts/locale-context';
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
import { exportControlDossierPdf } from '@/lib/control-export';
import { Brand, Fonts } from '@/constants/theme';
const authorities: InspectionAuthority[] = ['DSVSA', 'DSP', 'ITM', 'AUDIT'];
export default function ControlMode() {
  const router = useRouter();
  const auth = useAuth();
  const { locale, t } = useI18n();
  const { recipes } = useWorkspace();
  const userId = auth.user?.id ?? 'demo';
  const [authority, setAuthority] = useState<InspectionAuthority>('DSVSA');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { data, error, loading, refresh } = useOperationalResource(useCallback(() => loadDailyOperations(userId, recipes, locale), [userId, recipes, locale]));
  const checks = data ? inspectionReadiness(authority, { ...data.input, documentCount: data.documentCount, haccpDocuments: data.haccpDocuments, haccpPending: data.input.haccpExpected - data.input.haccpToday }, locale) : [];
  const exportDossier = async () => {
    if (!data || loading || error || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportControlDossierPdf(async () => (await loadDailyOperations(userId, recipes, locale)).inspection, authority, locale);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : locale === 'ro' ? 'Dosarul nu a putut fi generat. Încearcă din nou.' : 'The dossier could not be generated. Please try again.');
    } finally { setExporting(false); }
  };
  return <Screen><ToolHeader title="Control Mode" subtitle={t('operational.control.subtitle')} />
    <View style={styles.tabs}>{authorities.map((item) => <Pressable key={item} accessibilityRole="button" disabled={exporting} onPress={() => setAuthority(item)} style={[styles.tab, item === authority && styles.active]}><Text style={[styles.tabText, item === authority && styles.activeText]}>{item === 'AUDIT' ? t('operational.control.audit') : item}</Text></Pressable>)}</View>
    <Card tone="navy"><SectionHeader eyebrow={t('operational.control.readiness', { authority })} title={loading || !data ? '—' : `${readinessScore(checks)}%`} light /><Text style={styles.light}>{loading ? t('operational.common.loadingData') : data ? t('operational.control.count', { count: checks.filter((check) => !check.ok).length }) : t('operational.control.unavailable')}</Text></Card>
    {!!error && <Card><Text>{error}</Text><AppButton label={t('operational.common.retry')} onPress={refresh} /></Card>}
    {!!data?.pendingSync && <Card><Text style={styles.title}>{t('operational.control.pending')}</Text></Card>}
    <Card><SectionHeader title={locale === 'ro' ? 'Dosar de control' : 'Inspection dossier'} /><Text style={styles.description}>{locale === 'ro' ? 'Verificări, registrul documentelor și dovezi relevante pentru autoritatea selectată. Raport intern informativ; nu certifică respectarea obligațiilor legale.' : 'Checks, document register and relevant evidence for the selected authority. Internal information report; it does not certify legal compliance.'}</Text><AppButton label={locale === 'ro' ? 'Generează dosar PDF' : 'Generate dossier PDF'} icon="document-text-outline" fullWidth loading={exporting} disabled={!data || loading || !!error} onPress={() => void exportDossier()} />{!!exportError && <Text accessibilityRole="alert" style={styles.description}>{exportError}</Text>}</Card>
    {checks.map((check) => <Pressable key={check.id} accessibilityRole="button" onPress={() => router.push(check.route as never)}><Card><View style={styles.row}><View style={styles.flex}><Text style={styles.title}>{check.label}</Text></View><StatusPill label={check.ok ? t('operational.control.recorded') : t('operational.control.check')} status={check.ok ? 'healthy' : 'watch'} /></View><Text style={styles.action}>{t('operational.control.open')}</Text></Card></Pressable>)}
  </Screen>;
}
const styles = StyleSheet.create({ tabs: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' }, tab: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: Brand.mint }, active: { backgroundColor: Brand.navy }, tabText: { fontFamily: Fonts.bold, color: Brand.navy }, activeText: { color: Brand.white }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, flex: { flex: 1 }, title: { fontFamily: Fonts.bold, color: Brand.navyDeep }, description: { fontFamily: Fonts.regular, color: Brand.navyDeep, marginBottom: 12 }, action: { fontFamily: Fonts.bold, color: Brand.goldInk, marginTop: 8 }, light: { fontFamily: Fonts.regular, color: Brand.white } });
