/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 */

import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  resolveRuntimeEnvironment,
} from '@/lib/runtime-environment';

const developmentRef = 'abcdefghijklmnopqrst';
const valid = (appEnv: string, ref = STAGING_SUPABASE_PROJECT_REF) => ({
  EXPO_PUBLIC_APP_ENV: appEnv,
  EXPO_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_qa_only',
});

describe('runtime environment isolation', () => {
  it('allows a completely unconfigured test/runtime to remain disconnected', () => {
    expect(resolveRuntimeEnvironment({})).toEqual({ configured: false, appEnv: null });
  });

  it('accepts a separate non-production project for development', () => {
    expect(resolveRuntimeEnvironment(valid('development', developmentRef))).toMatchObject({
      configured: true,
      appEnv: 'development',
      projectRef: developmentRef,
    });
  });

  it('accepts only the known staging project for staging', () => {
    expect(resolveRuntimeEnvironment(valid('staging', STAGING_SUPABASE_PROJECT_REF))).toMatchObject({
      configured: true,
      appEnv: 'staging',
      projectRef: STAGING_SUPABASE_PROJECT_REF,
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
    expect(() => resolveRuntimeEnvironment(valid('production', STAGING_SUPABASE_PROJECT_REF)))
      .toThrow('non_production_project_for_production_runtime');
  });

  it('rejects an arbitrary non-production project in staging', () => {
    expect(() => resolveRuntimeEnvironment(valid('staging', developmentRef)))
      .toThrow('non_staging_project_for_staging_runtime');
  });

  it('rejects a missing publishable key in an otherwise configured runtime', () => {
    expect(() => resolveRuntimeEnvironment({ ...valid('staging'), EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ' ' }))
      .toThrow('incomplete_runtime_environment');
  });
});
