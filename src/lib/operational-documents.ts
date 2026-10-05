import { isIsoDate, localIsoDate } from '@/lib/local-date-time';
import { createOperationalStore } from '@/lib/operational-sync';
import type { OperationalDocument, OperationalDocumentCategory } from '@/types/operational-document';

export const DOCUMENT_CATEGORIES: { value: OperationalDocumentCategory; label: string }[] = [
  { value: 'authorization', label: 'Autorizație' }, { value: 'medical', label: 'Medicina muncii' },
  { value: 'training', label: 'Instruire' }, { value: 'supplier', label: 'Furnizor' },
  { value: 'haccp', label: 'HACCP' }, { value: 'other', label: 'Altele' },
];
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
export async function saveOperationalDocument(userId: string, draft: Omit<OperationalDocument, 'id' | 'updatedAt'> & { id?: string }) {
  if (!draft.title.trim() || draft.title.length > 200) throw new Error('Introdu un titlu de maximum 200 de caractere.');
  if ((draft.issueDate && !isIsoDate(draft.issueDate)) || (draft.expiryDate && !isIsoDate(draft.expiryDate))) {
    throw new Error('Data trebuie să existe în calendar și să aibă formatul AAAA-LL-ZZ.');
  }
  if (draft.issueDate && draft.expiryDate && draft.issueDate > draft.expiryDate) throw new Error('Expirarea nu poate preceda emiterea.');
  if (draft.owner.length > 200 || draft.notes.length > 4000) throw new Error('Responsabilul sau observațiile sunt prea lungi.');
  return store.save(userId, { ...draft, title: draft.title.trim(), owner: draft.owner.trim(), notes: draft.notes.trim(),
    id: draft.id ?? `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`, updatedAt: '' });
}

/** Compare calendar dates, avoiding partial-day rounding and daylight-saving offsets. */
export function documentExpiryStatus(expiryDate: string, today = new Date()) {
  if (!expiryDate) return { days: null, tone: 'neutral' as const, label: 'Fără termen' };
  if (!isIsoDate(expiryDate)) return { days: null, tone: 'danger' as const, label: 'Dată invalidă' };
  const days = Math.round((Date.parse(`${expiryDate}T00:00:00Z`) - Date.parse(`${localIsoDate(today)}T00:00:00Z`)) / 86400000);
  if (days < 0) return { days, tone: 'danger' as const, label: 'Expirat' };
  if (days === 0) return { days, tone: 'watch' as const, label: 'Expiră azi' };
  if (days <= 30) return { days, tone: 'watch' as const, label: `Expiră în ${days} zile` };
  return { days, tone: 'healthy' as const, label: 'Valabil' };
}
