/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';

const queueKey = 'manager247.telemetry.queue.v1';
type Event = { eventName: string; properties: Record<string, string | number | boolean>; createdAt: string };

async function queue(event: Event) {
  const raw = await AsyncStorage.getItem(queueKey);
  let events: Event[] = [];
  try { events = raw ? JSON.parse(raw) : []; } catch { events = []; }
  await AsyncStorage.setItem(queueKey, JSON.stringify([...events, event].slice(-100)));
}

export async function trackEvent(userId: string | null, eventName: string, properties: Event['properties'] = {}) {
  const event = { eventName, properties, createdAt: new Date().toISOString() };
  if (!userId || userId === 'demo' || isDemoMode || !isSupabaseConfigured || !supabase) {
    await queue(event);
    return;
  }
  const { error } = await supabase.from('product_events').insert({
    user_id: userId,
    event_name: eventName,
    app_version: Constants.expoConfig?.version ?? 'unknown',
    platform: Platform.OS,
    properties,
    created_at: event.createdAt,
  });
  if (error) await queue(event);
}
