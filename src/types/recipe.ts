/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { Allergen } from '@/constants/allergens';
import type { RecipeCategory } from '@/constants/categories';

export type QuantityUnit = 'g' | 'kg' | 'ml' | 'l' | 'buc';
export type PriceUnit = 'kg' | 'l' | 'buc';
export type CookingMethod =
  | 'none'
  | 'boil_meat_veg'
  | 'steam'
  | 'oven'
  | 'grill'
  | 'fry'
  | 'saute'
  | 'reduction'
  | 'custom';

/** Un rând din rețetă este fie un produs cumpărat, fie un semipreparat propriu. */
export type IngredientKind = 'product' | 'sub_recipe';

export type NutritionBasis = '100g' | '100ml' | 'unit';
export type NutritionSource =
  | 'product_label'
  | 'laboratory'
  | 'supplier'
  | 'accepted_database'
  | 'imported_workbook'
  | 'estimated'
  | 'unknown';

/** Valori declarabile pentru baza aleasă. `null` înseamnă necunoscut, nu zero. */
export interface NutritionValues {
  energyKj: number | null;
  energyKcal: number | null;
  fat: number | null;
  saturates: number | null;
  carbohydrates: number | null;
  sugars: number | null;
  fibre: number | null;
  protein: number | null;
  salt: number | null;
}

export interface IngredientNutrition {
  basis: NutritionBasis;
  values: NutritionValues;
  source: NutritionSource;
  sourceReference: string | null;
  /** Devine true numai după verificarea etichetei, laboratorului sau bazei citate. */
  confirmed: boolean;
  automaticMatch?: { foodCode: string; matchedName: string };
  automaticDisabled?: boolean;
  /** Original censored values; numerical estimates must stay visibly qualified. */
  qualifiers?: Partial<Record<keyof NutritionValues, string>>;
  /** Mass conversions supplied by the operator, never guessed from an ingredient name. */
  gramsPerMl?: number | null;
  gramsPerUnit?: number | null;
}

export interface RecipeComplianceDraft {
  /** Greutatea preparatului finit, necesară pentru calculul legal per 100 g. */
  finalWeightGrams: number | null;
  /** Diferențiază o cântărire reală de suma orientativă a ingredientelor. */
  finalWeightMeasured: boolean;
  isDefrosted: boolean;
  nutritionNotes: string | null;
  templateId: string | null;
  sourceReference: string | null;
}

export interface IngredientDraft {
  id: string;
  kind: IngredientKind;
  catalogId?: string | null;
  subRecipeId?: string | null;
  name: string;
  quantity: number;
  unit: QuantityUnit;
  purchasePrice: number;
  priceUnit: PriceUnit;
  /** Date opționale din factură; prețul unitar rămâne sursa calculului. */
  packageQuantity?: number | null;
  packagePrice?: number | null;
  lossPercent: number;
  allergens: Allergen[];
  allergensConfirmed?: boolean;
  additives?: string[];
  nutrition?: IngredientNutrition;
}

export interface RecipeTotals {
  totalCost: number;
  portionCost: number;
  effectiveServings: number;
  cookingYieldPercent: number;
  salePriceNet: number;
  foodCostPercent: number | null;
  contributionMargin: number | null;
  contributionMarginPercent: number | null;
  recommendedPriceNet: number;
  recommendedPriceGross: number;
}

export interface Recipe {
  id: string;
  title: string;
  category: RecipeCategory | null;
  servings: number;
  cookingMethod: CookingMethod;
  cookingLossPercent: number;
  salePriceGross: number;
  vatPercent: number;
  targetFoodCost: number;
  /** Marcată de utilizator ca semipreparat, deci disponibilă ca ingredient în alte rețete. */
  isSubRecipe: boolean;
  /** Randamentul unui semipreparat, exprimat în unitatea de preț (kg, l sau buc). */
  yieldQuantity: number;
  yieldUnit: PriceUnit;
  ingredients: IngredientDraft[];
  /** Alergeni adăugați manual, peste cei moșteniți din ingrediente. */
  manualAllergens: Allergen[];
  compliance?: RecipeComplianceDraft;
  /** Calea privată din Supabase Storage și URL-ul semnat, temporar. */
  photoPath?: string | null;
  photoUrl?: string | null;
  /** Lista finală, folosită în interfață și în fișa exportată. */
  allergens: Allergen[];
  totals: RecipeTotals;
  createdAt: string;
  updatedAt: string;
  /** Last acknowledged cloud version, retained while local changes wait for sync. */
  serverUpdatedAt?: string;
}

export interface RecipeDraft {
  id?: string;
  expectedUpdatedAt?: string;
  title: string;
  category: RecipeCategory | null;
  servings: number;
  cookingMethod: CookingMethod;
  cookingLossPercent: number;
  salePriceGross: number;
  vatPercent: number;
  targetFoodCost: number;
  isSubRecipe: boolean;
  yieldQuantity: number;
  yieldUnit: PriceUnit;
  ingredients: IngredientDraft[];
  /** Alergeni adăugați manual, peste cei moșteniți din ingrediente. */
  manualAllergens: Allergen[];
  compliance?: RecipeComplianceDraft;
  /** URI local ales de utilizator sau URL-ul semnat al fotografiei existente. */
  photoUri?: string | null;
  photoPath?: string | null;
  /** Explicit intent prevents a failed signed URL from deleting an existing photo. */
  photoAction?: 'keep' | 'replace' | 'remove';
}

export interface SupplierOffer {
  id: string;
  supplierName: string;
  unitPrice: number;
  priceUnit: PriceUnit;
  packageQuantity: number | null;
  packagePrice: number | null;
  source: string | null;
  sourceDate: string | null;
  isActive: boolean;
  updatedAt?: string;
}

export type SupplierOfferDraft = Omit<SupplierOffer, 'updatedAt'>;

export type CatalogPriceUpdate = {
  id: string;
  purchasePrice: number;
  supplier?: string | null;
  source?: string | null;
  sourceDate?: string | null;
};

export interface CatalogIngredient {
  id: string;
  name: string;
  purchasePrice: number;
  priceUnit: PriceUnit;
  packageQuantity: number | null;
  packagePrice: number | null;
  defaultLossPercent: number;
  supplier: string | null;
  priceSource?: string | null;
  priceSourceDate?: string | null;
  offers?: SupplierOffer[];
  notes: string | null;
  allergens: Allergen[];
  allergensConfirmed?: boolean;
  additives?: string[];
  nutrition?: IngredientNutrition;
  active: boolean;
  updatedAt: string;
}

export interface CatalogIngredientDraft {
  id?: string;
  name: string;
  purchasePrice: number;
  priceUnit: PriceUnit;
  packageQuantity: number | null;
  packagePrice: number | null;
  defaultLossPercent: number;
  supplier: string | null;
  priceSource?: string | null;
  priceSourceDate?: string | null;
  offers?: SupplierOfferDraft[];
  notes: string | null;
  allergens: Allergen[];
  allergensConfirmed?: boolean;
  additives?: string[];
  nutrition?: IngredientNutrition;
  active: boolean;
}

export type FoodCostStatus = 'healthy' | 'watch' | 'critical' | 'incomplete';
