import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { printHtmlInBrowser } from '@/lib/web-print';

/** Returns a native file only when the device cannot open its share sheet. */
export async function exportHaccpLabelPdf(html: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    await printHtmlInBrowser(html);
    return null;
  }
  const file = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) return file.uri;
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf' });
  return null;
}
