import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({
  isDemoMode: true,
  isSupabaseConfigured: false,
  supabase: null,
}));
const cache = vi.hoisted(() => new Map<string, string>());
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => cache.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      cache.set(k, v);
    }),
  },
}));
vi.mock("@/lib/equipment-maintenance", () => ({
  loadEquipmentRegistry: vi.fn(async () => [{ id: "off", available: false }]),
}));
import {
  createProductionSheet,
  productionSheetTotals,
  validateProductionSheet,
  copyProductionSheet,
  saveProductionSheet,
  createProductionSheetVoucher,
  importProductionSheets,
  loadProductionSheets,
} from "./production-sheets";
import {
  productionSheetsGrid,
  previewProductionSheetsImport,
} from "./production-sheets-transfer";
import type { Recipe } from "@/types/recipe";
const recipe = {
  id: "r",
  title: "Soup",
  servings: 10,
  updatedAt: "2026-11-03T10:00:00Z",
  ingredients: [
    {
      id: "i",
      kind: "product",
      name: "Flour",
      quantity: 1,
      unit: "kg",
      priceUnit: "kg",
      purchasePrice: 10,
      lossPercent: 0,
    },
  ],
  yieldQuantity: 1,
  yieldUnit: "kg",
  cookingMethod: "boil_meat_veg",
  cookingLossPercent: 0,
} as Recipe;
const draft = () =>
  createProductionSheet(recipe, [recipe], [], 20, "2026-11-03");
describe("production sheets", () => {
  it("snapshots recipe, scales planned consumption and never invents measurements", () => {
    const s = draft();
    expect(s.lines[0].plannedQuantity).toBe(2);
    expect(s.lines[0].actualQuantity).toBeNull();
    expect(s.actualPortions).toBeNull();
    expect(s.measurements).toEqual([]);
    expect(productionSheetTotals(s).plannedCost).toBe(20);
    expect(productionSheetTotals(s).actualCost).toBeNull();
  });
  it("requires explicit measurements and responsible person before finalizing", () => {
    expect(() => validateProductionSheet(draft())).toThrow();
    const s = draft();
    s.responsible = "Chef";
    s.actualPortions = 19;
    s.actualWeightGrams = 1800;
    s.lines[0].actualQuantity = 2.1;
    const final = validateProductionSheet(s);
    expect(final.status).toBe("validated");
    expect(productionSheetTotals(final).actualCost).toBe(21);
    expect(copyProductionSheet(final).status).toBe("draft");
    expect(() => validateProductionSheet(final)).toThrow();
  });
  it("round trips via preview as new unsigned drafts and rejects malformed dates/numbers", () => {
    const s = draft();
    const grid = productionSheetsGrid([s]);
    const p = previewProductionSheetsImport(grid, []);
    expect(p.errors).toEqual([]);
    expect(p.records[0].id).not.toBe(s.id);
    expect(p.records[0].status).toBe("draft");
    const bad = grid.map((r) => [...r]);
    bad[1][3] = "2026-02-30";
    expect(
      previewProductionSheetsImport(bad, []).errors.length,
    ).toBeGreaterThan(0);
  });
  it("skips exported identities already present", () => {
    const s = draft();
    expect(
      previewProductionSheetsImport(productionSheetsGrid([s]), [s]).records,
    ).toEqual([]);
  });
});

