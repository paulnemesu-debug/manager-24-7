/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  deleteHaccpDocument,
  loadCachedHaccpDocuments,
  saveHaccpDocument,
  saveHaccpDocuments,
  syncHaccpDocuments,
} from '@/lib/haccp-repository';
import type { HaccpDocument } from '@/types/haccp';

export function useHaccpDocuments(userId: string) {
  const [documents, setDocuments] = useState<HaccpDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsSyncing(true);
    const result = await syncHaccpDocuments(userId);
    setDocuments(result.documents);
    setSyncError(result.error);
    setIsSyncing(false);
    return result;
  }, [userId]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    loadCachedHaccpDocuments(userId)
      .then((cached) => {
        if (active) setDocuments(cached.filter((item) => !item.deletedAt));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    void refresh().finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [refresh, userId]);

  const save = useCallback(async (document: HaccpDocument) => {
    const result = await saveHaccpDocument(userId, document);
    setDocuments((current) => [
      result.document,
      ...current.filter((item) => item.id !== result.document.id),
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
    return result;
  }, [userId]);

  const saveMany = useCallback(async (items: readonly HaccpDocument[]) => {
    const results = await saveHaccpDocuments(userId, items);
    const savedById = new Map(results.map((result) => [result.document.id, result.document]));
    setDocuments((current) => [
      ...results.map((result) => result.document),
      ...current.filter((item) => !savedById.has(item.id)),
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
    return results;
  }, [userId]);

  const remove = useCallback(async (document: HaccpDocument) => {
    setDocuments((current) => current.filter((item) => item.id !== document.id));
    const deleted = await deleteHaccpDocument(userId, document);
    if (!deleted) setSyncError('pending-delete');
    return deleted;
  }, [userId]);

  const pendingCount = useMemo(
    () => documents.filter((item) => item.syncState === 'pending').length,
    [documents],
  );

  return { documents, isLoading, isSyncing, syncError, pendingCount, refresh, save, saveMany, remove };
}
