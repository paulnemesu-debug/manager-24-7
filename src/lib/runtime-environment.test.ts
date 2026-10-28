/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 */

import { describe, expect, it } from 'vitest';

import { PRODUCTION_SUPABASE_PROJECT_REF, resolveRuntimeEnvironment } from '@/lib/runtime-environment';

const stagingRef = 'abcdefghijklmnopqrst';
const valid = (appEnv: string, ref = stagingRef) => ({
  EXPO_PUBLIC_APP_ENV: appEnv,
  EXPO_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_qa_only',
});

describe('runtime environment isolation', () => {
  it('allows a completely unconfigured test/runtime to remain disconnected', () => {
    expect(resolveRuntimeEnvironment({})).toEqual({ configured: false, appEnv: null });
  });

  it.each(['development', 'staging'] as const)('accepts a non-production project for %s', (appEnv) => {
    expect(resolveRuntimeEnvironment(valid(appEnv))).toMatchObject({
      configured: true,
      appEnv,
      projectRef: stagingRef,
    });
  });

  it('accepts only the known production project for production', () => {
    expect(resolveRuntimeEnvironment(valid('production', PRODUCTION_SUPABASE_PROJECT_REF))).toMatchObject({
      configured: true,
      appEnv: 'production',
      projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
    });
  });

  it('rejects a partial configuration instead of guessing', () => {
    expect(() => resolveRuntimeEnvironment({ EXPO_PUBLIC_APP_ENV: 'staging' })).toThrow('incomplete_runtime_environment');
  });

  it('rejects an unknown application environment', () => {
    expect(() => resolveRuntimeEnvironment(valid('preview'))).toThrow('invalid_app_environment');
  });

  it('rejects malformed or non-Supabase URLs', () => {
    expect(() => resolveRuntimeEnvironment({ ...valid('staging'), EXPO_PUBLIC_SUPABASE_URL: 'http://example.invalid' }))
      .toThrow('invalid_supabase_url');
  });

  it('rejects the production project in development or staging', () => {
    expect(() => resolveRuntimeEnvironment(valid('staging', PRODUCTION_SUPABASE_PROJECT_REF)))
      .toThrow('production_project_for_non_production_runtime');
  });

  it('rejects a staging project in a production runtime', () => {
    expect(() => resolveRuntimeEnvironment(valid('production'))).toThrow('non_production_project_for_production_runtime');
  });

  it('rejects a missing publishable key in an otherwise configured runtime', () => {
    expect(() => resolveRuntimeEnvironment({ ...valid('staging'), EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ' ' }))
      .toThrow('incomplete_runtime_environment');
  });
});
