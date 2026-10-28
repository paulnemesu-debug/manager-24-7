import type { ErrorEvent } from '@sentry/react-native';

/** Only error types, code frames and non-personal runtime identifiers leave JS. */
export function sanitiseCrashEvent(event: ErrorEvent): ErrorEvent {
  return {
    type: event.type,
    event_id: event.event_id, timestamp: event.timestamp, platform: event.platform,
    level: event.level, release: event.release, dist: event.dist, environment: event.environment,
    debug_meta: event.debug_meta, sdk: event.sdk,
    exception: event.exception ? { values: event.exception.values?.map((exception) => ({
      type: /^[\w.]{1,80}$/.test(exception.type ?? '') ? exception.type : 'Error',
      value: /^[A-Z][A-Z0-9_]{3,79}$/.test(exception.value ?? '') ? exception.value : '[message removed]',
      mechanism: exception.mechanism ? { type: exception.mechanism.type, handled: exception.mechanism.handled } : undefined,
      stacktrace: exception.stacktrace ? { frames: exception.stacktrace.frames?.slice(-60).map((frame) => ({
        filename: /^app:\/\//.test(frame.filename ?? '') ? frame.filename?.split(/[?#]/)[0] : frame.filename?.split(/[?#]/)[0]?.split(/[/\\]/).pop(),
        function: frame.function?.replace(/[^\w.$<> ]/g, '').slice(0, 120),
        lineno: frame.lineno, colno: frame.colno, in_app: frame.in_app,
      })) } : undefined,
    })) } : undefined,
    tags: event.tags?.source === 'render' ? { source: 'render' } : undefined,
    contexts: {
      app: event.contexts?.app ? { app_identifier: event.contexts.app.app_identifier,
        app_version: event.contexts.app.app_version, app_build: event.contexts.app.app_build } : undefined,
      os: event.contexts?.os ? { name: event.contexts.os.name, version: event.contexts.os.version } : undefined,
      device: event.contexts?.device ? { manufacturer: event.contexts.device.manufacturer,
        model: event.contexts.device.model, arch: event.contexts.device.arch } : undefined,
    },
  };
}
