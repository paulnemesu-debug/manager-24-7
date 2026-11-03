import { escapeOperationsHtml as esc } from "@/lib/operations-transfer";
import { createProductionDocumentId } from "@/lib/production-documents-repository";
import {
  normalizeProductionSheet,
  productionSheetTotals,
} from "./production-sheets";
import type { ProductionSheet } from "@/types/production-sheet";
type Cell = string | number | boolean | null;
const HEADERS = [
  "template",
  "row_type",
  "source_sheet_id",
  "batch_date",
  "recipe_title",
  "recipe_version",
  "planned_portions",
  "status",
  "responsible",
  "actual_weight_g",
  "actual_portions",
  "equipment_id",
  "name",
  "unit",
  "planned_quantity",
  "planned_cost",
  "unit_cost",
  "actual_quantity",
  "lot",
  "supplier",
  "stage",
  "recorded_at",
  "temperature_c",
  "duration_minutes",
  "corrective_action",
  "notes",
  "snapshot_chunk",
];
function row(id: string, type: string, values: Record<string, Cell>): Cell[] {
  return HEADERS.map((h) =>
    h === "template"
      ? "production-sheets-v1"
      : h === "row_type"
        ? type
        : h === "source_sheet_id"
          ? id
          : (values[h] ?? null),
  );
}
export function productionSheetsTemplate(
  date: string,
  locale: "ro" | "en",
): Cell[][] {
  const ro = locale === "ro";
  const id = "example-production-1";
  return [
    HEADERS,
    row(id, "sheet", {
      batch_date: date,
      recipe_title: ro ? "Exemplu de preparat" : "Example dish",
      recipe_version: "external",
      planned_portions: 10,
      status: "draft",
      notes: ro
        ? "Exemplu: înlocuiește datele și folosește un source_sheet_id unic pentru fiecare fișă nouă. Completează consumurile și măsurătorile numai după efectuare."
        : "Example: replace these values and use a unique source_sheet_id for each new sheet. Enter actual consumption and measurements only after performing them.",
    }),
    row(id, "ingredient", {
      name: ro ? "Ingredient exemplu" : "Example ingredient",
      unit: "kg",
      planned_quantity: 1,
      planned_cost: 0,
      unit_cost: 0,
    }),
  ];
}
export function productionSheetsGrid(
  sheets: readonly ProductionSheet[],
): Cell[][] {
  const grid: Cell[][] = [HEADERS];
  for (const s of sheets) {
    const id = s.importSourceId ?? s.id;
    grid.push(
      row(id, "sheet", {
        batch_date: s.batchDate,
        recipe_title: s.recipeTitle,
        recipe_version: s.recipeVersion,
        planned_portions: s.plannedPortions,
        status: s.status,
        responsible: s.responsible,
        actual_weight_g: s.actualWeightGrams,
        actual_portions: s.actualPortions,
        notes: s.notes,
      }),
    );
    for (const l of s.lines)
      grid.push(
        row(id, "ingredient", {
          name: l.name,
          unit: l.unit,
          planned_quantity: l.plannedQuantity,
          planned_cost: l.plannedCost,
          unit_cost: l.unitCost,
          actual_quantity: l.actualQuantity,
          lot: l.lot,
          supplier: l.supplier,
        }),
      );
    for (const m of s.measurements)
      grid.push(
        row(id, "measurement", {
          stage: m.stage,
          recorded_at: m.recordedAt,
          temperature_c: m.temperatureC,
          duration_minutes: m.durationMinutes,
          corrective_action: m.correctiveAction,
        }),
      );
    for (const idEquipment of s.equipmentIds)
      grid.push(row(id, "equipment", { equipment_id: idEquipment }));
    for (let i = 0; i < s.recipeSnapshot.length; i += 16000)
      grid.push(
        row(id, "snapshot", {
          snapshot_chunk: s.recipeSnapshot.slice(i, i + 16000),
        }),
      );
  }
  return grid;
}
export function previewProductionSheetsImport(
  grid: unknown[][],
  existing: readonly ProductionSheet[],
) {
  const errors: string[] = [];
  const records: ProductionSheet[] = [];
  let skipped = 0;
  if (
    !grid.length ||
    grid[0].length !== HEADERS.length ||
    HEADERS.some((h, i) => grid[0][i] !== h)
  )
    return {
      errors: ["Row 1: invalid production-sheets-v1 header"],
      records,
      skipped,
    };
  const groups = new Map<
    string,
    {
      sheet: ProductionSheet | null;
      chunks: string[];
      lines: ProductionSheet["lines"];
      measurements: ProductionSheet["measurements"];
      equipmentIds: string[];
      firstRow: number;
    }
  >();
  const string = (v: unknown, required = false) => {
    if (v === null || v === undefined) v = "";
    if (typeof v !== "string" || v.length > 16000 || (required && !v.trim()))
      throw new Error("invalid text");
    return v;
  };
  const number = (v: unknown, optional = false, signed = false) => {
    if (optional && (v === null || v === undefined || v === "")) return null;
    if (
      typeof v !== "number" &&
      !(
        typeof v === "string" &&
        (signed ? /^-?\d+([.,]\d+)?$/ : /^\d+([.,]\d+)?$/).test(v.trim())
      )
    )
      throw new Error("invalid number");
    const n = typeof v === "number" ? v : Number(v.trim().replace(",", "."));
    if (!Number.isFinite(n) || (!signed && n < 0))
      throw new Error("invalid number");
    return n;
  };
  for (let i = 1; i < grid.length; i++) {
    const raw = grid[i];
    if (raw.every((v) => v === null || v === undefined || v === "")) continue;
    try {
      if (raw.length > HEADERS.length || raw[0] !== "production-sheets-v1")
        throw new Error("invalid template");
      const id = string(raw[2], true);
      let g = groups.get(id);
      if (!g) {
        g = {
          sheet: null,
          chunks: [],
          lines: [],
          measurements: [],
          equipmentIds: [],
          firstRow: i + 1,
        };
        groups.set(id, g);
      }
      const r = Object.fromEntries(HEADERS.map((h, n) => [h, raw[n]]));
      switch (r.row_type) {
        case "sheet": {
          if (g.sheet) throw new Error("duplicate sheet row");
          if (!["draft", "validated"].includes(String(r.status)))
            throw new Error("invalid status");
          const now = new Date().toISOString();
          g.sheet = {
            id: createProductionDocumentId(),
            importSourceId: id,
            correctionOf: null,
            batchDate: string(r.batch_date, true),
            recipeId: "imported",
            recipeTitle: string(r.recipe_title, true),
            recipeVersion: string(r.recipe_version, true),
            plannedPortions: number(r.planned_portions)!,
            status: "draft",
            validatedAt: null,
            responsible: string(r.responsible),
            actualWeightGrams: number(r.actual_weight_g, true),
            actualPortions: number(r.actual_portions, true),
            equipmentIds: [],
            lines: [],
            measurements: [],
            notes: string(r.notes),
            recipeSnapshot: "",
            voucherId: createProductionDocumentId(),
            createdAt: now,
            updatedAt: now,
          };
          break;
        }
        case "ingredient":
          g.lines.push({
            id: createProductionDocumentId(),
            catalogId: null,
            name: string(r.name, true),
            unit: string(
              r.unit,
              true,
            ) as ProductionSheet["lines"][number]["unit"],
            plannedQuantity: number(r.planned_quantity)!,
            plannedCost: number(r.planned_cost)!,
            unitCost: number(r.unit_cost)!,
            actualQuantity: number(r.actual_quantity, true),
            lot: string(r.lot),
            supplier: string(r.supplier),
          });
          break;
        case "measurement":
          g.measurements.push({
            id: createProductionDocumentId(),
            stage: string(r.stage, true),
            recordedAt: string(r.recorded_at, true),
            temperatureC: number(r.temperature_c, true, true),
            durationMinutes: number(r.duration_minutes, true),
            correctiveAction: string(r.corrective_action),
          });
          break;
        case "equipment":
          g.equipmentIds.push(string(r.equipment_id, true));
          break;
        case "snapshot":
          g.chunks.push(string(r.snapshot_chunk, true));
          break;
        default:
          throw new Error("invalid row_type");
      }
    } catch (e) {
      errors.push(
        `Row ${i + 1}: ${e instanceof Error ? e.message : "invalid record"}`,
      );
    }
  }
  const seen = new Set(existing.flatMap((s) => [s.id, s.importSourceId ?? ""]));
  for (const [id, g] of groups) {
    try {
      if (!g.sheet) throw new Error("missing sheet row");
      const s = {
        ...g.sheet,
        lines: g.lines,
        measurements: g.measurements,
        equipmentIds: g.equipmentIds,
        recipeSnapshot: g.chunks.length
          ? g.chunks.join("")
          : JSON.stringify({
              externalRecipe: true,
              title: g.sheet.recipeTitle,
              version: g.sheet.recipeVersion,
              lines: g.lines,
            }),
      };
      JSON.parse(s.recipeSnapshot);
      if (!normalizeProductionSheet(s))
        throw new Error(
          "invalid date, numeric value, unit or incomplete sheet",
        );
      if (seen.has(id)) {
        skipped++;
        continue;
      }
      records.push(s);
    } catch (e) {
      errors.push(
        `Row ${g.firstRow}: ${e instanceof Error ? e.message : "invalid sheet"}`,
      );
    }
  }
  return { errors, records: errors.length ? [] : records, skipped };
}
export function productionSheetsHtml(
  sheets: readonly ProductionSheet[],
  locale: "ro" | "en" = "ro",
) {
  const ro = locale === "ro";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{font:12px Arial;margin:24px;color:#172d37}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #bbb;padding:6px;text-align:left;overflow-wrap:anywhere}section{page-break-after:always}h1{font-size:20px}@media print{thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body>${sheets
    .map((s) => {
      const t = productionSheetTotals(s);
      return `<section><h1>${esc(ro ? "Fișă de producție" : "Production sheet")}: ${esc(s.recipeTitle)}</h1><p>${esc(s.batchDate)} · ${esc(s.status)} · ${esc(s.id)}</p><p>${esc(ro ? "Versiune rețetă" : "Recipe version")}: ${esc(s.recipeVersion)} · ${esc(ro ? "Responsabil" : "Responsible")}: ${esc(s.responsible)}</p><p>${esc(ro ? "Porții planificate / reale; greutate reală (g)" : "Planned / actual portions; measured weight (g)")}: ${s.plannedPortions} / ${esc(s.actualPortions ?? "—")}; ${esc(s.actualWeightGrams ?? "—")}</p><table><thead><tr>${(ro ? ["Ingredient", "Unitate", "Plan", "Real", "Lot", "Furnizor", "Cost plan", "Cost real"] : ["Ingredient", "Unit", "Plan", "Actual", "Lot", "Supplier", "Planned cost", "Actual cost"]).map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${s.lines.map((l) => `<tr>${[l.name, l.unit, l.plannedQuantity, l.actualQuantity ?? "—", l.lot, l.supplier, l.plannedCost, l.actualQuantity === null ? "—" : (l.actualQuantity * l.unitCost).toFixed(2)].map((x) => `<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table><p>${esc(ro ? "Cost plan / real / diferență" : "Planned / actual cost / variance")}: ${t.plannedCost} / ${esc(t.actualCost ?? "—")} / ${esc(t.variance ?? "—")}</p><p>${esc(ro ? "Utilaje" : "Equipment")}: ${s.equipmentIds.map(esc).join(", ")}</p><table><tr>${(ro ? ["Etapă", "Înregistrat", "°C", "Minute", "Corecție"] : ["Stage", "Recorded", "°C", "Minutes", "Corrective action"]).map((x) => `<th>${x}</th>`).join("")}</tr>${s.measurements.map((m) => `<tr>${[m.stage, m.recordedAt, m.temperatureC ?? "—", m.durationMinutes ?? "—", m.correctiveAction].map((x) => `<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</table><p>${esc(s.notes)}</p><p>${esc(ro ? "Validat la" : "Validated at")}: ${esc(s.validatedAt ?? "—")}</p></section>`;
    })
    .join("")}</body></html>`;
}
