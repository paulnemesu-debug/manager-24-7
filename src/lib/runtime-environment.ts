/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 */

export const PRODUCTION_SUPABASE_PROJECT_REF = 'mnaaibsmijziutxuluvv';

export type AppEnvironment = 'development' | 'staging' | 'production';

type RuntimeEnvironmentInput = {
  EXPO_PUBLIC_APP_ENV?: string;
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
};

export type RuntimeEnvironment = {
  configured: false;
  appEnv: null;
} | {
  configured: true;
  appEnv: AppEnvironment;
  supabaseUrl: string;
  supabasePublishableKey: string;
  projectRef: string;
};

const clean = (value: string | undefined) => value?.trim() || '';

export function resolveRuntimeEnvironment(input: RuntimeEnvironmentInput): RuntimeEnvironment {
  const appEnvValue = clean(input.EXPO_PUBLIC_APP_ENV);
  const supabaseUrl = clean(input.EXPO_PUBLIC_SUPABASE_URL);
  const supabasePublishableKey = clean(input.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const supplied = [appEnvValue, supabaseUrl, supabasePublishableKey].filter(Boolean).length;

  if (supplied === 0) return { configured: false, appEnv: null };
  if (supplied !== 3) throw new Error('incomplete_runtime_environment');
  if (!['development', 'staging', 'production'].includes(appEnvValue)) {
    throw new Error('invalid_app_environment');
  }

  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw new Error('invalid_supabase_url');
  }
  const match = /^([a-z]{20})\.supabase\.co$/.exec(url.hostname);
  if (url.protocol !== 'https:' || url.pathname !== '/' || !match || !supabasePublishableKey.startsWith('sb_publishable_')) {
    throw new Error('invalid_supabase_url');
  }

  const appEnv = appEnvValue as AppEnvironment;
  const projectRef = match[1];
  if (appEnv === 'production' && projectRef !== PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error('non_production_project_for_production_runtime');
  }
  if (appEnv !== 'production' && projectRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error('production_project_for_non_production_runtime');
  }

  return { configured: true, appEnv, supabaseUrl: url.toString(), supabasePublishableKey, projectRef };
}
