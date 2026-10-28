import type { OperationalSync } from '@/lib/operational-sync';
export type OperationalDocumentCategory = 'authorization' | 'medical' | 'training' | 'supplier' | 'haccp' | 'other';
export type OperationalDocument = OperationalSync & {
  id: string; title: string; category: OperationalDocumentCategory; owner: string;
  issueDate: string; expiryDate: string; notes: string; updatedAt: string; archived?: boolean;
};
