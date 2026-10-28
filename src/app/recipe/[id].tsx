/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Redirect, useLocalSearchParams } from 'expo-router';

import { RecipeEditor } from '@/components/recipe-editor';
import { LoadingState, Screen } from '@/components/ui';
import { useI18n } from '@/contexts/locale-context';
import { useWorkspace } from '@/contexts/workspace-context';
import { useMounted } from '@/hooks/use-mounted';

export default function EditRecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { findRecipe, isLoading } = useWorkspace();
  const { t } = useI18n();
  const mounted = useMounted();

  // Rețeta se caută abia după ce lista este încărcată; altfel o adresă
  // deschisă direct sau o reîmprospătare a paginii ar trimite înapoi în listă.
  if (!mounted || isLoading) {
    return <Screen scroll={false}><LoadingState label={t('recipes.loading')} /></Screen>;
  }

  const recipe = findRecipe(id);
  if (!recipe) return <Redirect href="/(app)/recipes" />;
  return <RecipeEditor recipe={recipe} />;
}
