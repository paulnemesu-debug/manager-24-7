/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Redirect, useLocalSearchParams } from 'expo-router';

import { IngredientEditor } from '@/components/ingredient-editor';
import { LoadingState, Screen } from '@/components/ui';
import { useI18n } from '@/contexts/locale-context';
import { useWorkspace } from '@/contexts/workspace-context';
import { useMounted } from '@/hooks/use-mounted';

export default function EditIngredientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { catalog, isLoading } = useWorkspace();
  const { t } = useI18n();
  const mounted = useMounted();

  if (!mounted || isLoading) {
    return <Screen scroll={false}><LoadingState label={t('ingredients.loading')} /></Screen>;
  }

  const entry = catalog.find((item) => item.id === id);
  if (!entry) return <Redirect href="/(app)/ingredients" />;
  return <IngredientEditor entry={entry} />;
}
