import * as Sentry from '@sentry/react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { sanitiseCrashEvent } from '@/lib/crash-privacy';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
export const crashReportingConfigured = Boolean(dsn);
const build = Platform.OS === 'android' ? Constants.expoConfig?.android?.versionCode
  : Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber : undefined;
const packageName = Platform.OS === 'ios'
  ? Constants.expoConfig?.ios?.bundleIdentifier ?? 'ro.paradim.manager247'
  : Constants.expoConfig?.android?.package ?? 'ro.paradim.professionalfoodcost';

// Module initialization runs before fonts, authentication and the first screen.
Sentry.init({
  dsn, enabled: crashReportingConfigured,
  enableNative: Constants.executionEnvironment !== ExecutionEnvironment.StoreClient,
  enableNativeCrashHandling: true, enableNdk: true,
  sendDefaultPii: false, attachScreenshot: false, attachViewHierarchy: false,
  enableCaptureFailedRequests: false, maxBreadcrumbs: 0,
  enableLogs: false, tracesSampleRate: 0,
  replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0,
  environment: __DEV__ ? 'development' : 'production',
  // Match the native build's release so uploaded maps and runtime events agree.
  release: `${packageName}@${Constants.expoConfig?.version ?? 'unknown'}${build == null ? '' : `+${build}`}`,
  dist: String(build ?? (Platform.OS === 'web' ? 'web' : 'unknown')),
  beforeSend: sanitiseCrashEvent,
});

export const withCrashReporting = Sentry.wrap;
export function captureRenderCrash(error: Error) {
  if (crashReportingConfigured) Sentry.captureException(error, { tags: { source: 'render' } });
}
