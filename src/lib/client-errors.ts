import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { withStorageLock } from '@/lib/storage-lock';
import { isDemoMode, supabase } from '@/lib/supabase';

type ErrorSource = 'render' | 'unhandled_js';
type Diagnostic = { id: string; createdAt: string; appVersion: string; platform: string;
  properties: ReturnType<typeof sanitiseClientError> };
const keyFor = (userId: string) => 'manager247.client_errors.v1.' + userId;

// Fixed categories only: exception messages can contain customer data.
function classifyError(message: string) {
  if (message.startsWith('Maximum update depth exceeded')) return 'REACT_UPDATE_DEPTH';
  if (message.startsWith('Too many re-renders.')) return 'REACT_RENDER_LOOP';
  if (message.startsWith('Attempted to navigate before mounting the Root Layout')) return 'ROUTER_NOT_MOUNTED';
  if (message.startsWith("Couldn't find a navigation object.")) return 'ROUTER_CONTEXT';
  if (message.startsWith('Expected the first route to be __root,')) return 'ROUTER_ROOT_STATE';
  if (message.startsWith('Text strings must be rendered within a <Text> component.')) return 'NATIVE_TEXT_CHILD';
  if (message.startsWith('Exception in HostFunction:')) return 'NATIVE_HOST_EXCEPTION';
  return 'UNCLASSIFIED';
}

function functionFrames(stack: string) {
  return stack.split('\n')
    .map((line) => line.match(/^\s*(?:at|in)\s+([A-Za-z_$][\w.$]{0,100})(?:\s|\(|$)/)?.[1])
    .filter((frame): frame is string => Boolean(frame)).slice(0, 8).join(' > ');
}

function javascriptFrames(error: Error) {
  // A multiline message can itself contain "at customerName (...)". Strip
  // the entire standard error header before accepting any function frames.
  const header = error.message ? error.name + ': ' + error.message : error.name;
  const stack = error.stack ?? '';
  if (!stack.startsWith(header + '\n') && !stack.startsWith(header + '\r\n')) return '';
  return functionFrames(stack.slice(header.length));
}

/** Send categories and function names only, without messages, arguments or URLs. */
export function sanitiseClientError(error: unknown, source: ErrorSource, fatal = false, componentStack = '') {
  const value = error instanceof Error ? error : new Error();
  const kind = ['Error', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'URIError'].includes(value.name) ? value.name : 'Error';
  const jsFrames = javascriptFrames(value);
  const frames = componentStack ? functionFrames(componentStack) : jsFrames;
  const build = Platform.OS === 'android' ? Constants.expoConfig?.android?.versionCode
    : Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber : undefined;
  const appBuild = /^\d{1,12}$/.test(String(build)) ? String(build) : 'unknown';
  let fingerprint = 2166136261;
  for (const character of kind + source + frames) fingerprint = Math.imul(fingerprint ^ character.charCodeAt(0), 16777619);
  return { source, kind, fatal, frames, jsFrames, code: classifyError(value.message), appBuild,
    fingerprint: (fingerprint >>> 0).toString(16) };
}

async function readErrors(userId: string): Promise<Diagnostic[]> {
  try { const raw = await AsyncStorage.getItem(keyFor(userId)); const rows = raw ? JSON.parse(raw) : []; return Array.isArray(rows) ? rows : []; }
  catch { return []; }
}

export function flushClientErrors(userId: string) {
  return withStorageLock('client-errors:' + userId, async () => {
    if (!supabase || isDemoMode || userId === 'demo') return;
    const rows = await readErrors(userId);
    if (!rows.length) return;
    const { error } = await supabase.from('product_events').insert(rows.map((row) => ({
      user_id: userId, event_name: 'client_error', app_version: row.appVersion, platform: row.platform,
      properties: row.properties, created_at: row.createdAt,
    })));
    if (!error) await AsyncStorage.removeItem(keyFor(userId));
  });
}

export async function reportClientError(error: unknown, source: ErrorSource, fatal = false, componentStack = '') {
  try {
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    const userId = data.session?.user.id;
    if (!userId) return;
    const row: Diagnostic = { id: Date.now() + '-' + Math.random().toString(36).slice(2), createdAt: new Date().toISOString(),
      appVersion: Constants.expoConfig?.version ?? 'unknown', platform: Platform.OS,
      properties: sanitiseClientError(error, source, fatal, componentStack) };
    await withStorageLock('client-errors:' + userId, async () => {
      const rows = await readErrors(userId);
      await AsyncStorage.setItem(keyFor(userId), JSON.stringify([...rows, row].slice(-30)));
    });
    await flushClientErrors(userId);
  } catch { /* Diagnostics must not cause another application failure. */ }
}

type ErrorHandler = (error: Error, fatal?: boolean) => void;
export function installClientErrorHandler() {
  const runtime = globalThis as typeof globalThis & { ErrorUtils?: { getGlobalHandler: () => ErrorHandler; setGlobalHandler: (handler: ErrorHandler) => void } };
  const utils = runtime.ErrorUtils;
  if (!utils) return () => undefined;
  const previous = utils.getGlobalHandler();
  const handler: ErrorHandler = (error, fatal) => { void reportClientError(error, 'unhandled_js', Boolean(fatal)); previous(error, fatal); };
  utils.setGlobalHandler(handler);
  return () => { if (utils.getGlobalHandler() === handler) utils.setGlobalHandler(previous); };
}
