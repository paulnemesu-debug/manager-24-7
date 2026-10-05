import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { buildRedistributionReportHtml, buildWasteDossierHtml, buildWastePlanHtml } from '@/lib/waste-compliance-sheet';
import type { WasteEntry } from '@/types/operations-control';
import type { FoodRedistribution, WastePreventionPlan, WasteReceiver } from '@/types/waste-compliance';

async function sharePdf(html: string, title: string, fileName: string) {
  if (Platform.OS === 'web') { await Print.printAsync({ html }); return null; }
  const { uri } = await Print.printToFileAsync({ html });
  const source = new File(uri);
  const target = new File(Paths.cache, fileName);
  if (target.exists) target.delete();
  await source.copy(target);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Partajarea fișierelor nu este disponibilă pe acest dispozitiv.');
  await Sharing.shareAsync(target.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
  return target.uri;
}

export const exportWastePlanPdf = (plan: WastePreventionPlan) => sharePdf(
  buildWastePlanHtml(plan),
  `Plan risipă ${plan.reportingYear}`,
  `plan-anual-risipa-${plan.reportingYear}.pdf`,
);

export const exportRedistributionPdf = (
  year: number,
  transfers: FoodRedistribution[],
  receivers: WasteReceiver[],
  plan?: WastePreventionPlan | null,
) => sharePdf(
  buildRedistributionReportHtml(year, transfers, receivers, plan),
  `Raport anual redistribuire ${year}`,
  `raport-anual-redistribuire-anexa-2-${year}.pdf`,
);

export const exportWasteDossierPdf = (
  year: number,
  plan: WastePreventionPlan | null,
  transfers: FoodRedistribution[],
  receivers: WasteReceiver[],
  wasteEntries: WasteEntry[],
) => sharePdf(
  buildWasteDossierHtml(year, plan, transfers, receivers, wasteEntries),
  `Dosar risipă și redistribuire ${year}`,
  `dosar-risipa-redistribuire-${year}.pdf`,
);
