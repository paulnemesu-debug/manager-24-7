/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';

import { RecipeEditor } from '@/components/recipe-editor';
import { Body, Card, Screen, Title } from '@/components/ui';
import { Brand } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { draftFromFoodcom } from '@/lib/foodcom-catalog';
import { foodcomCopy, foodcomError } from '@/lib/foodcom-catalog-copy';
import { foodcomReader } from '@/lib/foodcom-catalog-store';
import { draftFromM1Template, findM1Template } from '@/lib/recipe-templates';
import type { RecipeDraft } from '@/types/recipe';

export default function NewRecipeScreen() {
  const { template: templateId, draftSlot, foodcom } = useLocalSearchParams<{ template?: string; draftSlot?: string; foodcom?: string }>();
  const router = useRouter();
  const { locale } = useI18n();
  const { defaultVatPercent } = usePreferences();
  const [foodcomDraft, setFoodcomDraft] = useState<RecipeDraft | null>(null);
  const [sourceError, setSourceError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  const copy = foodcomCopy(locale);
  useEffect(() => {
    if (!foodcom) return;
    const controller = new AbortController();
    setFoodcomDraft(null); setSourceError(null);
    const id = Number(foodcom);
    if (!Number.isSafeInteger(id) || id <= 0) { setSourceError(new Error('FOODCOM_INVALID_RECIPE')); return; }
    foodcomReader.getDetail(id, controller.signal).then((recipe) => {
      if (controller.signal.aborted) return;
      if (!recipe) { setSourceError(new Error('FOODCOM_INVALID_RECIPE')); return; }
      setFoodcomDraft(draftFromFoodcom(recipe, defaultVatPercent, locale));
    }).catch((error) => { if (!controller.signal.aborted) setSourceError(error); });
    return () => controller.abort();
  }, [foodcom, defaultVatPercent, locale, retry]);
  if (foodcom) {
    if (foodcomDraft) return <RecipeEditor key={`foodcom-${foodcom}`} initialDraft={foodcomDraft} draftSlot={draftSlot} />;
    return <Screen><Title>{copy.title}</Title><Card>
      {sourceError ? <><Body>{foodcomError(sourceError, locale)}</Body>
        <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)} style={{ padding: 14 }}><Text style={{ color: Brand.navy }}>{copy.retry}</Text></Pressable></>
        : <ActivityIndicator accessibilityLabel={copy.loading} color={Brand.gold} />}
      <Pressable accessibilityRole="button" onPress={() => router.replace('/tools/recipe-catalogue')} style={{ padding: 14 }}><Text style={{ color: Brand.navy }}>{copy.open}</Text></Pressable>
    </Card></Screen>;
  }
  const template = findM1Template(templateId);
  const initialDraft = template ? draftFromM1Template(template, defaultVatPercent) : undefined;
  return <RecipeEditor initialDraft={initialDraft} draftSlot={draftSlot} />;
}
