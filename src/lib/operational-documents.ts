import { translate, type Locale, type TranslationKey } from '@/i18n/translations';
import { isIsoDate, localIsoDate } from '@/lib/local-date-time';
import { createOperationalStore } from '@/lib/operational-sync';
import type { OperationalDocument, OperationalDocumentCategory } from '@/types/operational-document';

export function getDocumentCategories(locale: Locale = 'ro'): { value: OperationalDocumentCategory; label: string }[] {
  const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(locale, key, params);
  return [
  { value: 'authorization', label: t('operational.documents.authorization') }, { value: 'medical', label: t('operational.documents.medical') },
  { value: 'training', label: t('operational.documents.training') }, { value: 'supplier', label: t('operational.documents.supplier') },
  { value: 'haccp', label: 'HACCP' }, { value: 'other', label: t('operational.documents.other') },
];
}
export const DOCUMENT_CATEGORIES = getDocumentCategories();
const store = createOperationalStore<OperationalDocument>({
  key: (userId) => `manager247.operational-documents.v1.${userId}`, table: 'operational_documents', id: (item) => item.id,
  normalize(value) {
    if (!value || typeof value !== 'object') return null;
    const item = value as OperationalDocument;
    if (typeof item.id !== 'string' || typeof item.title !== 'string') return null;
    return { ...item, owner: item.owner ?? '', issueDate: item.issueDate ?? '', expiryDate: item.expiryDate ?? '',
      notes: item.notes ?? '', category: DOCUMENT_CATEGORIES.some((category) => category.value === item.category) ? item.category : 'other',
      archived: item.archived === true, updatedAt: item.updatedAt ?? '' };
  },
});
export const loadOperationalDocuments = store.load;
export const resolveOperationalDocument = store.resolve;
export async function saveOperationalDocument(userId: string, draft: Omit<OperationalDocument, 'id' | 'updatedAt'> & { id?: string }, locale: Locale = 'ro') {
  const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(locale, key, params);

  if (!draft.title.trim() || draft.title.length > 200) throw new Error(t('operational.documents.titleValidation'));
  if ((draft.issueDate && !isIsoDate(draft.issueDate)) || (draft.expiryDate && !isIsoDate(draft.expiryDate))) {
    throw new Error(t('operational.documents.dateValidation'));
  }
  if (draft.issueDate && draft.expiryDate && draft.issueDate > draft.expiryDate) throw new Error(t('operational.documents.dateOrder'));
  if (draft.owner.length > 200 || draft.notes.length > 4000) throw new Error(t('operational.documents.length'));
  return store.save(userId, { ...draft, title: draft.title.trim(), owner: draft.owner.trim(), notes: draft.notes.trim(),
    id: draft.id ?? `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`, updatedAt: '' });
}

/** Compare calendar dates, avoiding partial-day rounding and daylight-saving offsets. */
export function documentExpiryStatus(expiryDate: string, today = new Date(), locale: Locale = 'ro') {
  const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(locale, key, params);

  if (!expiryDate) return { days: null, tone: 'neutral' as const, label: t('operational.documents.noExpiry') };
  if (!isIsoDate(expiryDate)) return { days: null, tone: 'danger' as const, label: t('operational.documents.invalidDate') };
  const days = Math.round((Date.parse(`${expiryDate}T00:00:00Z`) - Date.parse(`${localIsoDate(today)}T00:00:00Z`)) / 86400000);
  if (days < 0) return { days, tone: 'danger' as const, label: t('operational.documents.expired') };
  if (days === 0) return { days, tone: 'watch' as const, label: t('operational.documents.today') };
  if (days <= 30) return { days, tone: 'watch' as const, label: t('operational.documents.days', { days }) };
  return { days, tone: 'healthy' as const, label: t('operational.documents.valid') };
}
