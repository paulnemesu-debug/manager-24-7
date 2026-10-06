import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { printHtmlInBrowser } from '@/lib/web-print';
import { translate, type Locale } from '@/i18n/translations';
import { OperationalError } from '@/lib/operational-sync';
import { buildRedistributionReportHtml, buildWasteDossierHtml, buildWastePlanHtml } from '@/lib/waste-compliance-sheet';
import type { WasteEntry } from '@/types/operations-control';
import type { FoodRedistribution, WastePreventionPlan, WasteReceiver } from '@/types/waste-compliance';

async function sharePdf(html: string, title: string, fileName: string) {
  if (Platform.OS === 'web') { await printHtmlInBrowser(html); return null; }
  const { uri } = await Print.printToFileAsync({ html });
  const source = new File(uri);
  const target = new File(Paths.cache, fileName);
  if (target.exists) target.delete();
  await source.copy(target);
  if (!(await Sharing.isAvailableAsync())) throw new OperationalError('operational.shared.sharingUnavailable');
  await Sharing.shareAsync(target.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
  return target.uri;
}

export const exportWastePlanPdf = (plan: WastePreventionPlan, locale: Locale = 'ro') => sharePdf(
  buildWastePlanHtml(plan, locale),
  translate(locale, 'waste.pdf.planShareTitle', { year: plan.reportingYear }),
  locale === 'ro' ? `plan-anual-risipa-${plan.reportingYear}.pdf` : `annual-waste-plan-${plan.reportingYear}.pdf`,
);

export const exportRedistributionPdf = (
  year: number,
  transfers: FoodRedistribution[],
  receivers: WasteReceiver[],
  plan?: WastePreventionPlan | null,
  locale: Locale = 'ro',
) => sharePdf(
  buildRedistributionReportHtml(year, transfers, receivers, plan, locale),
  translate(locale, 'waste.pdf.reportShareTitle', { year }),
  locale === 'ro' ? `raport-anual-redistribuire-anexa-2-${year}.pdf` : `annual-redistribution-report-annex-2-${year}.pdf`,
);

export const exportWasteDossierPdf = (
  year: number,
  plan: WastePreventionPlan | null,
  transfers: FoodRedistribution[],
  receivers: WasteReceiver[],
  wasteEntries: WasteEntry[],
  locale: Locale = 'ro',
) => sharePdf(
  buildWasteDossierHtml(year, plan, transfers, receivers, wasteEntries, locale),
  translate(locale, 'waste.pdf.dossierShareTitle', { year }),
  locale === 'ro' ? `dosar-risipa-redistribuire-${year}.pdf` : `waste-redistribution-dossier-${year}.pdf`,
);
