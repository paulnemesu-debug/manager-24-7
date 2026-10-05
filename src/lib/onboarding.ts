/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const keyFor = (userId: string) => `manager247.onboarding.v1.${userId}`;

export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(keyFor(userId))) === 'done';
}

export async function completeOnboarding(userId: string): Promise<void> {
  await AsyncStorage.setItem(keyFor(userId), 'done');
}

