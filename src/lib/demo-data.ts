/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { Allergen } from '@/constants/allergens';
import {
  calculateRecipeTotals,
  calculateSubRecipeUnitCost,
  resolveRecipeAllergens,
} from '@/lib/calculations';
import type {
  IngredientDraft,
  PriceUnit,
  QuantityUnit,
  Recipe,
  RecipeDraft,
} from '@/types/recipe';

const now = new Date().toISOString();

type SeedIngredient = {
  id: string;
  name: string;
  quantity: number;
  unit: QuantityUnit;
  purchasePrice: number;
  priceUnit: PriceUnit;
  lossPercent?: number;
  allergens?: Allergen[];
};

function product(seed: SeedIngredient): IngredientDraft {
  return {
    id: seed.id,
    kind: 'product',
    catalogId: null,
    subRecipeId: null,
    name: seed.name,
    quantity: seed.quantity,
    unit: seed.unit,
    purchasePrice: seed.purchasePrice,
    priceUnit: seed.priceUnit,
    lossPercent: seed.lossPercent ?? 0,
    allergens: seed.allergens ?? [],
  };
}

function build(
  seed: RecipeDraft & { id: string },
): Recipe {
  const allergens = resolveRecipeAllergens(seed.ingredients, seed.manualAllergens);
  return {
    ...seed,
    id: seed.id,
    allergens,
    totals: calculateRecipeTotals(seed),
    createdAt: now,
    updatedAt: now,
  };
}

const sauce = build({
  id: 'demo-sos',
  title: 'Sos casei PARADIM',
  category: 'side',
  servings: 20,
  cookingMethod: 'none',
  cookingLossPercent: 0,
  salePriceGross: 0,
  vatPercent: 11,
  targetFoodCost: 30,
  isSubRecipe: true,
  yieldQuantity: 2,
  yieldUnit: 'kg',
  manualAllergens: [],
  ingredients: [
    product({ id: 'sos1', name: 'Roșii pasate', quantity: 1.6, unit: 'kg', purchasePrice: 8.5, priceUnit: 'kg' }),
    product({ id: 'sos2', name: 'Ceapă', quantity: 0.5, unit: 'kg', purchasePrice: 4.2, priceUnit: 'kg', lossPercent: 15 }),
    product({ id: 'sos3', name: 'Muștar Dijon', quantity: 0.12, unit: 'kg', purchasePrice: 24, priceUnit: 'kg', allergens: ['mustard'] }),
    product({ id: 'sos4', name: 'Unt', quantity: 0.15, unit: 'kg', purchasePrice: 46, priceUnit: 'kg', allergens: ['milk'] }),
  ],
});

const sauceInBurger: IngredientDraft = {
  id: 'b5',
  kind: 'sub_recipe',
  catalogId: null,
  subRecipeId: sauce.id,
  name: sauce.title,
  quantity: 400,
  unit: 'g',
  purchasePrice: calculateSubRecipeUnitCost(sauce),
  priceUnit: 'kg',
  lossPercent: 0,
  allergens: sauce.allergens,
};

const burger = build({
  id: 'demo-burger',
  title: 'Burger PARADIM',
  category: 'main',
  servings: 10,
  cookingMethod: 'none',
  cookingLossPercent: 0,
  salePriceGross: 42,
  vatPercent: 11,
  targetFoodCost: 30,
  isSubRecipe: false,
  yieldQuantity: 1,
  yieldUnit: 'kg',
  manualAllergens: [],
  ingredients: [
    product({ id: 'b1', name: 'Carne vită', quantity: 1.8, unit: 'kg', purchasePrice: 42, priceUnit: 'kg', lossPercent: 5 }),
    product({ id: 'b2', name: 'Chiflă brioche', quantity: 10, unit: 'buc', purchasePrice: 2.1, priceUnit: 'buc', allergens: ['gluten', 'eggs', 'sesame'] }),
    product({ id: 'b3', name: 'Cheddar', quantity: 0.35, unit: 'kg', purchasePrice: 39, priceUnit: 'kg', allergens: ['milk'] }),
    sauceInBurger,
  ],
});

const pasta = build({
  id: 'demo-pasta',
  title: 'Paste cu pui',
  category: 'main',
  servings: 10,
  cookingMethod: 'none',
  cookingLossPercent: 0,
  salePriceGross: 38,
  vatPercent: 11,
  targetFoodCost: 30,
  isSubRecipe: false,
  yieldQuantity: 1,
  yieldUnit: 'kg',
  manualAllergens: [],
  ingredients: [
    product({ id: 'p1', name: 'Paste', quantity: 1.1, unit: 'kg', purchasePrice: 12, priceUnit: 'kg', allergens: ['gluten'] }),
    product({ id: 'p2', name: 'Piept de pui', quantity: 1.5, unit: 'kg', purchasePrice: 29, priceUnit: 'kg', lossPercent: 12 }),
    product({ id: 'p3', name: 'Smântână', quantity: 0.8, unit: 'l', purchasePrice: 17, priceUnit: 'l', allergens: ['milk'] }),
  ],
});

const soup = build({
  id: 'demo-soup',
  title: 'Supă cremă de legume',
  category: 'soup',
  servings: 12,
  cookingMethod: 'none',
  cookingLossPercent: 0,
  salePriceGross: 24,
  vatPercent: 11,
  targetFoodCost: 28,
  isSubRecipe: false,
  yieldQuantity: 1,
  yieldUnit: 'kg',
  manualAllergens: [],
  ingredients: [
    product({ id: 's1', name: 'Legume mix', quantity: 3.2, unit: 'kg', purchasePrice: 9.5, priceUnit: 'kg', lossPercent: 18, allergens: ['celery'] }),
    product({ id: 's2', name: 'Smântână', quantity: 0.5, unit: 'l', purchasePrice: 17, priceUnit: 'l', allergens: ['milk'] }),
    product({ id: 's3', name: 'Crutoane', quantity: 12, unit: 'buc', purchasePrice: 0.55, priceUnit: 'buc', allergens: ['gluten'] }),
  ],
});

export const demoRecipes: Recipe[] = [burger, pasta, soup, sauce];
