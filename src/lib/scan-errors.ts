import type { Locale } from '@/i18n/translations';

const messages: Record<string, [string, string]> = {
  invoice_type_invalid: ['Alege o fotografie sau un document PDF.', 'Choose a photo or PDF document.'],
  invoice_too_large: ['Fișierul depășește limita de 18 MB.', 'The file exceeds the 18 MB limit.'],
  scan_image_too_large: ['Fotografia depășește limita de 8 MB după optimizare.', 'The photo exceeds the 8 MB limit after optimization.'],
  DOCUMENT_EMPTY: ['Fișierul este gol. Alege alt document.', 'The file is empty. Choose another document.'],
  authentication_required: ['Autentifică-te din nou pentru a scana documente.', 'Sign in again to scan documents.'],
  professional_access_required: ['Scanarea necesită un abonament activ și drept de editare.', 'Scanning requires an active subscription and editing access.'],
  scan_not_configured: ['Scanarea AI nu este activată încă. Poți importa Excel/CSV sau introduce datele manual.', 'AI scanning is not enabled yet. Import Excel/CSV or enter the data manually.'],
  scan_daily_limit: ['Limita zilnică de scanări a contului a fost atinsă. Reîncearcă mâine.', 'The account daily scan limit has been reached. Try again tomorrow.'],
  scan_rate_limited: ['Așteaptă 10 secunde înainte de o nouă scanare.', 'Wait 10 seconds before scanning again.'],
};

export async function scanFunctionError(error: unknown) {
  try {
    const context = (error as { context?: Response })?.context;
    if (context && typeof context.clone === 'function') {
      const body = await context.clone().json() as { error?: string };
      if (body.error && body.error in messages) return new Error(body.error);
    }
  } catch { /* Non-JSON gateway failures retain the existing fallback. */ }
  return error instanceof Error ? error : new Error('scan_unavailable');
}

export function scanErrorMessage(error: unknown, locale: Locale, fallback: string) {
  return error instanceof Error && messages[error.message] ? messages[error.message][locale === 'ro' ? 0 : 1] : fallback;
}
