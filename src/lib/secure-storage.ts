/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

// Metro selects secure-storage.native.ts or secure-storage.web.ts at bundle time.
// This bridge keeps the standalone TypeScript checker platform-agnostic.
export { secureStorageAdapter } from './secure-storage.native';
