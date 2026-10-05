import { M1_RECIPE_TEMPLATES, type M1RecipeTemplate } from '@/constants/m1-recipe-templates';
import { M2_M5_RECIPE_TEMPLATES } from '@/constants/m2-m5-recipe-templates';

export type RecipeTemplate = M1RecipeTemplate;
export const RECIPE_TEMPLATES: readonly RecipeTemplate[] = [...M1_RECIPE_TEMPLATES, ...M2_M5_RECIPE_TEMPLATES];

