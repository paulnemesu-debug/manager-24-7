import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { HaccpDateInput } from '@/components/haccp-date-input';
import { ToolHeader } from '@/components/tool-header';
import { AppButton, Body, Card, ListSkeleton, Screen, SectionHeader, StatusPill } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { useWorkspace } from '@/contexts/workspace-context';
import { buildManagerActions } from '@/lib/manager-actions';
import { currentSalesPeriod, loadSales } from '@/lib/operations-storage';

export default function PrioritiesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { locale } = useI18n();
  const { format } = usePreferences();
  const { recipes, isLoading } = useWorkspace();
  const [period, setPeriod] = useState(currentSalesPeriod());
  const [sales, setSales] = useState<Record<string, number>>({});
  const [loadingSales, setLoadingSales] = useState(true);
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoadingSales(true);
    setSales({});
    void loadSales(user?.id ?? 'demo', period).then((data) => { if (active) setSales(data); })
      .catch(() => undefined).finally(() => { if (active) setLoadingSales(false); });
    return () => { active = false; };
  }, [period, user?.id]));
  const report = useMemo(() => buildManagerActions(recipes, sales), [recipes, sales]);
  const ro = locale === 'ro';
  if (isLoading) return <Screen scroll={false}><ListSkeleton rows={3} /></Screen>;
  return (
    <Screen>
      <ToolHeader title={ro ? 'Primele 3 acțiuni' : 'Top 3 actions'}
        subtitle={ro ? 'Unde merită să intervii prima dată, pe baza costurilor și vânzărilor înregistrate.' : 'Where to act first, based on recorded costs and sales.'} />
      <Card>
        <SectionHeader title={ro ? 'Luna analizată' : 'Analysis month'} />
        <HaccpDateInput label={ro ? 'Alege luna' : 'Choose month'} locale={locale} value={period}
          onChange={(value) => { if (/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(value)) setPeriod(value.slice(0, 7) + '-01'); }} />
        <Body>{ro
          ? `Cost calculabil: ${report.measuredCount}/${report.sellableCount} preparate. Vânzări înregistrate: ${report.salesCoveredCount}/${report.measuredCount} preparate · ${format.number(report.recordedPortions)} porții.`
          : `Measurable cost: ${report.measuredCount}/${report.sellableCount} dishes. Recorded sales: ${report.salesCoveredCount}/${report.measuredCount} dishes · ${format.number(report.recordedPortions)} portions.`}</Body>
        <Body>{ro ? 'Impactul este o oportunitate estimată de reducere a costului la prețul actual, nu o economie realizată. Scorul de pe Acasă evaluează food cost-ul rețetelor, nu profitul net.' : 'Impact is an estimated cost reduction opportunity at current prices, not realised savings. The Home score measures recipe food cost, not net profit.'}</Body>
        <AppButton label={ro ? 'Completează vânzările' : 'Enter sales'} variant="secondary" icon="bar-chart-outline"
          onPress={() => router.push('/tools/menu-engineering')} />
      </Card>
      {loadingSales ? <ListSkeleton rows={2} /> : report.actions.map((item, index) => (
        <Card key={item.recipe.id} tone="gold">
          <SectionHeader eyebrow={`${index + 1}`} title={item.recipe.title} />
          <StatusPill label={`${format.percent(item.recipe.totals.foodCostPercent ?? 0)} / ${format.percent(item.recipe.targetFoodCost)}`}
            status="watch" />
          <Body>{ro ? `Reducere necesară: ${format.money(item.reductionPerPortion)} / porție.` : `Cost reduction needed: ${format.money(item.reductionPerPortion)} / portion.`}</Body>
          <Body>{item.periodOpportunity === null
            ? (ro ? 'Volum necunoscut în luna aleasă. Impactul lunar nu poate fi estimat.' : 'Volume is unknown for this month. Period impact cannot be estimated.')
            : (ro ? `La ${format.number(item.recordedPortions ?? 0)} porții înregistrate: oportunitate ${format.money(item.periodOpportunity)} în luna aleasă.` : `For ${format.number(item.recordedPortions ?? 0)} recorded portions: ${format.money(item.periodOpportunity)} opportunity this month.`)}</Body>
          <Body>{ro ? 'Verifică prețul de achiziție, cantitatea și scăzământul; apoi ajustează porția sau prețul de vânzare.' : 'Check purchase prices, quantities and ingredient losses; then adjust portion size or selling price.'}</Body>
          <AppButton label={ro ? 'Deschide rețeta' : 'Open recipe'} icon="restaurant-outline"
            onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: item.recipe.id } })} />
        </Card>
      ))}
      {!loadingSales && !report.actions.length && <Card><Body>{ro
        ? (report.measuredCount ? 'Niciun preparat calculabil nu depășește ținta. Completează vânzările și urmărește P&L pentru rezultatul afacerii.' : 'Completează rețetele, costurile și prețurile de vânzare pentru a calcula prioritățile.')
        : (report.measuredCount ? 'No measurable dish exceeds its target. Complete sales and follow P&L for your business results.' : 'Complete recipes, costs and selling prices to calculate priorities.')}</Body></Card>}
    </Screen>
  );
}