beforeEach(() => cache.clear());
describe("production sheet persistence", () => {
  const complete = () => {
    const s = draft();
    s.responsible = "Chef";
    s.actualPortions = 20;
    s.actualWeightGrams = 2000;
    s.lines[0].actualQuantity = 2;
    return s;
  };
  it("blocks unavailable equipment and immutable final edits", async () => {
    const s = complete();
    s.equipmentIds = ["off"];
    await expect(
      saveProductionSheet("demo", validateProductionSheet(s)),
    ).rejects.toThrow("unavailable");
    s.equipmentIds = [];
    const saved = await saveProductionSheet("demo", validateProductionSheet(s));
    await expect(
      saveProductionSheet("demo", { ...saved, notes: "overwrite" }),
    ).rejects.toThrow("immutable");
  });
  it("creates the consumption voucher only once across concurrent requests", async () => {
    const s = await saveProductionSheet(
      "demo",
      validateProductionSheet(complete()),
    );
    const [a, b] = await Promise.all([
      createProductionSheetVoucher("demo", s.id),
      createProductionSheetVoucher("demo", s.id),
    ]);
    expect(a.id).toBe(b.id);
    const rows = JSON.parse(
      cache.get("professional_foodcost.consumption_vouchers.v1.demo")!,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].totalCost).toBe(20);
  });
  it("serializes duplicate imports, strips cloud metadata, and rejects the whole invalid batch", async () => {
    const s = draft();
    s.serverVersion = 900;
    s.syncState = "synced";
    await Promise.all([
      importProductionSheets("demo", [s]),
      importProductionSheets("demo", [s]),
    ]);
    const rows = await loadProductionSheets("demo");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe(s.id);
    expect(rows[0].serverVersion).toBe(0);
    expect(rows[0].voucherId).not.toBe(s.voucherId);
    const bad = { ...draft(), plannedPortions: NaN };
    await expect(
      importProductionSheets("demo", [draft(), bad]),
    ).rejects.toThrow();
    expect(await loadProductionSheets("demo")).toHaveLength(1);
  });
  it("expands subrecipes including yield and ingredient losses", () => {
    const sub = {
      ...recipe,
      id: "sub",
      isSubRecipe: true,
      yieldQuantity: 2,
      ingredients: [{ ...recipe.ingredients[0], quantity: 1, lossPercent: 20 }],
    };
    const main = {
      ...recipe,
      ingredients: [
        {
          ...recipe.ingredients[0],
          kind: "sub_recipe" as const,
          subRecipeId: "sub",
          quantity: 1,
        },
      ],
    };
    const s = createProductionSheet(main, [main, sub], [], 20, "2026-11-03");
    expect(s.lines[0].plannedQuantity).toBe(1.25);
    expect(s.lines[0].plannedCost).toBe(12.5);
  });
  it("reports invalid row without allowing partially valid imports", () => {
    const grid = productionSheetsGrid([draft(), draft()]);
    const badRow = grid.findIndex((r) => r[1] === "ingredient");
    grid[badRow][17] = "Infinity";
    const result = previewProductionSheetsImport(grid, []);
    expect(result.errors[0]).toContain(`Row ${badRow + 1}`);
    expect(result.records).toEqual([]);
  });
});

it("accepts editable flat ingredient rows with decimal commas and chunked snapshots", () => {
  const s = draft();
  s.recipeSnapshot = JSON.stringify({ large: "x".repeat(40000) });
  const grid = productionSheetsGrid([s]);
  expect(grid.filter((r) => r[1] === "snapshot")).toHaveLength(3);
  expect(
    grid.every((r) =>
      r.every((c) => typeof c !== "string" || c.length <= 16000),
    ),
  ).toBe(true);
  const ingredient = grid.find((r) => r[1] === "ingredient")!;
  ingredient[17] = "2,5";
  const result = previewProductionSheetsImport(grid, []);
  expect(result.errors).toEqual([]);
  expect(result.records[0].lines[0].actualQuantity).toBe(2.5);
  expect(result.records[0].recipeSnapshot).toBe(s.recipeSnapshot);
});
it("snapshots only reachable subrecipes", () => {
  const unrelated = { ...recipe, id: "unrelated", isSubRecipe: true };
  const s = createProductionSheet(
    recipe,
    [recipe, unrelated],
    [],
    10,
    "2026-11-03",
  );
  expect(JSON.parse(s.recipeSnapshot).subrecipes).toEqual([]);
});
