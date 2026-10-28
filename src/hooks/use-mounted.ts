/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { useEffect, useState } from 'react';

/**
 * `false` la prima randare, `true` după montare.
 * Pe web paginile sunt generate static pe server; ecranele care depind de
 * adresa curentă trebuie să arate același conținut ca serverul la prima
 * randare, altfel hidratarea eșuează.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
