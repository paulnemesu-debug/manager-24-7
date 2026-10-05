/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { ToolHeader } from '@/components/tool-header';
import { WeeklyManagerCard } from '@/components/weekly-manager-card';
import { ListSkeleton, Screen } from '@/components/ui';
import { useI18n } from '@/contexts/locale-context';
import { useWorkspace } from '@/contexts/workspace-context';

export default function AlertsScreen() {
  const { locale } = useI18n();
  const { recipes, isLoading } = useWorkspace();

  if (isLoading) return <Screen scroll={false}><ListSkeleton rows={3} /></Screen>;

  return (
    <Screen>
      <ToolHeader
        title={locale === 'ro' ? 'Alerte și raport săptămânal' : 'Alerts and weekly report'}
        subtitle={locale === 'ro'
          ? 'Creșteri de preț, impact în rețete și raportul de trimis managerului.'
          : 'Price increases, recipe impact and the manager report ready to share.'}
      />
      <WeeklyManagerCard recipes={recipes.filter((recipe) => !recipe.isSubRecipe)} />
    </Screen>
  );
}
