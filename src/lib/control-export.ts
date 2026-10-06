import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { printHtmlInBrowser } from '@/lib/web-print';
import type { Locale } from '@/i18n/translations';
import type { InspectionAuthority } from '@/lib/control-mode';
import { buildControlReportHtml, type ControlReportData } from '@/lib/control-report';

/** Reload before rendering: an earlier successful snapshot is never a fallback after a load error. */
export async function exportControlDossierPdf(load: () => Promise<ControlReportData>, authority: InspectionAuthority, locale: Locale) {
  const data = await load();
  const generatedAt = new Date();
  const html = buildControlReportHtml(data, authority, locale, generatedAt);
  if (Platform.OS === 'web') {
    await printHtmlInBrowser(html);
    return null;
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error(locale === 'ro'
    ? 'Partajarea fișierelor nu este disponibilă pe acest dispozitiv.'
    : 'File sharing is not available on this device.');
  const generated = await Print.printToFileAsync({ html });
  const filename = `${locale === 'ro' ? 'dosar-control' : 'inspection-dossier'}-${authority}-${data.date}-${generatedAt.getTime()}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '-');
  const target = new File(Paths.cache, filename);
  if (target.exists) target.delete();
  new File(generated.uri).copy(target);
  await Sharing.shareAsync(target.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `${locale === 'ro' ? 'Dosar de control' : 'Inspection dossier'} · ${authority}` });
  return target.uri;
}
