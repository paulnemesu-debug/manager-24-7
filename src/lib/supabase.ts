/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import { secureStorageAdapter } from '@/lib/secure-storage';
import { workspaceFetch } from '@/lib/demo-isolation';
import { resolveRuntimeEnvironment } from '@/lib/runtime-environment';

const runtimeEnvironment = resolveRuntimeEnvironment({
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

export const isSupabaseConfigured = runtimeEnvironment.configured;
// Demo data is a development aid only. A production artifact can never turn
// it into an entitlement by changing an EAS environment variable.
export const isDemoMode = __DEV__ && process.env.EXPO_PUBLIC_DEMO_MODE === 'true';
export const isWeb = Platform.OS === 'web';

export const supabase: SupabaseClient | null = runtimeEnvironment.configured
  ? createClient(runtimeEnvironment.supabaseUrl, runtimeEnvironment.supabasePublishableKey, {
      global: { fetch: workspaceFetch },
      auth: {
        storage: secureStorageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        // Pe web sesiunea sosește în adresa paginii după linkul din email;
        // în aplicație intrăm cu un cod numeric, deci nu avem ce citi din URL.
        detectSessionInUrl: isWeb,
        flowType: 'pkce',
      },
    })
  : null;
