/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  deleteHaccpDocument,
  loadCachedHaccpDocuments,
  saveHaccpDocument,
  saveHaccpDocuments,
  syncHaccpDocuments,
} from '@/lib/haccp-repository';
import type { HaccpDocument } from '@/types/haccp';

type DocumentState = { userId: string; documents: HaccpDocument[]; isLoading: boolean; isSyncing: boolean; syncError: string | null };
const emptyState = (userId: string): DocumentState => ({ userId, documents: [], isLoading: true, isSyncing: false, syncError: null });

export function useHaccpDocuments(userId: string) {
  const [state, setState] = useState(() => emptyState(userId));
  const scope = useRef({ userId, generation: 0 });
  const readGeneration = useRef(0);
  const documentOperations = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    scope.current = { userId, generation: scope.current.generation + 1 };
    documentOperations.current = new Map();
    return () => { scope.current.generation++; };
  }, [userId]);
  const captureOwner = useCallback(() => {
    const generation = scope.current.generation;
    return () => scope.current.userId === userId && scope.current.generation === generation;
  }, [userId]);
  const update = useCallback((change: (current: DocumentState) => DocumentState) => {
    setState(current => change(current.userId === userId ? current : emptyState(userId)));
  }, [userId]);

  const refresh = useCallback(async () => {
    const ownerIsCurrent = captureOwner();
    const generation = ++readGeneration.current;
    const isCurrent = () => ownerIsCurrent() && readGeneration.current === generation;
    const obsolete = { documents: [] as HaccpDocument[], pending: 0, error: 'account-or-document-changed' };
    if (!isCurrent()) return obsolete;
    update(current => ({ ...current, isSyncing: true }));
    try {
      // Publish durable rows before cloud work; a late cache read cannot overwrite a cloud result.
      const cached = await loadCachedHaccpDocuments(userId);
      if (!isCurrent()) return obsolete;
      update(current => ({ ...current, documents: cached.filter(item => !item.deletedAt), isLoading: false }));
      const result = await syncHaccpDocuments(userId);
      if (!isCurrent()) return obsolete;
      update(current => ({ ...current, documents: result.documents, syncError: result.error }));
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'HACCP documents could not be loaded';
      if (isCurrent()) update(current => ({ ...current, syncError: message }));
      return { documents: [] as HaccpDocument[], pending: 0, error: message };
    } finally {
      if (isCurrent()) update(current => ({ ...current, isLoading: false, isSyncing: false }));
    }
  }, [captureOwner, update, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async (document: HaccpDocument) => {
    const isCurrent = captureOwner();
    if (!isCurrent()) throw new Error('HACCP account changed. Reopen the form.');
    readGeneration.current++;
    const operation = (documentOperations.current.get(document.id) ?? 0) + 1;
    documentOperations.current.set(document.id, operation);
    update(current => ({ ...current, isSyncing: false }));
    const result = await saveHaccpDocument(userId, document);
    if (isCurrent() && documentOperations.current.get(document.id) === operation) update(current => ({ ...current, isLoading: false, isSyncing: false, documents: [
      result.document, ...current.documents.filter(item => item.id !== result.document.id),
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)) }));
    return result;
  }, [captureOwner, update, userId]);

  const saveMany = useCallback(async (items: readonly HaccpDocument[]) => {
    const isCurrent = captureOwner();
    if (!isCurrent()) throw new Error('HACCP account changed. Reopen the form.');
    readGeneration.current++;
    const operations = new Map<string, number>();
    for (const id of new Set(items.map(item => item.id))) {
      const operation = (documentOperations.current.get(id) ?? 0) + 1;
      operations.set(id, operation);
      documentOperations.current.set(id, operation);
    }
    update(current => ({ ...current, isSyncing: false }));
    const results = await saveHaccpDocuments(userId, items);
    // A later delete/save supersedes only that document, not unrelated members of this batch.
    const currentResults = results.filter(result => documentOperations.current.get(result.document.id) === operations.get(result.document.id));
    const savedById = new Map(currentResults.map(result => [result.document.id, result.document]));
    if (isCurrent()) update(current => ({ ...current, isLoading: false, isSyncing: false, documents: [
      ...currentResults.map(result => result.document), ...current.documents.filter(item => !savedById.has(item.id)),
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)) }));
    return results;
  }, [captureOwner, update, userId]);

  const remove = useCallback(async (document: HaccpDocument) => {
    const isCurrent = captureOwner();
    if (!isCurrent()) throw new Error('HACCP account changed. Reopen the form.');
    readGeneration.current++;
    const operation = (documentOperations.current.get(document.id) ?? 0) + 1;
    documentOperations.current.set(document.id, operation);
    update(current => ({ ...current, isSyncing: false, documents: current.documents.filter(item => item.id !== document.id) }));
    const deleted = await deleteHaccpDocument(userId, document);
    if (isCurrent() && documentOperations.current.get(document.id) === operation) update(current => ({ ...current,
      documents: current.documents.filter(item => item.id !== document.id), syncError: deleted ? current.syncError : 'pending-delete' }));
    return deleted;
  }, [captureOwner, update, userId]);

  const { documents, isLoading, isSyncing, syncError } = state.userId === userId ? state : emptyState(userId);
  const pendingCount = useMemo(
    () => documents.filter((item) => item.syncState === 'pending').length,
    [documents],
  );

  return { documents, isLoading, isSyncing, syncError, pendingCount, refresh, save, saveMany, remove };
}
