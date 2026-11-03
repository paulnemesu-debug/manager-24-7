import { createOperationalStore } from "@/lib/operational-sync";
import { normalizeQuantity } from "@/lib/calculations";
import { buildShoppingList } from "@/lib/operations";
import {
  createProductionDocumentId,
  createConsumptionVoucherOnce,
} from "@/lib/production-documents-repository";
import { withStorageLock } from "@/lib/storage-lock";
import type { CatalogIngredient, Recipe } from "@/types/recipe";
import { loadEquipmentRegistry } from "@/lib/equipment-maintenance";
import type { ProductionSheet } from "@/types/production-sheet";
export const productionDateValid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const nonnegative = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const nullable = (v: unknown) => v === null || nonnegative(v);
const text = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 1000000;
const timestamp = (v: unknown): v is string =>
  text(v) &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
    v,
  ) &&
  productionDateValid(v.slice(0, 10)) &&
  Number.isFinite(Date.parse(v));
export function normalizeProductionSheet(
  value: unknown,
): ProductionSheet | null {
  const s = value as ProductionSheet;
  if (
    !s ||
    ![
      "id",
      "recipeId",
      "recipeTitle",
      "recipeVersion",
      "recipeSnapshot",
      "responsible",
      "notes",
      "voucherId",
    ].every((k) => text(s[k as keyof ProductionSheet])) ||
    !s.id ||
    !productionDateValid(s.batchDate) ||
    !timestamp(s.createdAt) ||
    !timestamp(s.updatedAt) ||
    !nonnegative(s.plannedPortions) ||
    s.plannedPortions <= 0 ||
    !nullable(s.actualWeightGrams) ||
    !nullable(s.actualPortions) ||
    !["draft", "validated"].includes(s.status) ||
    !(s.validatedAt === null || timestamp(s.validatedAt)) ||
    !(s.correctionOf === null || text(s.correctionOf)) ||
    !Array.isArray(s.equipmentIds) ||
    !s.equipmentIds.every(text) ||
    !Array.isArray(s.lines) ||
    !s.lines.length ||
    !Array.isArray(s.measurements)
  )
    return null;
  if (
    s.lines.some(
      (l) =>
        !l ||
        !["id", "name", "lot", "supplier"].every((k) =>
          text(l[k as keyof typeof l]),
        ) ||
        !(l.catalogId === null || text(l.catalogId)) ||
        !["kg", "l", "buc"].includes(l.unit) ||
        ![l.plannedQuantity, l.plannedCost, l.unitCost].every(nonnegative) ||
        !nullable(l.actualQuantity) ||
        (l.actualQuantity !== null &&
          !Number.isFinite(l.actualQuantity * l.unitCost)),
    )
  )
    return null;
  if (
    !Number.isFinite(s.lines.reduce((n, l) => n + l.plannedCost, 0)) ||
    !Number.isFinite(
      s.lines.reduce((n, l) => n + (l.actualQuantity ?? 0) * l.unitCost, 0),
    )
  )
    return null;
  if (
    s.measurements.some(
      (m) =>
        !m ||
        !text(m.id) ||
        !text(m.stage) ||
        !timestamp(m.recordedAt) ||
        !(
          m.temperatureC === null ||
          (typeof m.temperatureC === "number" &&
            Number.isFinite(m.temperatureC) &&
            m.temperatureC >= -273.15 &&
            m.temperatureC <= 2000)
        ) ||
        !nullable(m.durationMinutes) ||
        !text(m.correctiveAction),
    )
  )
    return null;
  if (
    s.status === "validated" &&
    (!s.validatedAt ||
      !s.responsible.trim() ||
      !s.actualPortions ||
      !s.actualWeightGrams ||
      s.lines.some((l) => l.actualQuantity === null))
  )
    return null;
  return s;
}
export function createProductionSheet(
  recipe: Recipe,
  recipes: readonly Recipe[],
  catalog: readonly CatalogIngredient[],
  portions: number,
  batchDate: string,
): ProductionSheet {
  if (
    !productionDateValid(batchDate) ||
    !Number.isFinite(portions) ||
    portions <= 0 ||
    !Number.isFinite(recipe.servings) ||
    recipe.servings <= 0
  )
    throw new Error("Invalid date / portions");
  // Reject broken recipe graphs: the shopping calculator intentionally skips these for planning.
  const reachable = new Map<string, Recipe>();
  const check = (r: Recipe, path: Set<string>) => {
    reachable.set(r.id, r);
    if (path.has(r.id)) throw new Error("Cyclic subrecipe");
    const next = new Set([...path, r.id]);
    for (const l of r.ingredients) {
      if (
        ![l.quantity, l.purchasePrice, l.lossPercent].every(nonnegative) ||
        l.lossPercent >= 100
      )
        throw new Error("Invalid ingredient");
      if (l.kind === "sub_recipe") {
        const sub = recipes.find((x) => x.id === l.subRecipeId);
        if (!sub || !sub.yieldQuantity || !Number.isFinite(sub.yieldQuantity))
          throw new Error("Missing subrecipe / yield");
        if (normalizeQuantity(l.quantity, l.unit, sub.yieldUnit) === null)
          throw new Error("Incompatible subrecipe unit");
        check(sub, next);
      } else if (normalizeQuantity(l.quantity, l.unit, l.priceUnit) === null)
        throw new Error("Incompatible ingredient unit");
    }
  };
  check(recipe, new Set());
  const now = new Date().toISOString();
  const lines = buildShoppingList(recipes, catalog, [
    { recipeId: recipe.id, portions },
  ]);
  if (
    !lines.length ||
    lines.some((l) => !Number.isFinite(l.quantity) || !Number.isFinite(l.cost))
  )
    throw new Error("No consumable ingredients");
  return {
    id: createProductionDocumentId(),
    correctionOf: null,
    batchDate,
    recipeId: recipe.id,
    recipeTitle: recipe.title,
    recipeVersion: recipe.updatedAt,
    recipeSnapshot: JSON.stringify({
      recipe,
      subrecipes: [...reachable.values()].filter((r) => r.id !== recipe.id),
    }),
    plannedPortions: portions,
    lines: lines.map((l) => ({
      id: createProductionDocumentId(),
      catalogId: l.key.includes("|") ? null : l.key,
      name: l.name,
      unit: l.unit,
      plannedQuantity: l.quantity,
      plannedCost: l.cost,
      unitCost: l.quantity ? l.cost / l.quantity : 0,
      actualQuantity: null,
      lot: "",
      supplier: l.supplier ?? "",
    })),
    actualWeightGrams: null,
    actualPortions: null,
    responsible: "",
    equipmentIds: [],
    measurements: [],
    notes: "",
    status: "draft",
    validatedAt: null,
    voucherId: createProductionDocumentId(),
    createdAt: now,
    updatedAt: now,
  };
}
export function productionSheetTotals(s: ProductionSheet) {
  const plannedCost = s.lines.reduce((n, l) => n + l.plannedCost, 0);
  const actualCost = s.lines.some((l) => l.actualQuantity === null)
    ? null
    : Math.round(
        s.lines.reduce((n, l) => n + l.actualQuantity! * l.unitCost, 0) * 100,
      ) / 100;
  return {
    plannedCost,
    actualCost,
    variance: actualCost === null ? null : actualCost - plannedCost,
    portionCost:
      actualCost !== null && s.actualPortions
        ? actualCost / s.actualPortions
        : null,
    costPerKg:
      actualCost !== null && s.actualWeightGrams
        ? (actualCost / s.actualWeightGrams) * 1000
        : null,
  };
}
export function validateProductionSheet(s: ProductionSheet): ProductionSheet {
  if (s.status !== "draft") throw new Error("Validated sheets are immutable");
  const next = {
    ...s,
    status: "validated" as const,
    validatedAt: new Date().toISOString(),
  };
  if (!normalizeProductionSheet(next))
    throw new Error(
      "Complete responsible person, measured yield / portions and all actual consumptions.",
    );
  return next;
}
export function copyProductionSheet(s: ProductionSheet): ProductionSheet {
  const now = new Date().toISOString();
  return {
    ...JSON.parse(JSON.stringify(s)),
    id: createProductionDocumentId(),
    correctionOf: s.id,
    status: "draft",
    validatedAt: null,
    voucherId: createProductionDocumentId(),
    createdAt: now,
    updatedAt: now,
    serverVersion: undefined,
    syncState: undefined,
    remoteConflict: undefined,
    importSourceId: undefined,
  };
}
const store = createOperationalStore<ProductionSheet>({
  key: (u) => `manager247.production-sheets.v1.${u}`,
  table: "production_sheets",
  id: (s) => s.id,
  normalize: normalizeProductionSheet,
});
export const loadProductionSheets = store.load;
export async function resolveProductionSheet(
  userId: string,
  id: string,
  choice: "local" | "remote",
) {
  return withStorageLock(`production-sheet-edit.${userId}`, async () => {
    const item = (await store.cached(userId)).find((s) => s.id === id);
    if (choice === "local" && item?.remoteConflict?.data.status === "validated")
      throw new Error(
        "Cloud sheet is already validated. Keep the cloud version or create a correction copy.",
      );
    return store.resolve(userId, id, choice);
  });
}
export async function saveProductionSheet(userId: string, s: ProductionSheet) {
  return withStorageLock(`production-sheet-edit.${userId}`, async () => {
    const old = (await store.cached(userId)).find((x) => x.id === s.id);
    if (old?.status === "validated")
      throw new Error(
        "Validated sheets are immutable. Create a correction copy.",
      );
    if (!normalizeProductionSheet(s))
      throw new Error("Invalid production sheet");
    if (s.status === "validated") {
      const assets = await loadEquipmentRegistry(userId);
      if (
        s.equipmentIds.some((id) => !assets.find((a) => a.id === id)?.available)
      )
        throw new Error("Selected equipment unavailable");
    }
    return store.save(userId, s);
  });
}
export async function createProductionSheetVoucher(userId: string, id: string) {
  return withStorageLock(`production-sheet-voucher.${userId}`, async () => {
    const s = (await store.cached(userId)).find((x) => x.id === id);
    if (!s || s.status !== "validated" || s.syncState === "conflict")
      throw new Error("Validate the saved sheet first");
    return createConsumptionVoucherOnce(userId, {
      id: s.voucherId,
      documentDate: s.batchDate,
      reference: s.recipeTitle,
      source: "production_plan",
      sourceReference: s.id,
      notes: s.notes,
      lines: s.lines.map((l) => ({
        id: l.id,
        catalogId: l.catalogId,
        name: l.name,
        quantity: l.actualQuantity!,
        unit: l.unit,
        purchasePrice: l.unitCost,
        priceUnit: l.unit,
        cost: l.actualQuantity! * l.unitCost,
      })),
    });
  });
}
export async function importProductionSheets(
  userId: string,
  records: ProductionSheet[],
) {
  return withStorageLock(`production-sheet-edit.${userId}`, async () => {
    if (
      records.some(
        (s) =>
          !normalizeProductionSheet(s) || s.status !== "draft" || s.validatedAt,
      )
    )
      throw new Error("Invalid import");
    const existing = await store.cached(userId);
    const seen = new Set(
      existing.flatMap((s) => [s.id, s.importSourceId ?? ""]),
    );
    for (const source of records) {
      const sourceId = source.importSourceId ?? source.id;
      if (seen.has(sourceId)) continue;
      const now = new Date().toISOString();
      const s: ProductionSheet = {
        batchDate: source.batchDate,
        recipeId: "imported",
        recipeTitle: source.recipeTitle,
        recipeVersion: source.recipeVersion,
        recipeSnapshot: source.recipeSnapshot,
        plannedPortions: source.plannedPortions,
        actualWeightGrams: source.actualWeightGrams,
        actualPortions: source.actualPortions,
        responsible: source.responsible,
        equipmentIds: [...source.equipmentIds],
        notes: source.notes,
        id: createProductionDocumentId(),
        importSourceId: sourceId,
        correctionOf: null,
        status: "draft",
        validatedAt: null,
        voucherId: createProductionDocumentId(),
        createdAt: now,
        updatedAt: now,
        lines: source.lines.map((l) => ({
          id: createProductionDocumentId(),
          catalogId: null,
          name: l.name,
          unit: l.unit,
          plannedQuantity: l.plannedQuantity,
          plannedCost: l.plannedCost,
          unitCost: l.unitCost,
          actualQuantity: l.actualQuantity,
          lot: l.lot,
          supplier: l.supplier,
        })),
        measurements: source.measurements.map((m) => ({
          id: createProductionDocumentId(),
          stage: m.stage,
          recordedAt: m.recordedAt,
          temperatureC: m.temperatureC,
          durationMinutes: m.durationMinutes,
          correctiveAction: m.correctiveAction,
        })),
      };
      await store.save(userId, s);
      seen.add(sourceId);
    }
  });
}
