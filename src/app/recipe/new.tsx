/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { useLocalSearchParams } from 'expo-router';

import { RecipeEditor } from '@/components/recipe-editor';
import { usePreferences } from '@/contexts/preferences-context';
import { draftFromM1Template, findM1Template } from '@/lib/recipe-templates';

export default function NewRecipeScreen() {
  const { template: templateId, draftSlot } = useLocalSearchParams<{ template?: string; draftSlot?: string }>();
  const { defaultVatPercent } = usePreferences();
  const template = findM1Template(templateId);
  const initialDraft = template ? draftFromM1Template(template, defaultVatPercent) : undefined;
  return <RecipeEditor initialDraft={initialDraft} draftSlot={draftSlot} />;
}
