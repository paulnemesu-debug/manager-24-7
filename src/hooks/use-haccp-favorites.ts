import { useCallback, useEffect, useRef, useState } from 'react';

import { loadHaccpFavorites, toggleHaccpFavorite } from '@/lib/haccp-favorites';

export function useHaccpFavorites(userId: string) {
  const activeUser = useRef(userId);
  const [state, setState] = useState<{ userId: string; codes: string[]; ready: boolean; error: boolean }>({ userId, codes: [], ready: false, error: false });
  useEffect(() => {
    activeUser.current = userId;
    let active = true;
    setState({ userId, codes: [], ready: false, error: false });
    void loadHaccpFavorites(userId).then((codes) => {
      if (active) setState({ userId, codes, ready: true, error: false });
    }).catch(() => { if (active) setState({ userId, codes: [], ready: false, error: true }); });
    return () => { active = false; };
  }, [userId]);
  const toggle = useCallback(async (code: string) => {
    const codes = await toggleHaccpFavorite(userId, code);
    if (activeUser.current === userId) setState({ userId, codes, ready: true, error: false });
  }, [userId]);
  return { codes: state.userId === userId ? state.codes : [], ready: state.userId === userId && state.ready, error: state.userId === userId && state.error, toggle };
}
