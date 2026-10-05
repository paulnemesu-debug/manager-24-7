/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { RecipeCategory } from '@/constants/categories';

/** Modele extrase fidel din M1.xlsx. Cantitățile sunt cele din coloana cant/porție. */
export type M1RecipeTemplate = {
  id: string;
  title: string;
  category: RecipeCategory;
  sourceCategory: string | null;
  sourceSheet: string;
  sourceHeaderRow: number;
  energyKcalPerPortion: number;
  ingredients: {
    name: string;
    quantityGrams: number;
    purchasePricePerKg: number;
    energyKcalPer100g: number | null;
    nutritionSourceRow: number | null;
  }[];
};

export const M1_RECIPE_TEMPLATES: readonly M1RecipeTemplate[] = [
  {
    "id": "m1-001",
    "title": "CIORBA DE ROSII CU TAITEI DE OREZ",
    "category": "soup",
    "sourceCategory": "C1",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 4,
    "energyKcalPerPortion": 115.46,
    "ingredients": [
      {
        "name": "rosii",
        "quantityGrams": 40.0,
        "purchasePricePerKg": 14.8,
        "energyKcalPer100g": 18.0,
        "nutritionSourceRow": 308
      },
      {
        "name": "ceapa",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 4.5,
        "energyKcalPer100g": 42.0,
        "nutritionSourceRow": 92
      },
      {
        "name": "morcov",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 2.767,
        "energyKcalPer100g": 41.0,
        "nutritionSourceRow": 216
      },
      {
        "name": "telina",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 6.2,
        "energyKcalPer100g": 16.0,
        "nutritionSourceRow": 375
      },
      {
        "name": "ardei gras bianca",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 7.5,
        "energyKcalPer100g": 31.0,
        "nutritionSourceRow": 20
      },
      {
        "name": "taitei orez",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 12.63,
        "energyKcalPer100g": 365.0,
        "nutritionSourceRow": 370
      },
      {
        "name": "ulei",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "patrunjel",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 13.75,
        "energyKcalPer100g": 36.0,
        "nutritionSourceRow": 260
      }
    ]
  },
  {
    "id": "m1-002",
    "title": "CIORBA DE SALATA VERDE CU AFUMATURA",
    "category": "soup",
    "sourceCategory": "C2",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 19,
    "energyKcalPerPortion": 358.98,
    "ingredients": [
      {
        "name": "salata verde",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 14.2,
        "energyKcalPer100g": 17.0,
        "nutritionSourceRow": 323
      },
      {
        "name": "ciolan porc",
        "quantityGrams": 60.0,
        "purchasePricePerKg": 28.31,
        "energyKcalPer100g": 337.0,
        "nutritionSourceRow": 107
      },
      {
        "name": "ceapa",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 4.5,
        "energyKcalPer100g": 42.0,
        "nutritionSourceRow": 92
      },
      {
        "name": "morcov",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 2.767,
        "energyKcalPer100g": 41.0,
        "nutritionSourceRow": 216
      },
      {
        "name": "telina",
        "quantityGrams": 15.0,
        "purchasePricePerKg": 6.2,
        "energyKcalPer100g": 16.0,
        "nutritionSourceRow": 375
      },
      {
        "name": "ardei gras bianca",
        "quantityGrams": 15.0,
        "purchasePricePerKg": 7.5,
        "energyKcalPer100g": 31.0,
        "nutritionSourceRow": 20
      },
      {
        "name": "rosii decojite",
        "quantityGrams": 15.0,
        "purchasePricePerKg": 7.104,
        "energyKcalPer100g": 30.0,
        "nutritionSourceRow": 311
      },
      {
        "name": "orez",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 8.79,
        "energyKcalPer100g": 361.0,
        "nutritionSourceRow": 238
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "leustean",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 2.5,
        "energyKcalPer100g": 37.0,
        "nutritionSourceRow": 192
      },
      {
        "name": "ulei",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      }
    ]
  },
  {
    "id": "m1-003",
    "title": "CIORBA RADAUTEANA DE PUI",
    "category": "soup",
    "sourceCategory": "C3",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 37,
    "energyKcalPerPortion": 276.68,
    "ingredients": [
      {
        "name": "pulpa pui intreg",
        "quantityGrams": 80.0,
        "purchasePricePerKg": 15.39,
        "energyKcalPer100g": 159.0,
        "nutritionSourceRow": 296
      },
      {
        "name": "ceapa",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 4.5,
        "energyKcalPer100g": 42.0,
        "nutritionSourceRow": 92
      },
      {
        "name": "morcov",
        "quantityGrams": 25.0,
        "purchasePricePerKg": 2.767,
        "energyKcalPer100g": 41.0,
        "nutritionSourceRow": 216
      },
      {
        "name": "telina",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 6.2,
        "energyKcalPer100g": 16.0,
        "nutritionSourceRow": 375
      },
      {
        "name": "galbenus",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 32.966,
        "energyKcalPer100g": 321.7,
        "nutritionSourceRow": 170
      },
      {
        "name": "smantana",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 13.528,
        "energyKcalPer100g": 216.0,
        "nutritionSourceRow": 339
      },
      {
        "name": "otet",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 2.71,
        "energyKcalPer100g": 18.0,
        "nutritionSourceRow": 242
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "patrunjel",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 13.75,
        "energyKcalPer100g": 36.0,
        "nutritionSourceRow": 260
      },
      {
        "name": "ulei",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      }
    ]
  },
  {
    "id": "m1-004",
    "title": "BARCUTE DE VINETE CU CARNE DE PUI CU MOZZARELLA",
    "category": "main",
    "sourceCategory": "FP+G",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 54,
    "energyKcalPerPortion": 398.3,
    "ingredients": [
      {
        "name": "vinete",
        "quantityGrams": 250.0,
        "purchasePricePerKg": 5.5,
        "energyKcalPer100g": 24.0,
        "nutritionSourceRow": 399
      },
      {
        "name": "carne pui tocata",
        "quantityGrams": 120.0,
        "purchasePricePerKg": 14.09,
        "energyKcalPer100g": 172.0,
        "nutritionSourceRow": 75
      },
      {
        "name": "ceapa",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 4.5,
        "energyKcalPer100g": 42.0,
        "nutritionSourceRow": 92
      },
      {
        "name": "morcov",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 2.767,
        "energyKcalPer100g": 41.0,
        "nutritionSourceRow": 216
      },
      {
        "name": "ardei capia",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 9.2,
        "energyKcalPer100g": 26.0,
        "nutritionSourceRow": 16
      },
      {
        "name": "pasta tomate",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 13.73882,
        "energyKcalPer100g": 85.0,
        "nutritionSourceRow": 258
      },
      {
        "name": "boia",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 42.56,
        "energyKcalPer100g": 232.0,
        "nutritionSourceRow": 38
      },
      {
        "name": "ulei",
        "quantityGrams": 1.5,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "mozarella",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 32.5,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 220
      },
      {
        "name": "patrunjel",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 13.75,
        "energyKcalPer100g": 36.0,
        "nutritionSourceRow": 260
      }
    ]
  },
  {
    "id": "m1-005",
    "title": "CHIFTELUTE DIN CARNE DE PORC MARINATE(gatite pe cuptor)",
    "category": "main",
    "sourceCategory": "FP",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 72,
    "energyKcalPerPortion": 128.74,
    "ingredients": [
      {
        "name": "spata porc",
        "quantityGrams": 150.0,
        "purchasePricePerKg": 21.9,
        "energyKcalPer100g": null,
        "nutritionSourceRow": 411
      },
      {
        "name": "ceapa",
        "quantityGrams": 15.0,
        "purchasePricePerKg": 4.5,
        "energyKcalPer100g": 42.0,
        "nutritionSourceRow": 92
      },
      {
        "name": "usturoi",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 11.01,
        "energyKcalPer100g": 149.0,
        "nutritionSourceRow": 389
      },
      {
        "name": "pesmet",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 11.34,
        "energyKcalPer100g": 395.0,
        "nutritionSourceRow": 265
      },
      {
        "name": "ou melange",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 21.122,
        "energyKcalPer100g": 155.0,
        "nutritionSourceRow": 249
      },
      {
        "name": "sare",
        "quantityGrams": 3.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "marar",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 12.5,
        "energyKcalPer100g": 305.0,
        "nutritionSourceRow": 199
      },
      {
        "name": "patrunjel",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 13.75,
        "energyKcalPer100g": 36.0,
        "nutritionSourceRow": 260
      },
      {
        "name": "pasta tomate",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 13.73882,
        "energyKcalPer100g": 85.0,
        "nutritionSourceRow": 258
      },
      {
        "name": "foi dafin",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 41.75,
        "energyKcalPer100g": 313.0,
        "nutritionSourceRow": 160
      },
      {
        "name": "faina",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 5.04,
        "energyKcalPer100g": 364.0,
        "nutritionSourceRow": 147
      }
    ]
  },
  {
    "id": "m1-006",
    "title": "TIGAIE DE PUI CU LEGUME",
    "category": "main",
    "sourceCategory": "FP",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 90,
    "energyKcalPerPortion": 369.11,
    "ingredients": [
      {
        "name": "pulpa pui dez",
        "quantityGrams": 180.0,
        "purchasePricePerKg": 23.1,
        "energyKcalPer100g": 163.0,
        "nutritionSourceRow": 295
      },
      {
        "name": "ceapa",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 4.5,
        "energyKcalPer100g": 42.0,
        "nutritionSourceRow": 92
      },
      {
        "name": "morcov",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 2.767,
        "energyKcalPer100g": 41.0,
        "nutritionSourceRow": 216
      },
      {
        "name": "ardei capia",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 9.2,
        "energyKcalPer100g": 26.0,
        "nutritionSourceRow": 16
      },
      {
        "name": "ardei gras bianca",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 7.5,
        "energyKcalPer100g": 31.0,
        "nutritionSourceRow": 20
      },
      {
        "name": "dovlecei",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 5.5,
        "energyKcalPer100g": 21.0,
        "nutritionSourceRow": 139
      },
      {
        "name": "ardei iute",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 9.4,
        "energyKcalPer100g": 29.0,
        "nutritionSourceRow": 24
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "boia",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 42.56,
        "energyKcalPer100g": 232.0,
        "nutritionSourceRow": 38
      },
      {
        "name": "ulei",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "patrunjel",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 13.75,
        "energyKcalPer100g": 36.0,
        "nutritionSourceRow": 260
      }
    ]
  },
  {
    "id": "m1-007",
    "title": "SFECLA ROSIE SOTE",
    "category": "side",
    "sourceCategory": "G MZ",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 108,
    "energyKcalPerPortion": 155.34,
    "ingredients": [
      {
        "name": "sfecla rosie",
        "quantityGrams": 250.0,
        "purchasePricePerKg": 5.8,
        "energyKcalPer100g": 43.0,
        "nutritionSourceRow": 338
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "ulei",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      }
    ]
  },
  {
    "id": "m1-008",
    "title": "PILAF CU DOVLECEI",
    "category": "side",
    "sourceCategory": "GMZ",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 118,
    "energyKcalPerPortion": 358.04,
    "ingredients": [
      {
        "name": "orez",
        "quantityGrams": 70.0,
        "purchasePricePerKg": 8.79,
        "energyKcalPer100g": 361.0,
        "nutritionSourceRow": 238
      },
      {
        "name": "ceapa",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 4.5,
        "energyKcalPer100g": 42.0,
        "nutritionSourceRow": 92
      },
      {
        "name": "dovlecei",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 5.5,
        "energyKcalPer100g": 21.0,
        "nutritionSourceRow": 139
      },
      {
        "name": "morcov",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 2.767,
        "energyKcalPer100g": 41.0,
        "nutritionSourceRow": 216
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "ulei",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      }
    ]
  },
  {
    "id": "m1-009",
    "title": "CEAFA DE PORC MARINATA",
    "category": "main",
    "sourceCategory": "FP GRILL",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 131,
    "energyKcalPerPortion": 414.38,
    "ingredients": [
      {
        "name": "ceafa porc",
        "quantityGrams": 200.0,
        "purchasePricePerKg": 25.0,
        "energyKcalPer100g": 194.0,
        "nutritionSourceRow": 91
      },
      {
        "name": "vin rosu",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 39.48,
        "energyKcalPer100g": 96.0,
        "nutritionSourceRow": 398
      },
      {
        "name": "usturoi",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 11.01,
        "energyKcalPer100g": 149.0,
        "nutritionSourceRow": 389
      },
      {
        "name": "boia dulce",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 27.93,
        "energyKcalPer100g": 274.0,
        "nutritionSourceRow": 40
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "cimbru proaspat",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 103.21,
        "energyKcalPer100g": 101.0,
        "nutritionSourceRow": 104
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      }
    ]
  },
  {
    "id": "m1-010",
    "title": "COUQELETTE LA CEAUN CU USTUROI SI ARDEI COPT",
    "category": "main",
    "sourceCategory": "FP GRILL",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 144,
    "energyKcalPerPortion": 823.34,
    "ingredients": [
      {
        "name": "pui couquelette",
        "quantityGrams": 500.0,
        "purchasePricePerKg": 34.96364,
        "energyKcalPer100g": 137.0,
        "nutritionSourceRow": 289
      },
      {
        "name": "ulei",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "ardei capia",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 9.2,
        "energyKcalPer100g": 26.0,
        "nutritionSourceRow": 16
      },
      {
        "name": "usturoi",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 11.01,
        "energyKcalPer100g": 149.0,
        "nutritionSourceRow": 389
      },
      {
        "name": "patrunjel",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 13.75,
        "energyKcalPer100g": 36.0,
        "nutritionSourceRow": 260
      }
    ]
  },
  {
    "id": "m1-011",
    "title": "PULPA DE PUI DEZOSATA LA GRILL",
    "category": "main",
    "sourceCategory": "FP GRILL",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 157,
    "energyKcalPerPortion": 350.59,
    "ingredients": [
      {
        "name": "pulpa pui dez",
        "quantityGrams": 200.0,
        "purchasePricePerKg": 23.1,
        "energyKcalPer100g": 163.0,
        "nutritionSourceRow": 295
      },
      {
        "name": "boia dulce",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 27.93,
        "energyKcalPer100g": 274.0,
        "nutritionSourceRow": 40
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "ulei",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "cimbru proaspat",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 103.21,
        "energyKcalPer100g": 101.0,
        "nutritionSourceRow": 104
      }
    ]
  },
  {
    "id": "m1-012",
    "title": "CARTOFI PRAJITI",
    "category": "side",
    "sourceCategory": "G GRILL",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 169,
    "energyKcalPerPortion": 251.44,
    "ingredients": [
      {
        "name": "cartofi congelati",
        "quantityGrams": 240.0,
        "purchasePricePerKg": 7.636,
        "energyKcalPer100g": 86.0,
        "nutritionSourceRow": 82
      },
      {
        "name": "ulei palmier",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 17.106,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 382
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      }
    ]
  },
  {
    "id": "m1-013",
    "title": "ARIPIORE DE PUI CARAMELIZATE",
    "category": "main",
    "sourceCategory": "FP TRAD",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 178,
    "energyKcalPerPortion": 448.85,
    "ingredients": [
      {
        "name": "aripi pui",
        "quantityGrams": 220.0,
        "purchasePricePerKg": 14.9,
        "energyKcalPer100g": 186.0,
        "nutritionSourceRow": 26
      },
      {
        "name": "soia dark",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 15.875,
        "energyKcalPer100g": 199.0,
        "nutritionSourceRow": 342
      },
      {
        "name": "mustar",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 5.916,
        "energyKcalPer100g": 67.0,
        "nutritionSourceRow": 223
      },
      {
        "name": "ketchup",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 5.17,
        "energyKcalPer100g": 72.0,
        "nutritionSourceRow": 185
      },
      {
        "name": "miere",
        "quantityGrams": 3.0,
        "purchasePricePerKg": 25.65333,
        "energyKcalPer100g": 304.0,
        "nutritionSourceRow": 208
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      }
    ]
  },
  {
    "id": "m1-014",
    "title": "SARMALE DIN CARNE DE CURCAN IN FOI DE VITA",
    "category": "main",
    "sourceCategory": "FP TRAD",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 191,
    "energyKcalPerPortion": 282.26,
    "ingredients": [
      {
        "name": "piept curcan",
        "quantityGrams": 150.0,
        "purchasePricePerKg": 35.8,
        "energyKcalPer100g": 107.0,
        "nutritionSourceRow": 268
      },
      {
        "name": "ceapa",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 4.5,
        "energyKcalPer100g": 42.0,
        "nutritionSourceRow": 92
      },
      {
        "name": "orez",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 8.79,
        "energyKcalPer100g": 361.0,
        "nutritionSourceRow": 238
      },
      {
        "name": "sare",
        "quantityGrams": 3.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "pasta tomate",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 13.73882,
        "energyKcalPer100g": 85.0,
        "nutritionSourceRow": 258
      }
    ]
  },
  {
    "id": "m1-015",
    "title": "CARTOFI BABY AROMATIZATI SI SOS TZATZIKI",
    "category": "side",
    "sourceCategory": "G TRAD",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 203,
    "energyKcalPerPortion": 336.15,
    "ingredients": [
      {
        "name": "cartofi",
        "quantityGrams": 250.0,
        "purchasePricePerKg": 13.52,
        "energyKcalPer100g": 77.0,
        "nutritionSourceRow": 79
      },
      {
        "name": "sare",
        "quantityGrams": 3.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "boia dulce",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 27.93,
        "energyKcalPer100g": 274.0,
        "nutritionSourceRow": 40
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "ulei",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "iaurt grecesc",
        "quantityGrams": 60.0,
        "purchasePricePerKg": 78.5,
        "energyKcalPer100g": 59.0,
        "nutritionSourceRow": 181
      },
      {
        "name": "menta",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 55.0,
        "energyKcalPer100g": 70.0,
        "nutritionSourceRow": 203
      },
      {
        "name": "usturoi",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 11.01,
        "energyKcalPer100g": 149.0,
        "nutritionSourceRow": 389
      },
      {
        "name": "castraveti",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 4.4,
        "energyKcalPer100g": 15.0,
        "nutritionSourceRow": 89
      }
    ]
  },
  {
    "id": "m1-016",
    "title": "MAMALIGUTA FRIPTA CU TELEMEA",
    "category": "side",
    "sourceCategory": "G TRAD",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 219,
    "energyKcalPerPortion": 457.86,
    "ingredients": [
      {
        "name": "malai",
        "quantityGrams": 70.0,
        "purchasePricePerKg": 5.32,
        "energyKcalPer100g": 366.0,
        "nutritionSourceRow": 197
      },
      {
        "name": "sare",
        "quantityGrams": 3.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "ulei",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "telemea vaca",
        "quantityGrams": 40.0,
        "purchasePricePerKg": 23.125,
        "energyKcalPer100g": 279.0,
        "nutritionSourceRow": 374
      }
    ]
  },
  {
    "id": "m1-017",
    "title": "FILE DE COD IN CRUSTA DE PARMEZAN",
    "category": "main",
    "sourceCategory": "FP INT",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 229,
    "energyKcalPerPortion": 241.44,
    "ingredients": [
      {
        "name": "file cod",
        "quantityGrams": 180.0,
        "purchasePricePerKg": 58.54,
        "energyKcalPer100g": 82.0,
        "nutritionSourceRow": 156
      },
      {
        "name": "pesmet",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 11.34,
        "energyKcalPer100g": 395.0,
        "nutritionSourceRow": 265
      },
      {
        "name": "parmezan",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 71.0,
        "energyKcalPer100g": 431.0,
        "nutritionSourceRow": 254
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "coriandru",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 198.0,
        "energyKcalPer100g": 23.0,
        "nutritionSourceRow": 121
      },
      {
        "name": "patrunjel",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 13.75,
        "energyKcalPer100g": 36.0,
        "nutritionSourceRow": 260
      },
      {
        "name": "usturoi",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 11.01,
        "energyKcalPer100g": 149.0,
        "nutritionSourceRow": 389
      }
    ]
  },
  {
    "id": "m1-018",
    "title": "FRIPTURA DE VITA PORTUGHEZA",
    "category": "main",
    "sourceCategory": "FP INT",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 243,
    "energyKcalPerPortion": 660.54,
    "ingredients": [
      {
        "name": "pulpa vita",
        "quantityGrams": 200.0,
        "purchasePricePerKg": 47.9,
        "energyKcalPer100g": 249.0,
        "nutritionSourceRow": 299
      },
      {
        "name": "mustar",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 5.916,
        "energyKcalPer100g": 67.0,
        "nutritionSourceRow": 223
      },
      {
        "name": "amidon",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 17.43,
        "energyKcalPer100g": 343.0,
        "nutritionSourceRow": 5
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "ulei",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "piper",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "lapte",
        "quantityGrams": 80.0,
        "purchasePricePerKg": 6.6,
        "energyKcalPer100g": 50.0,
        "nutritionSourceRow": 189
      },
      {
        "name": "zeama lamaie",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 15.65,
        "energyKcalPer100g": 25.0,
        "nutritionSourceRow": 406
      },
      {
        "name": "patrunjel",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 13.75,
        "energyKcalPer100g": 36.0,
        "nutritionSourceRow": 260
      }
    ]
  },
  {
    "id": "m1-019",
    "title": "DOVLECEI CU ARDEI COLOR LA GRILL",
    "category": "side",
    "sourceCategory": "G INT",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 258,
    "energyKcalPerPortion": 145.17,
    "ingredients": [
      {
        "name": "dovlecei",
        "quantityGrams": 150.0,
        "purchasePricePerKg": 5.5,
        "energyKcalPer100g": 21.0,
        "nutritionSourceRow": 139
      },
      {
        "name": "ardei capia",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 9.2,
        "energyKcalPer100g": 26.0,
        "nutritionSourceRow": 16
      },
      {
        "name": "ardei gras bianca",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 7.5,
        "energyKcalPer100g": 31.0,
        "nutritionSourceRow": 20
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "ulei",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "piper",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "usturoi",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 11.01,
        "energyKcalPer100g": 149.0,
        "nutritionSourceRow": 389
      },
      {
        "name": "zeama lamaie",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 15.65,
        "energyKcalPer100g": 25.0,
        "nutritionSourceRow": 406
      },
      {
        "name": "patrunjel",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 13.75,
        "energyKcalPer100g": 36.0,
        "nutritionSourceRow": 260
      }
    ]
  },
  {
    "id": "m1-020",
    "title": "CARTOFI COPTI",
    "category": "side",
    "sourceCategory": "G INT",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 274,
    "energyKcalPerPortion": 226.06,
    "ingredients": [
      {
        "name": "cartofi",
        "quantityGrams": 240.0,
        "purchasePricePerKg": 13.52,
        "energyKcalPer100g": 77.0,
        "nutritionSourceRow": 79
      },
      {
        "name": "unt",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 9.2,
        "energyKcalPer100g": 542.0,
        "nutritionSourceRow": 384
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "ulei",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "boia",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 42.56,
        "energyKcalPer100g": 232.0,
        "nutritionSourceRow": 38
      }
    ]
  },
  {
    "id": "m1-021",
    "title": "VARZA ROSIE AROMATIZATA",
    "category": "side",
    "sourceCategory": "G SP",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 286,
    "energyKcalPerPortion": 192.68,
    "ingredients": [
      {
        "name": "varza rosie",
        "quantityGrams": 300.0,
        "purchasePricePerKg": 3.2,
        "energyKcalPer100g": 33.0,
        "nutritionSourceRow": 395
      },
      {
        "name": "ceapa",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 4.5,
        "energyKcalPer100g": 42.0,
        "nutritionSourceRow": 92
      },
      {
        "name": "ulei",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      }
    ]
  },
  {
    "id": "m1-022",
    "title": "PIZZA PEPERONI",
    "category": "main",
    "sourceCategory": "PIZZA",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 302,
    "energyKcalPerPortion": 954.41,
    "ingredients": [
      {
        "name": "mozarella",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 32.5,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 220
      },
      {
        "name": "sos rosii",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 12.0,
        "energyKcalPer100g": 21.0,
        "nutritionSourceRow": 348
      },
      {
        "name": "salam chorizo",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 56.48,
        "energyKcalPer100g": 455.0,
        "nutritionSourceRow": 320
      },
      {
        "name": "faina",
        "quantityGrams": 150.0,
        "purchasePricePerKg": 5.04,
        "energyKcalPer100g": 364.0,
        "nutritionSourceRow": 147
      },
      {
        "name": "apa",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 1.9,
        "energyKcalPer100g": 0.0,
        "nutritionSourceRow": 14
      },
      {
        "name": "sare",
        "quantityGrams": 4.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "zahar",
        "quantityGrams": 4.0,
        "purchasePricePerKg": 8.168,
        "energyKcalPer100g": 387.0,
        "nutritionSourceRow": 401
      },
      {
        "name": "drojdie proaspata",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 13.68,
        "energyKcalPer100g": 105.0,
        "nutritionSourceRow": 141
      },
      {
        "name": "ulei",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "rosii decojite",
        "quantityGrams": 50.0,
        "purchasePricePerKg": 7.104,
        "energyKcalPer100g": 30.0,
        "nutritionSourceRow": 311
      }
    ]
  },
  {
    "id": "m1-023",
    "title": "PIZZA NAPOLETANA",
    "category": "main",
    "sourceCategory": "PIZZA",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 318,
    "energyKcalPerPortion": 911.21,
    "ingredients": [
      {
        "name": "mozarella",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 32.5,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 220
      },
      {
        "name": "sos rosii",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 12.0,
        "energyKcalPer100g": 21.0,
        "nutritionSourceRow": 348
      },
      {
        "name": "spanac baby",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 48.0,
        "energyKcalPer100g": 23.0,
        "nutritionSourceRow": 357
      },
      {
        "name": "faina",
        "quantityGrams": 150.0,
        "purchasePricePerKg": 5.04,
        "energyKcalPer100g": 364.0,
        "nutritionSourceRow": 147
      },
      {
        "name": "apa",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 1.9,
        "energyKcalPer100g": 0.0,
        "nutritionSourceRow": 14
      },
      {
        "name": "sare",
        "quantityGrams": 4.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "zahar",
        "quantityGrams": 4.0,
        "purchasePricePerKg": 8.168,
        "energyKcalPer100g": 387.0,
        "nutritionSourceRow": 401
      },
      {
        "name": "drojdie proaspata",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 13.68,
        "energyKcalPer100g": 105.0,
        "nutritionSourceRow": 141
      },
      {
        "name": "ulei",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "rosii decojite",
        "quantityGrams": 50.0,
        "purchasePricePerKg": 7.104,
        "energyKcalPer100g": 30.0,
        "nutritionSourceRow": 311
      }
    ]
  },
  {
    "id": "m1-024",
    "title": "PASTE CU PIEPT DE PUI SI PARMESAN",
    "category": "main",
    "sourceCategory": "PASTE",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 334,
    "energyKcalPerPortion": 944.37,
    "ingredients": [
      {
        "name": "PENNE",
        "quantityGrams": 120.0,
        "purchasePricePerKg": 12.9,
        "energyKcalPer100g": 357.0,
        "nutritionSourceRow": 261
      },
      {
        "name": "smantana lichida",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 13.2,
        "energyKcalPer100g": 206.0,
        "nutritionSourceRow": 341
      },
      {
        "name": "sos rosii",
        "quantityGrams": 50.0,
        "purchasePricePerKg": 12.0,
        "energyKcalPer100g": 21.0,
        "nutritionSourceRow": 348
      },
      {
        "name": "piept pui",
        "quantityGrams": 90.0,
        "purchasePricePerKg": 29.5,
        "energyKcalPer100g": 172.0,
        "nutritionSourceRow": 270
      },
      {
        "name": "busuioc",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 88.0,
        "energyKcalPer100g": 251.0,
        "nutritionSourceRow": 57
      },
      {
        "name": "parmezan",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 71.0,
        "energyKcalPer100g": 431.0,
        "nutritionSourceRow": 254
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "sare",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      }
    ]
  },
  {
    "id": "m1-025",
    "title": "PASTE MILANESE",
    "category": "main",
    "sourceCategory": "PASTE",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 348,
    "energyKcalPerPortion": 318.86,
    "ingredients": [
      {
        "name": "spaghete",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 12.04,
        "energyKcalPer100g": 157.7,
        "nutritionSourceRow": 355
      },
      {
        "name": "sos rosii",
        "quantityGrams": 120.0,
        "purchasePricePerKg": 12.0,
        "energyKcalPer100g": 21.0,
        "nutritionSourceRow": 348
      },
      {
        "name": "ciuperci",
        "quantityGrams": 50.0,
        "purchasePricePerKg": 13.8,
        "energyKcalPer100g": 22.0,
        "nutritionSourceRow": 109
      },
      {
        "name": "sare",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "sunca presata",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 32.0,
        "energyKcalPer100g": 111.0,
        "nutritionSourceRow": 365
      },
      {
        "name": "busuioc",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 88.0,
        "energyKcalPer100g": 251.0,
        "nutritionSourceRow": 57
      },
      {
        "name": "oregano uscat",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 34.9,
        "energyKcalPer100g": 306.0,
        "nutritionSourceRow": 235
      }
    ]
  },
  {
    "id": "m1-026",
    "title": "CIULAMA DE CIUPERCI",
    "category": "main",
    "sourceCategory": "VEG",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 362,
    "energyKcalPerPortion": 360.04,
    "ingredients": [
      {
        "name": "ciuperci",
        "quantityGrams": 200.0,
        "purchasePricePerKg": 13.8,
        "energyKcalPer100g": 22.0,
        "nutritionSourceRow": 109
      },
      {
        "name": "smantana lichida",
        "quantityGrams": 60.0,
        "purchasePricePerKg": 13.2,
        "energyKcalPer100g": 206.0,
        "nutritionSourceRow": 341
      },
      {
        "name": "faina",
        "quantityGrams": 15.0,
        "purchasePricePerKg": 5.04,
        "energyKcalPer100g": 364.0,
        "nutritionSourceRow": 147
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "ulei",
        "quantityGrams": 15.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      }
    ]
  },
  {
    "id": "m1-027",
    "title": "MANCARICA DE LINTE ROSIE CU ARDEI COPT",
    "category": "main",
    "sourceCategory": null,
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 374,
    "energyKcalPerPortion": 627.44,
    "ingredients": [
      {
        "name": "linte rosie",
        "quantityGrams": 120.0,
        "purchasePricePerKg": 11.4,
        "energyKcalPer100g": 362.0,
        "nutritionSourceRow": 193
      },
      {
        "name": "ardei capia",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 9.2,
        "energyKcalPer100g": 26.0,
        "nutritionSourceRow": 16
      },
      {
        "name": "ceapa",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 4.5,
        "energyKcalPer100g": 42.0,
        "nutritionSourceRow": 92
      },
      {
        "name": "morcov",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 2.767,
        "energyKcalPer100g": 41.0,
        "nutritionSourceRow": 216
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "pasta tomate",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 13.73882,
        "energyKcalPer100g": 85.0,
        "nutritionSourceRow": 258
      },
      {
        "name": "boia dulce",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 27.93,
        "energyKcalPer100g": 274.0,
        "nutritionSourceRow": 40
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "cimbru uscat",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 62.0,
        "energyKcalPer100g": 272.0,
        "nutritionSourceRow": 105
      },
      {
        "name": "ulei",
        "quantityGrams": 15.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      }
    ]
  },
  {
    "id": "m1-028",
    "title": "SALATA CU PIEPT DE PUI SI BRANZA DE CAPRA",
    "category": "salad",
    "sourceCategory": "SAL M",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 390,
    "energyKcalPerPortion": 525.02,
    "ingredients": [
      {
        "name": "baby spanac",
        "quantityGrams": 50.0,
        "purchasePricePerKg": 48.0,
        "energyKcalPer100g": 23.0,
        "nutritionSourceRow": 28
      },
      {
        "name": "salata verde",
        "quantityGrams": 130.0,
        "purchasePricePerKg": 14.2,
        "energyKcalPer100g": 17.0,
        "nutritionSourceRow": 323
      },
      {
        "name": "branza capra",
        "quantityGrams": 50.0,
        "purchasePricePerKg": 70.0,
        "energyKcalPer100g": 364.0,
        "nutritionSourceRow": 44
      },
      {
        "name": "piept pui",
        "quantityGrams": 50.0,
        "purchasePricePerKg": 29.5,
        "energyKcalPer100g": 172.0,
        "nutritionSourceRow": 270
      },
      {
        "name": "masline",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 18.0,
        "energyKcalPer100g": 115.0,
        "nutritionSourceRow": 201
      },
      {
        "name": "ceapa alba",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 3.5,
        "energyKcalPer100g": 42.0,
        "nutritionSourceRow": 93
      },
      {
        "name": "porumb",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 10.204,
        "energyKcalPer100g": 96.0,
        "nutritionSourceRow": 283
      },
      {
        "name": "seminte mix",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 6.29,
        "energyKcalPer100g": 561.0,
        "nutritionSourceRow": 336
      },
      {
        "name": "ULEI",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "lamaie",
        "quantityGrams": 50.0,
        "purchasePricePerKg": 7.8,
        "energyKcalPer100g": 29.0,
        "nutritionSourceRow": 188
      },
      {
        "name": "sare",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      }
    ]
  },
  {
    "id": "m1-029",
    "title": "SALATA CU BRANZA NOBILA",
    "category": "salad",
    "sourceCategory": "SAL M",
    "sourceSheet": "Retete Luni 30.01.23",
    "sourceHeaderRow": 408,
    "energyKcalPerPortion": 288.9,
    "ingredients": [
      {
        "name": "spanac baby",
        "quantityGrams": 120.0,
        "purchasePricePerKg": 48.0,
        "energyKcalPer100g": 23.0,
        "nutritionSourceRow": 357
      },
      {
        "name": "rosii cherry",
        "quantityGrams": 40.0,
        "purchasePricePerKg": 14.8,
        "energyKcalPer100g": 25.0,
        "nutritionSourceRow": 309
      },
      {
        "name": "chifte",
        "quantityGrams": 60.0,
        "purchasePricePerKg": 0,
        "energyKcalPer100g": null,
        "nutritionSourceRow": null
      },
      {
        "name": "miez nuca",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 48.0,
        "energyKcalPer100g": 654.0,
        "nutritionSourceRow": 209
      },
      {
        "name": "ardei california",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 13.8,
        "energyKcalPer100g": 31.0,
        "nutritionSourceRow": 15
      },
      {
        "name": "parmezan",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 71.0,
        "energyKcalPer100g": 431.0,
        "nutritionSourceRow": 254
      },
      {
        "name": "lamaie",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 7.8,
        "energyKcalPer100g": 29.0,
        "nutritionSourceRow": 188
      }
    ]
  },
  {
    "id": "m1-030",
    "title": "SUPA DE MORCOVI SI CORIANDRU",
    "category": "soup",
    "sourceCategory": "CIORBA 1",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 4,
    "energyKcalPerPortion": 137.66,
    "ingredients": [
      {
        "name": "morcovi",
        "quantityGrams": 60.0,
        "purchasePricePerKg": 2.88,
        "energyKcalPer100g": 41.0,
        "nutritionSourceRow": 218
      },
      {
        "name": "unt",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 9.2,
        "energyKcalPer100g": 542.0,
        "nutritionSourceRow": 384
      },
      {
        "name": "ceapa",
        "quantityGrams": 15.0,
        "purchasePricePerKg": 4.5,
        "energyKcalPer100g": 42.0,
        "nutritionSourceRow": 92
      },
      {
        "name": "telina",
        "quantityGrams": 25.0,
        "purchasePricePerKg": 6.2,
        "energyKcalPer100g": 16.0,
        "nutritionSourceRow": 375
      },
      {
        "name": "cartofi",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 13.52,
        "energyKcalPer100g": 77.0,
        "nutritionSourceRow": 79
      },
      {
        "name": "conc legume",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 45.51,
        "energyKcalPer100g": 398.0,
        "nutritionSourceRow": 116
      },
      {
        "name": "smantana lichida",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 13.2,
        "energyKcalPer100g": 206.0,
        "nutritionSourceRow": 341
      },
      {
        "name": "sare",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 0.2,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "cimbru proaspat",
        "quantityGrams": 0.3,
        "purchasePricePerKg": 103.21,
        "energyKcalPer100g": 101.0,
        "nutritionSourceRow": 104
      }
    ]
  },
  {
    "id": "m1-031",
    "title": "BORS DE CURCAN",
    "category": "soup",
    "sourceCategory": null,
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 22,
    "energyKcalPerPortion": 162.58,
    "ingredients": [
      {
        "name": "curcan carne lucru",
        "quantityGrams": 60.0,
        "purchasePricePerKg": 28.0,
        "energyKcalPer100g": 140.0,
        "nutritionSourceRow": 267
      },
      {
        "name": "ceapa",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 4.5,
        "energyKcalPer100g": 42.0,
        "nutritionSourceRow": 92
      },
      {
        "name": "morcovi",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 2.88,
        "energyKcalPer100g": 41.0,
        "nutritionSourceRow": 218
      },
      {
        "name": "telina",
        "quantityGrams": 15.0,
        "purchasePricePerKg": 6.2,
        "energyKcalPer100g": 16.0,
        "nutritionSourceRow": 375
      },
      {
        "name": "ardei gras bianca",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 7.5,
        "energyKcalPer100g": 31.0,
        "nutritionSourceRow": 20
      },
      {
        "name": "ardei capia",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 9.2,
        "energyKcalPer100g": 26.0,
        "nutritionSourceRow": 16
      },
      {
        "name": "ulei",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "bors proaspat",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 2.03,
        "energyKcalPer100g": 4.0,
        "nutritionSourceRow": 42
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "rosii decojite",
        "quantityGrams": 15.0,
        "purchasePricePerKg": 7.104,
        "energyKcalPer100g": 30.0,
        "nutritionSourceRow": 311
      },
      {
        "name": "leustean",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 2.5,
        "energyKcalPer100g": 37.0,
        "nutritionSourceRow": 192
      }
    ]
  },
  {
    "id": "m1-032",
    "title": "CIORBA DE BURTA",
    "category": "soup",
    "sourceCategory": "CIORBA 3",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 40,
    "energyKcalPerPortion": 584.09,
    "ingredients": [
      {
        "name": "burta vita",
        "quantityGrams": 140.0,
        "purchasePricePerKg": 19.72,
        "energyKcalPer100g": 91.7,
        "nutritionSourceRow": 56
      },
      {
        "name": "oase vita",
        "quantityGrams": 50.0,
        "purchasePricePerKg": 11.5,
        "energyKcalPer100g": 299.0,
        "nutritionSourceRow": 233
      },
      {
        "name": "piper boabe",
        "quantityGrams": 0.2,
        "purchasePricePerKg": 59.74,
        "energyKcalPer100g": 308.0,
        "nutritionSourceRow": 273
      },
      {
        "name": "foi dafin",
        "quantityGrams": 0.1,
        "purchasePricePerKg": 41.75,
        "energyKcalPer100g": 313.0,
        "nutritionSourceRow": 160
      },
      {
        "name": "morcovi",
        "quantityGrams": 70.0,
        "purchasePricePerKg": 2.88,
        "energyKcalPer100g": 41.0,
        "nutritionSourceRow": 218
      },
      {
        "name": "ulei",
        "quantityGrams": 7.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "sare",
        "quantityGrams": 1.5,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "usturoi",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 11.01,
        "energyKcalPer100g": 149.0,
        "nutritionSourceRow": 389
      },
      {
        "name": "ou",
        "quantityGrams": 48.0,
        "purchasePricePerKg": 19.3679,
        "energyKcalPer100g": 155.0,
        "nutritionSourceRow": 247
      },
      {
        "name": "smantana",
        "quantityGrams": 50.0,
        "purchasePricePerKg": 13.528,
        "energyKcalPer100g": 216.0,
        "nutritionSourceRow": 339
      },
      {
        "name": "ceapa",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 4.5,
        "energyKcalPer100g": 42.0,
        "nutritionSourceRow": 92
      },
      {
        "name": "telina",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 6.2,
        "energyKcalPer100g": 16.0,
        "nutritionSourceRow": 375
      },
      {
        "name": "otet",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 2.71,
        "energyKcalPer100g": 18.0,
        "nutritionSourceRow": 242
      },
      {
        "name": "gogosari in otet",
        "quantityGrams": 25.0,
        "purchasePricePerKg": 9.05882,
        "energyKcalPer100g": 18.0,
        "nutritionSourceRow": 172
      }
    ]
  },
  {
    "id": "m1-033",
    "title": "MUSACA DE CARTOFI CU CARNE DE PORC",
    "category": "main",
    "sourceCategory": "FP COMPUS",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 60,
    "energyKcalPerPortion": 1587.93,
    "ingredients": [
      {
        "name": "cartofi",
        "quantityGrams": 200.0,
        "purchasePricePerKg": 13.52,
        "energyKcalPer100g": 77.0,
        "nutritionSourceRow": 79
      },
      {
        "name": "carne tocata porc",
        "quantityGrams": 150.0,
        "purchasePricePerKg": 23.79,
        "energyKcalPer100g": 340.0,
        "nutritionSourceRow": 76
      },
      {
        "name": "ceapa",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 4.5,
        "energyKcalPer100g": 42.0,
        "nutritionSourceRow": 92
      },
      {
        "name": "morcovi",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 2.88,
        "energyKcalPer100g": 41.0,
        "nutritionSourceRow": 218
      },
      {
        "name": "ardei capia",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 9.2,
        "energyKcalPer100g": 26.0,
        "nutritionSourceRow": 16
      },
      {
        "name": "pasta tomate",
        "quantityGrams": 15.0,
        "purchasePricePerKg": 13.73882,
        "energyKcalPer100g": 85.0,
        "nutritionSourceRow": 258
      },
      {
        "name": "ulei",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "boia",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 42.56,
        "energyKcalPer100g": 232.0,
        "nutritionSourceRow": 38
      },
      {
        "name": "piper",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "faina",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 5.04,
        "energyKcalPer100g": 364.0,
        "nutritionSourceRow": 147
      },
      {
        "name": "ou melange",
        "quantityGrams": 500.0,
        "purchasePricePerKg": 1.0,
        "energyKcalPer100g": 155.0,
        "nutritionSourceRow": 249
      }
    ]
  },
  {
    "id": "m1-034",
    "title": "CARNATI PROASPETI GROSI",
    "category": "main",
    "sourceCategory": "FP MZ 1",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 79,
    "energyKcalPerPortion": 428.4,
    "ingredients": [
      {
        "name": "carnati proaspeti porc",
        "quantityGrams": 180.0,
        "purchasePricePerKg": 25.07,
        "energyKcalPer100g": 238.0,
        "nutritionSourceRow": 70
      }
    ]
  },
  {
    "id": "m1-035",
    "title": "FICATEI DE PUI CU SOS TOMAT SI USTUROI",
    "category": "main",
    "sourceCategory": "FP MZ 2",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 86,
    "energyKcalPerPortion": 431.04,
    "ingredients": [
      {
        "name": "ficatei pui",
        "quantityGrams": 230.0,
        "purchasePricePerKg": 11.14,
        "energyKcalPer100g": 126.0,
        "nutritionSourceRow": 155
      },
      {
        "name": "pasta tomate",
        "quantityGrams": 15.0,
        "purchasePricePerKg": 13.73882,
        "energyKcalPer100g": 85.0,
        "nutritionSourceRow": 258
      },
      {
        "name": "ulei",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "usturoi",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 11.01,
        "energyKcalPer100g": 149.0,
        "nutritionSourceRow": 389
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "faina",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 5.04,
        "energyKcalPer100g": 364.0,
        "nutritionSourceRow": 147
      },
      {
        "name": "patrunjel",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 13.75,
        "energyKcalPer100g": 36.0,
        "nutritionSourceRow": 260
      }
    ]
  },
  {
    "id": "m1-036",
    "title": "VARZA CALITA",
    "category": "side",
    "sourceCategory": "G MZ 1",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 100,
    "energyKcalPerPortion": 384.9,
    "ingredients": [
      {
        "name": "varza alba",
        "quantityGrams": 300.0,
        "purchasePricePerKg": 2.4,
        "energyKcalPer100g": 25.0,
        "nutritionSourceRow": 392
      },
      {
        "name": "ceapa",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 4.5,
        "energyKcalPer100g": 42.0,
        "nutritionSourceRow": 92
      },
      {
        "name": "ulei",
        "quantityGrams": 25.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "ardei gras rosu",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 13.8,
        "energyKcalPer100g": 31.0,
        "nutritionSourceRow": 23
      },
      {
        "name": "boia dulce",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 27.93,
        "energyKcalPer100g": 274.0,
        "nutritionSourceRow": 40
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "foi dafin",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 41.75,
        "energyKcalPer100g": 313.0,
        "nutritionSourceRow": 160
      },
      {
        "name": "marar",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 12.5,
        "energyKcalPer100g": 305.0,
        "nutritionSourceRow": 199
      },
      {
        "name": "pasta tomate",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 13.73882,
        "energyKcalPer100g": 85.0,
        "nutritionSourceRow": 258
      }
    ]
  },
  {
    "id": "m1-037",
    "title": "MAMALIGUTA",
    "category": "side",
    "sourceCategory": "G MZ 2",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 116,
    "energyKcalPerPortion": 301.26,
    "ingredients": [
      {
        "name": "malai",
        "quantityGrams": 70.0,
        "purchasePricePerKg": 5.32,
        "energyKcalPer100g": 366.0,
        "nutritionSourceRow": 197
      },
      {
        "name": "sare",
        "quantityGrams": 3.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "ulei",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      }
    ]
  },
  {
    "id": "m1-038",
    "title": "CEAFA DE PORC GRILL CU CIMBRU SI ROSII USCATE",
    "category": "main",
    "sourceCategory": "FP GRILL 1",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 125,
    "energyKcalPerPortion": 504.36,
    "ingredients": [
      {
        "name": "ceafa porc",
        "quantityGrams": 200.0,
        "purchasePricePerKg": 25.0,
        "energyKcalPer100g": 194.0,
        "nutritionSourceRow": 91
      },
      {
        "name": "cimbru proaspat",
        "quantityGrams": 3.0,
        "purchasePricePerKg": 103.21,
        "energyKcalPer100g": 101.0,
        "nutritionSourceRow": 104
      },
      {
        "name": "rosii uscate",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 46.77333,
        "energyKcalPer100g": 258.0,
        "nutritionSourceRow": 313
      },
      {
        "name": "ulei masline",
        "quantityGrams": 7.0,
        "purchasePricePerKg": 20.02,
        "energyKcalPer100g": 822.0,
        "nutritionSourceRow": 381
      },
      {
        "name": "coriandru proaspat",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 198.0,
        "energyKcalPer100g": 23.0,
        "nutritionSourceRow": 124
      },
      {
        "name": "usturoi",
        "quantityGrams": 2.5,
        "purchasePricePerKg": 11.01,
        "energyKcalPer100g": 149.0,
        "nutritionSourceRow": 389
      }
    ]
  },
  {
    "id": "m1-039",
    "title": "PULPA DE PUI CU OS LA GRILL",
    "category": "main",
    "sourceCategory": "FP GRILL 2",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 137,
    "energyKcalPerPortion": 527.58,
    "ingredients": [
      {
        "name": "pulpa pui intreg",
        "quantityGrams": 300.0,
        "purchasePricePerKg": 15.39,
        "energyKcalPer100g": 159.0,
        "nutritionSourceRow": 296
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "boia dulce",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 27.93,
        "energyKcalPer100g": 274.0,
        "nutritionSourceRow": 40
      },
      {
        "name": "ulei",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      }
    ]
  },
  {
    "id": "m1-040",
    "title": "MUSCHIULT DE PORC IMPLETIT AROMATIZAT CU IERBURI PROASPETE",
    "category": "main",
    "sourceCategory": "FP GRILL3",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 148,
    "energyKcalPerPortion": 244.78,
    "ingredients": [
      {
        "name": "muschiulet porc",
        "quantityGrams": 200.0,
        "purchasePricePerKg": 42.0,
        "energyKcalPer100g": 112.0,
        "nutritionSourceRow": 222
      },
      {
        "name": "usturoi granulat",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 34.08,
        "energyKcalPer100g": 331.0,
        "nutritionSourceRow": 390
      },
      {
        "name": "rozmarin proaspat",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 88.0,
        "energyKcalPer100g": 131.0,
        "nutritionSourceRow": 315
      },
      {
        "name": "cimbru proaspat",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 103.21,
        "energyKcalPer100g": 101.0,
        "nutritionSourceRow": 104
      },
      {
        "name": "ulei",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      }
    ]
  },
  {
    "id": "m1-041",
    "title": "CARTOFI DOLAR CHIPS",
    "category": "side",
    "sourceCategory": "G GRILL",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 161,
    "energyKcalPerPortion": 348.09,
    "ingredients": [
      {
        "name": "cartofi dolars",
        "quantityGrams": 230.0,
        "purchasePricePerKg": 10.0,
        "energyKcalPer100g": 90.0,
        "nutritionSourceRow": 84
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "boia dulce",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 27.93,
        "energyKcalPer100g": 274.0,
        "nutritionSourceRow": 40
      },
      {
        "name": "usturoi granulat",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 34.08,
        "energyKcalPer100g": 331.0,
        "nutritionSourceRow": 390
      },
      {
        "name": "ulei palmier",
        "quantityGrams": 15.0,
        "purchasePricePerKg": 17.106,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 382
      }
    ]
  },
  {
    "id": "m1-042",
    "title": "OSTROPEL DE PUI",
    "category": "main",
    "sourceCategory": "FP TRAD 1",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 172,
    "energyKcalPerPortion": 605.06,
    "ingredients": [
      {
        "name": "rosii in bulion",
        "quantityGrams": 150.0,
        "purchasePricePerKg": 7.104,
        "energyKcalPer100g": 30.0,
        "nutritionSourceRow": 312
      },
      {
        "name": "ciocanele pui",
        "quantityGrams": 250.0,
        "purchasePricePerKg": 12.9,
        "energyKcalPer100g": 185.0,
        "nutritionSourceRow": 106
      },
      {
        "name": "patrunjel",
        "quantityGrams": 15.0,
        "purchasePricePerKg": 13.75,
        "energyKcalPer100g": 36.0,
        "nutritionSourceRow": 260
      },
      {
        "name": "usturoi",
        "quantityGrams": 6.0,
        "purchasePricePerKg": 11.01,
        "energyKcalPer100g": 149.0,
        "nutritionSourceRow": 389
      },
      {
        "name": "ulei",
        "quantityGrams": 9.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "cimbru uscat",
        "quantityGrams": 0.5,
        "purchasePricePerKg": 62.0,
        "energyKcalPer100g": 272.0,
        "nutritionSourceRow": 105
      },
      {
        "name": "sare",
        "quantityGrams": 1.2,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 0.3,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      }
    ]
  },
  {
    "id": "m1-043",
    "title": "CIOCANELE DE PUI LA CUPTOR",
    "category": "main",
    "sourceCategory": "FP TRAD 2",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 186,
    "energyKcalPerPortion": 554.43,
    "ingredients": [
      {
        "name": "ciocanele pui",
        "quantityGrams": 250.0,
        "purchasePricePerKg": 12.9,
        "energyKcalPer100g": 185.0,
        "nutritionSourceRow": 106
      },
      {
        "name": "usturoi",
        "quantityGrams": 7.0,
        "purchasePricePerKg": 11.01,
        "energyKcalPer100g": 149.0,
        "nutritionSourceRow": 389
      },
      {
        "name": "sare",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "curcuma",
        "quantityGrams": 0.7,
        "purchasePricePerKg": 24.9,
        "energyKcalPer100g": 354.0,
        "nutritionSourceRow": 133
      },
      {
        "name": "cimbru proaspat",
        "quantityGrams": 0.5,
        "purchasePricePerKg": 103.21,
        "energyKcalPer100g": 101.0,
        "nutritionSourceRow": 104
      },
      {
        "name": "ulei",
        "quantityGrams": 8.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "ardei capia",
        "quantityGrams": 25.0,
        "purchasePricePerKg": 9.2,
        "energyKcalPer100g": 26.0,
        "nutritionSourceRow": 16
      }
    ]
  },
  {
    "id": "m1-044",
    "title": "PILAF CU LEGUME",
    "category": "side",
    "sourceCategory": "G TRAD 1",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 199,
    "energyKcalPerPortion": 382.99,
    "ingredients": [
      {
        "name": "orez",
        "quantityGrams": 70.0,
        "purchasePricePerKg": 8.79,
        "energyKcalPer100g": 361.0,
        "nutritionSourceRow": 238
      },
      {
        "name": "ulei",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "ceapa",
        "quantityGrams": 25.0,
        "purchasePricePerKg": 4.5,
        "energyKcalPer100g": 42.0,
        "nutritionSourceRow": 92
      },
      {
        "name": "morcov",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 2.767,
        "energyKcalPer100g": 41.0,
        "nutritionSourceRow": 216
      },
      {
        "name": "telina",
        "quantityGrams": 25.0,
        "purchasePricePerKg": 6.2,
        "energyKcalPer100g": 16.0,
        "nutritionSourceRow": 375
      },
      {
        "name": "ardei capia",
        "quantityGrams": 15.0,
        "purchasePricePerKg": 9.2,
        "energyKcalPer100g": 26.0,
        "nutritionSourceRow": 16
      },
      {
        "name": "patrunjel",
        "quantityGrams": 8.0,
        "purchasePricePerKg": 13.75,
        "energyKcalPer100g": 36.0,
        "nutritionSourceRow": 260
      },
      {
        "name": "sare",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 0.3,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "conc legume",
        "quantityGrams": 2.5,
        "purchasePricePerKg": 45.51,
        "energyKcalPer100g": 398.0,
        "nutritionSourceRow": 116
      }
    ]
  },
  {
    "id": "m1-045",
    "title": "CARTOFI LA CUPTOR CU ROZMARIN",
    "category": "side",
    "sourceCategory": "G TRAD 2",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 215,
    "energyKcalPerPortion": 72.02,
    "ingredients": [
      {
        "name": "cartofi curatati",
        "quantityGrams": 220.0,
        "purchasePricePerKg": 5.01,
        "energyKcalPer100g": null,
        "nutritionSourceRow": 80
      },
      {
        "name": "rozmarin proaspat",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 88.0,
        "energyKcalPer100g": 131.0,
        "nutritionSourceRow": 315
      },
      {
        "name": "usturoi granulat",
        "quantityGrams": 1.5,
        "purchasePricePerKg": 34.08,
        "energyKcalPer100g": 331.0,
        "nutritionSourceRow": 390
      },
      {
        "name": "boia dulce",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 27.93,
        "energyKcalPer100g": 274.0,
        "nutritionSourceRow": 40
      },
      {
        "name": "sare",
        "quantityGrams": 0.1,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "ulei",
        "quantityGrams": 7.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      }
    ]
  },
  {
    "id": "m1-046",
    "title": "FRIGARUI ASIATICE DIN MUSCHIULT DE PORC",
    "category": "main",
    "sourceCategory": "FP INT 1",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 227,
    "energyKcalPerPortion": 270.76,
    "ingredients": [
      {
        "name": "muschiulet porc",
        "quantityGrams": 170.0,
        "purchasePricePerKg": 32.113,
        "energyKcalPer100g": 112.0,
        "nutritionSourceRow": 222
      },
      {
        "name": "ardei gras rosu",
        "quantityGrams": 40.0,
        "purchasePricePerKg": 13.8,
        "energyKcalPer100g": 31.0,
        "nutritionSourceRow": 23
      },
      {
        "name": "praz",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 5.8,
        "energyKcalPer100g": 61.0,
        "nutritionSourceRow": 284
      },
      {
        "name": "sos soia",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 15.875,
        "energyKcalPer100g": 170.0,
        "nutritionSourceRow": 350
      },
      {
        "name": "usturoi granulat",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 34.08,
        "energyKcalPer100g": 331.0,
        "nutritionSourceRow": 390
      },
      {
        "name": "pasta ardei rosu",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 22.32,
        "energyKcalPer100g": 46.0,
        "nutritionSourceRow": 255
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "ulei",
        "quantityGrams": 3.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      }
    ]
  },
  {
    "id": "m1-047",
    "title": "VRABIOARA DE VITA CU SOS DE PIPER VERDE",
    "category": "main",
    "sourceCategory": "FP INT 2",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 242,
    "energyKcalPerPortion": 763.19,
    "ingredients": [
      {
        "name": "vrabioara de vita",
        "quantityGrams": 250.0,
        "purchasePricePerKg": 48.5,
        "energyKcalPer100g": 243.5,
        "nutritionSourceRow": 400
      },
      {
        "name": "sos piper verde",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 127.0083,
        "energyKcalPer100g": 356.0,
        "nutritionSourceRow": 349
      },
      {
        "name": "smantana lichida",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 13.2,
        "energyKcalPer100g": 206.0,
        "nutritionSourceRow": 341
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "unt",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 9.2,
        "energyKcalPer100g": 542.0,
        "nutritionSourceRow": 384
      }
    ]
  },
  {
    "id": "m1-048",
    "title": "OREZ BASMATI CU UNT SI MUGURI DE PIN",
    "category": "side",
    "sourceCategory": "G INT 1",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 254,
    "energyKcalPerPortion": 370.49,
    "ingredients": [
      {
        "name": "orez basmatic",
        "quantityGrams": 80.0,
        "purchasePricePerKg": 9.716,
        "energyKcalPer100g": 348.0,
        "nutritionSourceRow": 239
      },
      {
        "name": "unt",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 9.2,
        "energyKcalPer100g": 542.0,
        "nutritionSourceRow": 384
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "muguri de pin",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 3.71,
        "energyKcalPer100g": 673.0,
        "nutritionSourceRow": 225
      },
      {
        "name": "ceapa",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 4.5,
        "energyKcalPer100g": 42.0,
        "nutritionSourceRow": 92
      }
    ]
  },
  {
    "id": "m1-049",
    "title": "PIURE DE CARTOFI CU PARMEZAN",
    "category": "side",
    "sourceCategory": "G INT 2",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 265,
    "energyKcalPerPortion": 154.0,
    "ingredients": [
      {
        "name": "cartofi",
        "quantityGrams": 200.0,
        "purchasePricePerKg": 13.52,
        "energyKcalPer100g": 77.0,
        "nutritionSourceRow": 79
      }
    ]
  },
  {
    "id": "m1-050",
    "title": "PIEPT DE CURCAN CU ARDEI COLOR SOS SOIA SI URECHI DE LEMN",
    "category": "main",
    "sourceCategory": "FP SP",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 276,
    "energyKcalPerPortion": 519.19,
    "ingredients": [
      {
        "name": "piept curcan",
        "quantityGrams": 180.0,
        "purchasePricePerKg": 35.8,
        "energyKcalPer100g": 107.0,
        "nutritionSourceRow": 268
      },
      {
        "name": "ardei california",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 13.8,
        "energyKcalPer100g": 31.0,
        "nutritionSourceRow": 15
      },
      {
        "name": "ardei gras bianca",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 7.5,
        "energyKcalPer100g": 31.0,
        "nutritionSourceRow": 20
      },
      {
        "name": "urechi de lemn",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 165.99,
        "energyKcalPer100g": 197.0,
        "nutritionSourceRow": 387
      },
      {
        "name": "sos soia",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 15.875,
        "energyKcalPer100g": 170.0,
        "nutritionSourceRow": 350
      },
      {
        "name": "sos sweet chilly",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 13.8,
        "energyKcalPer100g": 150.0,
        "nutritionSourceRow": 353
      },
      {
        "name": "patrunjel",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 13.75,
        "energyKcalPer100g": 36.0,
        "nutritionSourceRow": 260
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "ulei",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "amidon",
        "quantityGrams": 50.0,
        "purchasePricePerKg": 17.43,
        "energyKcalPer100g": 343.0,
        "nutritionSourceRow": 5
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      }
    ]
  },
  {
    "id": "m1-051",
    "title": "TAITEI DE OREZ CU LEGUME",
    "category": "side",
    "sourceCategory": "G SP",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 293,
    "energyKcalPerPortion": 425.68,
    "ingredients": [
      {
        "name": "taitei orez",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 12.63,
        "energyKcalPer100g": 365.0,
        "nutritionSourceRow": 370
      },
      {
        "name": "ardei california",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 13.8,
        "energyKcalPer100g": 31.0,
        "nutritionSourceRow": 15
      },
      {
        "name": "varza rosie",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 3.2,
        "energyKcalPer100g": 33.0,
        "nutritionSourceRow": 395
      },
      {
        "name": "morcov",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 2.767,
        "energyKcalPer100g": 41.0,
        "nutritionSourceRow": 216
      },
      {
        "name": "praz",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 5.8,
        "energyKcalPer100g": 61.0,
        "nutritionSourceRow": 284
      },
      {
        "name": "sos soia",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 15.875,
        "energyKcalPer100g": 170.0,
        "nutritionSourceRow": 350
      },
      {
        "name": "urechi de lemn",
        "quantityGrams": 4.0,
        "purchasePricePerKg": 165.99,
        "energyKcalPer100g": 197.0,
        "nutritionSourceRow": 387
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "patrunjel",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 13.75,
        "energyKcalPer100g": 36.0,
        "nutritionSourceRow": 260
      },
      {
        "name": "dovlecei",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 5.5,
        "energyKcalPer100g": 21.0,
        "nutritionSourceRow": 139
      }
    ]
  },
  {
    "id": "m1-052",
    "title": "PIZZA PROSCIUTO E FUNGHI",
    "category": "main",
    "sourceCategory": "PIZZA 1",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 309,
    "energyKcalPerPortion": 975.41,
    "ingredients": [
      {
        "name": "mozarella",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 32.5,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 220
      },
      {
        "name": "sos rosii",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 12.0,
        "energyKcalPer100g": 21.0,
        "nutritionSourceRow": 348
      },
      {
        "name": "sunca presata",
        "quantityGrams": 50.0,
        "purchasePricePerKg": 32.0,
        "energyKcalPer100g": 111.0,
        "nutritionSourceRow": 365
      },
      {
        "name": "ciuperci",
        "quantityGrams": 50.0,
        "purchasePricePerKg": 13.8,
        "energyKcalPer100g": 22.0,
        "nutritionSourceRow": 109
      },
      {
        "name": "faina",
        "quantityGrams": 150.0,
        "purchasePricePerKg": 5.04,
        "energyKcalPer100g": 364.0,
        "nutritionSourceRow": 147
      },
      {
        "name": "apa",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 1.9,
        "energyKcalPer100g": 0.0,
        "nutritionSourceRow": 14
      },
      {
        "name": "sare",
        "quantityGrams": 4.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "zahar",
        "quantityGrams": 4.0,
        "purchasePricePerKg": 8.168,
        "energyKcalPer100g": 387.0,
        "nutritionSourceRow": 401
      },
      {
        "name": "drojdie proaspata",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 13.68,
        "energyKcalPer100g": 105.0,
        "nutritionSourceRow": 141
      },
      {
        "name": "ulei",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "rosii decojite",
        "quantityGrams": 50.0,
        "purchasePricePerKg": 7.104,
        "energyKcalPer100g": 30.0,
        "nutritionSourceRow": 311
      }
    ]
  },
  {
    "id": "m1-053",
    "title": "PIZZA QUATTRO STAGGIONI",
    "category": "main",
    "sourceCategory": "PIZZA 2",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 326,
    "energyKcalPerPortion": 1096.01,
    "ingredients": [
      {
        "name": "mozarella",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 32.5,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 220
      },
      {
        "name": "sos rosii",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 12.0,
        "energyKcalPer100g": 21.0,
        "nutritionSourceRow": 348
      },
      {
        "name": "masline",
        "quantityGrams": 70.0,
        "purchasePricePerKg": 18.0,
        "energyKcalPer100g": 115.0,
        "nutritionSourceRow": 201
      },
      {
        "name": "ciuperci champinion",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 13.8,
        "energyKcalPer100g": 22.0,
        "nutritionSourceRow": 110
      },
      {
        "name": "prosciutto",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 101.78,
        "energyKcalPer100g": 230.0,
        "nutritionSourceRow": 286
      },
      {
        "name": "ardei color mix",
        "quantityGrams": 60.0,
        "purchasePricePerKg": 13.8,
        "energyKcalPer100g": 26.0,
        "nutritionSourceRow": 18
      },
      {
        "name": "faina",
        "quantityGrams": 150.0,
        "purchasePricePerKg": 5.04,
        "energyKcalPer100g": 364.0,
        "nutritionSourceRow": 147
      },
      {
        "name": "apa",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 1.9,
        "energyKcalPer100g": 0.0,
        "nutritionSourceRow": 14
      },
      {
        "name": "sare",
        "quantityGrams": 4.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "zahar",
        "quantityGrams": 4.0,
        "purchasePricePerKg": 8.168,
        "energyKcalPer100g": 387.0,
        "nutritionSourceRow": 401
      },
      {
        "name": "drojdie proaspata",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 13.68,
        "energyKcalPer100g": 105.0,
        "nutritionSourceRow": 141
      },
      {
        "name": "ulei",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "rosii decojite",
        "quantityGrams": 50.0,
        "purchasePricePerKg": 7.104,
        "energyKcalPer100g": 30.0,
        "nutritionSourceRow": 311
      }
    ]
  },
  {
    "id": "m1-054",
    "title": "PENNE ARABIATA",
    "category": "main",
    "sourceCategory": "PASTE 1",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 345,
    "energyKcalPerPortion": 510.75,
    "ingredients": [
      {
        "name": "penne tricolore",
        "quantityGrams": 120.0,
        "purchasePricePerKg": 12.9,
        "energyKcalPer100g": 357.0,
        "nutritionSourceRow": 263
      },
      {
        "name": "rosii decojite",
        "quantityGrams": 50.0,
        "purchasePricePerKg": 7.104,
        "energyKcalPer100g": 30.0,
        "nutritionSourceRow": 311
      },
      {
        "name": "usturoi",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 11.01,
        "energyKcalPer100g": 149.0,
        "nutritionSourceRow": 389
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "oregano uscat",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 34.9,
        "energyKcalPer100g": 306.0,
        "nutritionSourceRow": 235
      },
      {
        "name": "parmezan",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 71.0,
        "energyKcalPer100g": 431.0,
        "nutritionSourceRow": 254
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "busuioc proaspat",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 88.0,
        "energyKcalPer100g": 27.0,
        "nutritionSourceRow": 58
      },
      {
        "name": "fulgi chili",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 56.2,
        "energyKcalPer100g": 314.0,
        "nutritionSourceRow": 165
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      }
    ]
  },
  {
    "id": "m1-055",
    "title": "PASTE BOLOGNESE CU CARNE DE PORC",
    "category": "main",
    "sourceCategory": "PASTE 2",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 361,
    "energyKcalPerPortion": 604.86,
    "ingredients": [
      {
        "name": "spaghete",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 12.04,
        "energyKcalPer100g": 157.7,
        "nutritionSourceRow": 355
      },
      {
        "name": "sare",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "oregano uscat",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 34.9,
        "energyKcalPer100g": 306.0,
        "nutritionSourceRow": 235
      },
      {
        "name": "busuioc",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 88.0,
        "energyKcalPer100g": 251.0,
        "nutritionSourceRow": 57
      },
      {
        "name": "carne tocata porc",
        "quantityGrams": 120.0,
        "purchasePricePerKg": 23.79,
        "energyKcalPer100g": 340.0,
        "nutritionSourceRow": 76
      },
      {
        "name": "sos rosii",
        "quantityGrams": 120.0,
        "purchasePricePerKg": 12.0,
        "energyKcalPer100g": 21.0,
        "nutritionSourceRow": 348
      }
    ]
  },
  {
    "id": "m1-056",
    "title": "CARTOFI COPTI CU IAURT SI CEDAR",
    "category": "main",
    "sourceCategory": "FP VEG 1",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 374,
    "energyKcalPerPortion": 574.25,
    "ingredients": [
      {
        "name": "cartofi",
        "quantityGrams": 350.0,
        "purchasePricePerKg": 13.52,
        "energyKcalPer100g": 77.0,
        "nutritionSourceRow": 79
      },
      {
        "name": "cedar",
        "quantityGrams": 50.0,
        "purchasePricePerKg": 45.28,
        "energyKcalPer100g": 400.0,
        "nutritionSourceRow": 97
      },
      {
        "name": "ulei",
        "quantityGrams": 7.0,
        "purchasePricePerKg": 27.72,
        "energyKcalPer100g": 900.0,
        "nutritionSourceRow": 379
      },
      {
        "name": "ceapa",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 4.5,
        "energyKcalPer100g": 42.0,
        "nutritionSourceRow": 92
      },
      {
        "name": "ghimbir",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 20.65,
        "energyKcalPer100g": 80.0,
        "nutritionSourceRow": 171
      },
      {
        "name": "seminte chimen",
        "quantityGrams": 0.3,
        "purchasePricePerKg": 23.56,
        "energyKcalPer100g": 333.0,
        "nutritionSourceRow": 332
      },
      {
        "name": "turmeric pudra",
        "quantityGrams": 0.5,
        "purchasePricePerKg": 33.57,
        "energyKcalPer100g": 354.0,
        "nutritionSourceRow": 378
      },
      {
        "name": "sare",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "usturoi",
        "quantityGrams": 7.0,
        "purchasePricePerKg": 11.01,
        "energyKcalPer100g": 149.0,
        "nutritionSourceRow": 389
      },
      {
        "name": "iaurt",
        "quantityGrams": 25.0,
        "purchasePricePerKg": 78.5,
        "energyKcalPer100g": 59.0,
        "nutritionSourceRow": 180
      },
      {
        "name": "coriandru proaspat",
        "quantityGrams": 6.0,
        "purchasePricePerKg": 198.0,
        "energyKcalPer100g": 23.0,
        "nutritionSourceRow": 124
      }
    ]
  },
  {
    "id": "m1-057",
    "title": "TARTA CU DOVLECEI SI TELEMEA",
    "category": "main",
    "sourceCategory": "FP VEG 2",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 391,
    "energyKcalPerPortion": 783.04,
    "ingredients": [
      {
        "name": "aluat foietaj",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 11.88,
        "energyKcalPer100g": 387.0,
        "nutritionSourceRow": 3
      },
      {
        "name": "dovlecei",
        "quantityGrams": 200.0,
        "purchasePricePerKg": 5.5,
        "energyKcalPer100g": 21.0,
        "nutritionSourceRow": 139
      },
      {
        "name": "telemea vaca",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 23.125,
        "energyKcalPer100g": 279.0,
        "nutritionSourceRow": 374
      },
      {
        "name": "ou melange",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 21.122,
        "energyKcalPer100g": 155.0,
        "nutritionSourceRow": 249
      },
      {
        "name": "smantana lichida",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 13.2,
        "energyKcalPer100g": 206.0,
        "nutritionSourceRow": 341
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      }
    ]
  },
  {
    "id": "m1-058",
    "title": "SALATA DE VARA CU ROSII SI AVOCADO",
    "category": "salad",
    "sourceCategory": "SALATA 1",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 404,
    "energyKcalPerPortion": 165.57,
    "ingredients": [
      {
        "name": "rosii",
        "quantityGrams": 150.0,
        "purchasePricePerKg": 14.8,
        "energyKcalPer100g": 18.0,
        "nutritionSourceRow": 308
      },
      {
        "name": "avocado",
        "quantityGrams": 50.0,
        "purchasePricePerKg": 30.55,
        "energyKcalPer100g": 160.1,
        "nutritionSourceRow": 27
      },
      {
        "name": "ceapa rosie",
        "quantityGrams": 15.0,
        "purchasePricePerKg": 4.5,
        "energyKcalPer100g": 39.0,
        "nutritionSourceRow": 95
      },
      {
        "name": "castraveti",
        "quantityGrams": 40.0,
        "purchasePricePerKg": 4.4,
        "energyKcalPer100g": 15.0,
        "nutritionSourceRow": 89
      },
      {
        "name": "patrunjel",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 13.75,
        "energyKcalPer100g": 36.0,
        "nutritionSourceRow": 260
      },
      {
        "name": "porumb",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 10.204,
        "energyKcalPer100g": 96.0,
        "nutritionSourceRow": 283
      },
      {
        "name": "sare",
        "quantityGrams": 2.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "lamaie",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 7.8,
        "energyKcalPer100g": 29.0,
        "nutritionSourceRow": 188
      },
      {
        "name": "ulei masline",
        "quantityGrams": 1.5,
        "purchasePricePerKg": 20.02,
        "energyKcalPer100g": 822.0,
        "nutritionSourceRow": 381
      }
    ]
  },
  {
    "id": "m1-059",
    "title": "SALATA CU PIEPT DE PUI AFUMAT SI CAPERE",
    "category": "salad",
    "sourceCategory": "SALATA 2",
    "sourceSheet": "Retete Marti 31.01.23",
    "sourceHeaderRow": 420,
    "energyKcalPerPortion": 360.97,
    "ingredients": [
      {
        "name": "piept pui afumat",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 32.82,
        "energyKcalPer100g": 101.0,
        "nutritionSourceRow": 271
      },
      {
        "name": "capere",
        "quantityGrams": 5.0,
        "purchasePricePerKg": 30.73611,
        "energyKcalPer100g": 23.0,
        "nutritionSourceRow": 64
      },
      {
        "name": "masline",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 18.0,
        "energyKcalPer100g": 115.0,
        "nutritionSourceRow": 201
      },
      {
        "name": "morcov",
        "quantityGrams": 50.0,
        "purchasePricePerKg": 2.767,
        "energyKcalPer100g": 41.0,
        "nutritionSourceRow": 216
      },
      {
        "name": "salata verde",
        "quantityGrams": 100.0,
        "purchasePricePerKg": 14.2,
        "energyKcalPer100g": 17.0,
        "nutritionSourceRow": 323
      },
      {
        "name": "varza alba",
        "quantityGrams": 150.0,
        "purchasePricePerKg": 2.4,
        "energyKcalPer100g": 25.0,
        "nutritionSourceRow": 392
      },
      {
        "name": "mustar",
        "quantityGrams": 30.0,
        "purchasePricePerKg": 5.916,
        "energyKcalPer100g": 67.0,
        "nutritionSourceRow": 223
      },
      {
        "name": "ulei masline",
        "quantityGrams": 10.0,
        "purchasePricePerKg": 20.02,
        "energyKcalPer100g": 822.0,
        "nutritionSourceRow": 381
      },
      {
        "name": "sare",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.0395,
        "energyKcalPer100g": 2.0,
        "nutritionSourceRow": 325
      },
      {
        "name": "piper",
        "quantityGrams": 1.0,
        "purchasePricePerKg": 0.048,
        "energyKcalPer100g": 280.0,
        "nutritionSourceRow": 272
      },
      {
        "name": "lamaie",
        "quantityGrams": 50.0,
        "purchasePricePerKg": 7.8,
        "energyKcalPer100g": 29.0,
        "nutritionSourceRow": 188
      },
      {
        "name": "smantana lichida",
        "quantityGrams": 20.0,
        "purchasePricePerKg": 13.2,
        "energyKcalPer100g": 206.0,
        "nutritionSourceRow": 341
      }
    ]
  }
];
