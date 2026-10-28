import type { IngredientDraft, RecipeComplianceDraft, RecipeDraft } from '@/types/recipe';

// The existing source-reference column persists this acknowledgement in cloud
// records as well as local drafts, without requiring a database migration.
export const SOURCE_REVIEW_MARKER = 'Manager24/7: ingredient quantities, units and purchase prices reviewed.';

export function requiresSourceReview(recipe: Pick<RecipeDraft, 'compliance' | 'ingredients'>): boolean {
  const value = recipe.compliance;
  const imported = typeof value?.sourceReviewRequired === 'boolean' || !!value?.templateId?.startsWith('foodcom-');
  if (!imported) return false;
  const acknowledged = value?.sourceReviewRequired === false
    || (value?.sourceReviewRequired === undefined && !!value?.sourceReference?.includes(SOURCE_REVIEW_MARKER));
  return !acknowledged || !canReviewSourceRecipe(recipe);
}

const MATERIAL_FIELDS = ['name', 'quantity', 'unit', 'purchasePrice', 'priceUnit', 'lossPercent', 'kind', 'catalogId', 'subRecipeId'] as const;

export function updateSourceRecipeIngredients(recipe: RecipeDraft, ingredients: IngredientDraft[]): RecipeDraft {
  const next = { ...recipe, ingredients };
  const compliance = recipe.compliance;
  if (!compliance || (compliance.sourceReviewRequired === undefined && !compliance.templateId?.startsWith('foodcom-'))) return next;
  const changed = ingredients.length !== recipe.ingredients.length || ingredients.some((ingredient) => {
    const previous = recipe.ingredients.find((row) => row.id === ingredient.id);
    return !previous || MATERIAL_FIELDS.some((key) => previous[key] !== ingredient[key]);
  });
  if (!changed) return next;
  return { ...next, compliance: { ...compliance,
    ...normalizeSourceReview({ sourceReviewRequired: true }, compliance.sourceReference, compliance.templateId) } };
}

export function canReviewSourceRecipe(recipe: Pick<RecipeDraft, 'ingredients'>): boolean {
  const ingredients = recipe.ingredients.filter((ingredient) => ingredient.name.trim());
  return ingredients.length > 0 && ingredients.every((ingredient) => Number.isFinite(ingredient.quantity) && ingredient.quantity > 0
    && Number.isFinite(ingredient.purchasePrice) && ingredient.purchasePrice > 0
    && (ingredient.priceUnit === 'kg' ? ['g', 'kg'].includes(ingredient.unit)
      : ingredient.priceUnit === 'l' ? ['ml', 'l'].includes(ingredient.unit) : ingredient.unit === 'buc'));
}

export function normalizeSourceReview(input: Record<string, unknown>, reference: string | null, templateId: string | null): Pick<RecipeComplianceDraft, 'sourceReviewRequired' | 'sourceReference'> {
  if (typeof input.sourceReviewRequired !== 'boolean' && !templateId?.startsWith('foodcom-')) return { sourceReference: reference };
  const pending = typeof input.sourceReviewRequired === 'boolean' ? input.sourceReviewRequired : !reference?.includes(SOURCE_REVIEW_MARKER);
  const cleanReference = reference?.replace(SOURCE_REVIEW_MARKER, '').trim().replace(/\s*·\s*$/, '') || null;
  return { sourceReviewRequired: pending, sourceReference: pending ? cleanReference : [cleanReference, SOURCE_REVIEW_MARKER].filter(Boolean).join(' · ') };
}
