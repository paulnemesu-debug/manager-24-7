/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  deleteHaccpAutocontrolEvent,
  loadCachedHaccpAutocontrol,
  saveHaccpAutocontrolEvent,
  saveHaccpAutocontrolEvents,
  syncHaccpAutocontrol,
} from '@/lib/haccp-autocontrol-repository';
import type { HaccpAutocontrolDraft, HaccpAutocontrolEvent } from '@/types/haccp-autocontrol';

export function useHaccpAutocontrol(userId: string) {
  const [events, setEvents] = useState<HaccpAutocontrolEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsSyncing(true);
    const result = await syncHaccpAutocontrol(userId);
    setEvents(result.events);
    setSyncError(result.error);
    setIsSyncing(false);
    return result;
  }, [userId]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    void loadCachedHaccpAutocontrol(userId).then((cached) => {
      if (active) setEvents(cached);
    });
    void refresh().finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [refresh, userId]);

  const save = useCallback(async (draft: HaccpAutocontrolDraft) => {
    const saved = await saveHaccpAutocontrolEvent(userId, draft);
    setEvents((current) => [saved, ...current.filter((event) => event.id !== saved.id)]
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt)));
    return saved;
  }, [userId]);

  const saveMany = useCallback(async (drafts: readonly HaccpAutocontrolDraft[]) => {
    const saved = await saveHaccpAutocontrolEvents(userId, drafts);
    const ids = new Set(saved.map((event) => event.id));
    setEvents((current) => [...saved, ...current.filter((event) => !ids.has(event.id))]
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt)));
    return saved;
  }, [userId]);

  const remove = useCallback(async (event: HaccpAutocontrolEvent) => {
    const deleted = await deleteHaccpAutocontrolEvent(userId, event);
    if (deleted) setEvents((current) => current.filter((item) => item.id !== event.id));
    else setSyncError('pending-delete');
    return deleted;
  }, [userId]);

  const pendingCount = useMemo(
    () => events.filter((event) => event.syncState === 'pending').length,
    [events],
  );

  return { events, isLoading, isSyncing, syncError, pendingCount, refresh, save, saveMany, remove };
}
