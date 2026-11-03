import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { ToolHeader } from "@/components/tool-header";
import {
  AppButton,
  Body,
  Card,
  Field as BaseField,
  Screen,
  SectionHeader,
} from "@/components/ui";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/locale-context";
import { useWorkspace } from "@/contexts/workspace-context";
import { loadEquipmentRegistry } from "@/lib/equipment-maintenance";
import { localIsoDate } from "@/lib/local-date-time";
import { operationalSyncLabel } from "@/lib/operational-sync";
import {
  copyProductionSheet,
  createProductionSheet,
  createProductionSheetVoucher,
  importProductionSheets,
  loadProductionSheets,
  productionSheetTotals,
  resolveProductionSheet,
  saveProductionSheet,
  validateProductionSheet,
} from "@/lib/production-sheets";
import {
  previewProductionSheetsImport,
  productionSheetsGrid,
  productionSheetsHtml,
} from "@/lib/production-sheets-transfer";
import {
  exportOperationsGrid,
  exportOperationsPdf,
  pickOperationsGrid,
} from "@/lib/operations-transfer-files";
import { createProductionDocumentId } from "@/lib/production-documents-repository";
import type { ProductionSheet } from "@/types/production-sheet";
function Field(props: React.ComponentProps<typeof BaseField>) {
  const [raw, setRaw] = useState(props.value ?? "");
  const numberInput =
    props.keyboardType === "decimal-pad" ||
    props.keyboardType === "numbers-and-punctuation";
  return (
    <BaseField
      {...props}
      value={numberInput ? raw : props.value}
      onChangeText={(v) => {
        setRaw(v);
        props.onChangeText?.(v);
      }}
    />
  );
}
const numeric = (s: string): number | null =>
  s.trim() === ""
    ? null
    : /^\d+([.,]\d+)?$/.test(s.trim())
      ? Number(s.replace(",", "."))
      : NaN;
export default function ProductionSheetsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id ?? "demo";
  const { locale } = useI18n();
  const ro = locale === "ro";
  const tr = (a: string, b: string) => (ro ? a : b);
  const { recipes, catalog } = useWorkspace();
  const params = useLocalSearchParams<{
    recipeId?: string;
    portions?: string;
  }>();
  const [sheets, setSheets] = useState<ProductionSheet[]>([]);
  const [sheet, setSheet] = useState<ProductionSheet | null>(null);
  const [equipment, setEquipment] = useState<
    {
      id: string;
      name: string;
      available: boolean;
    }[]
  >([]);
  const [query, setQuery] = useState("");
  const [portions, setPortions] = useState("1");
  const [date, setDate] = useState(localIsoDate());
  const [reload, setReload] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ReturnType<
    typeof previewProductionSheetsImport
  > | null>(null);
  const active = useRef(userId);
  const prefilled = useRef("");
  useEffect(() => {
    active.current = userId;
    setReady(false);
    setBusy(false);
    setSheets([]);
    setSheet(null);
    setPreview(null);
    setEquipment([]);
    setError("");
    let alive = true;
    void Promise.all([
      loadProductionSheets(userId),
      loadEquipmentRegistry(userId),
    ])
      .then(([s, e]) => {
        if (alive) {
          setSheets(s);
          setEquipment(e);
          setReady(true);
        }
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [userId, reload]);
  useEffect(() => {
    if (
      !ready ||
      !params.recipeId ||
      prefilled.current === `${userId}:${params.recipeId}`
    )
      return;
    const r = recipes.find((r) => r.id === params.recipeId);
    if (!r) return;
    try {
      setSheet(
        createProductionSheet(
          r,
          recipes,
          catalog,
          numeric(params.portions ?? "1") ?? 1,
          date,
        ),
      );
      prefilled.current = `${userId}:${params.recipeId}`;
    } catch (e) {
      setError(String(e));
    }
  }, [ready, params.recipeId, params.portions, userId, recipes, catalog, date]);
  const run = async (fn: () => Promise<void>) => {
    if (busy || !ready) return;
    const owner = userId;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (active.current === owner)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (active.current === owner) setBusy(false);
    }
  };
  const change = (patch: Partial<ProductionSheet>) =>
    setSheet((s) => (s?.status === "draft" ? { ...s, ...patch } : s));
  const save = async (s: ProductionSheet) => {
    const owner = userId;
    const saved = await saveProductionSheet(owner, s);
    const next = await loadProductionSheets(owner);
    if (active.current === owner) {
      setSheet(saved);
      setSheets(next);
    }
  };
  const transfers = (items: ProductionSheet[]) => (
    <View style={{ gap: 8 }}>
      {(["xlsx", "csv"] as const).map((f) => (
        <AppButton
          key={f}
          label={`${tr("Exportă", "Export")} ${f.toUpperCase()}`}
          disabled={busy || !items.length}
          variant="secondary"
          onPress={() =>
            void run(() =>
              exportOperationsGrid(
                "production-sheets",
                productionSheetsGrid(items),
                f,
              ),
            )
          }
        />
      ))}
      <AppButton
        label={tr("Exportă PDF", "Export PDF")}
        disabled={busy || !items.length}
        variant="secondary"
        onPress={() =>
          void run(() =>
            exportOperationsPdf(
              "production-sheets",
              productionSheetsHtml(items, locale),
            ),
          )
        }
      />
    </View>
  );
  const locked = sheet?.status === "validated";
  const totals = sheet ? productionSheetTotals(sheet) : null;
  return (
    <Screen>
      <ToolHeader
        title={tr("Fișe de producție", "Production sheets")}
        subtitle={tr(
          "Loturi, consumuri reale și trasabilitate",
          "Batches, actual consumption and traceability",
        )}
      />
      {!!error && (
        <Card>
          <Body>{error}</Body>
        </Card>
      )}
      {!ready && !!error && (
        <AppButton
          label={tr("Reîncearcă încărcarea", "Retry loading")}
          onPress={() => setReload((v) => v + 1)}
        />
      )}
      {!ready && (
        <Body>
          {tr("Se încarcă datele contului…", "Loading account data…")}
        </Body>
      )}
      <Card>
        <SectionHeader
          title={tr("Fișă nouă din rețetă", "New sheet from recipe")}
        />
        <Field
          label={tr("Data YYYY-MM-DD", "Date YYYY-MM-DD")}
          value={date}
          onChangeText={setDate}
        />
        <Field
          label={tr("Porții planificate", "Planned portions")}
          keyboardType="decimal-pad"
          value={portions}
          onChangeText={setPortions}
        />
        <Field
          label={tr("Caută rețetă", "Search recipes")}
          value={query}
          onChangeText={setQuery}
        />
        {recipes
          .filter((r) =>
            r.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
          )
          .slice(0, 8)
          .map((r) => (
            <AppButton
              key={r.id}
              label={r.title}
              disabled={!ready || busy}
              variant="secondary"
              onPress={() => {
                try {
                  setSheet(
                    createProductionSheet(
                      r,
                      recipes,
                      catalog,
                      numeric(portions) ?? 0,
                      date,
                    ),
                  );
                  setError("");
                } catch (e) {
                  setError(String(e));
                }
              }}
            />
          ))}
      </Card>
      <Card>
        <SectionHeader
          title={tr("Registru și transfer", "Register and transfer")}
        />
        <Body>
          {tr(
            "Șablon: exportă o fișă, păstrează antetul production-sheets-v1. Cantitățile sunt în kg/l/buc. Date YYYY-MM-DD; rânduri sheet, ingredient, measurement, equipment și snapshot. Importurile devin ciorne fără semnătură; identitățile deja prezente sunt omise.",
            "Template: export a sheet and keep the production-sheets-v1 header. Quantities use kg/l/units. Dates YYYY-MM-DD; use sheet, ingredient, measurement, equipment and snapshot rows. Imports become unsigned drafts; existing identities are skipped.",
          )}
        </Body>
        {transfers(sheets)}
        <AppButton
          label={tr("Importă Excel / CSV", "Import Excel / CSV")}
          disabled={!ready || busy}
          onPress={() =>
            void run(async () => {
              const grid = await pickOperationsGrid();
              if (grid && active.current === userId)
                setPreview(previewProductionSheetsImport(grid, sheets));
            })
          }
        />
        {preview && (
          <Card>
            <Body>{`${preview.records.length} ${tr("ciorne noi", "new drafts")} · ${preview.skipped} ${tr("omise", "skipped")}`}</Body>
            {preview.errors.map((e, i) => (
              <Body key={i}>{e}</Body>
            ))}
            {preview.records.map((s) => (
              <Body key={s.id}>
                {s.batchDate} · {s.recipeTitle} · {s.plannedPortions}
              </Body>
            ))}
            <AppButton
              label={tr(
                "Confirmă importul previzualizat",
                "Confirm previewed import",
              )}
              disabled={
                busy || !!preview.errors.length || !preview.records.length
              }
              onPress={() =>
                void run(async () => {
                  await importProductionSheets(userId, preview.records);
                  const next = await loadProductionSheets(userId);
                  if (active.current === userId) {
                    setSheets(next);
                    setPreview(null);
                  }
                })
              }
            />
            <AppButton
              label={tr("Anulează", "Cancel")}
              variant="secondary"
              onPress={() => setPreview(null)}
            />
          </Card>
        )}
        {sheets.map((s) => (
          <AppButton
            key={s.id}
            label={`${s.batchDate} · ${s.recipeTitle} · ${s.status === "validated" ? tr("Validată", "Validated") : tr("Ciornă", "Draft")} · ${operationalSyncLabel(s, locale)}`}
            variant="secondary"
            onPress={() => setSheet(s)}
          />
        ))}
      </Card>
      {sheet && (
        <Card key={sheet.id}>
          <SectionHeader title={`${sheet.recipeTitle} · ${sheet.batchDate}`} />
          <Body>{`${tr("Versiune rețetă", "Recipe version")}: ${sheet.recipeVersion}\n${tr("Porții planificate", "Planned portions")}: ${sheet.plannedPortions}\n${operationalSyncLabel(sheet, locale)}`}</Body>
          {locked && (
            <Body>
              {tr(
                "Validată: modificările se fac printr-o copie nouă.",
                "Validated: corrections require a new copy.",
              )}
            </Body>
          )}
          <Field
            label={tr("Responsabil", "Responsible person")}
            value={sheet.responsible}
            editable={!locked}
            onChangeText={(responsible) => change({ responsible })}
          />
          <Field
            label={tr(
              "Greutate măsurată reală (g)",
              "Actual measured weight (g)",
            )}
            keyboardType="decimal-pad"
            value={
              sheet.actualWeightGrams === null
                ? ""
                : String(sheet.actualWeightGrams)
            }
            editable={!locked}
            onChangeText={(v) => change({ actualWeightGrams: numeric(v) })}
          />
          <Field
            label={tr("Porții reale", "Actual portions")}
            keyboardType="decimal-pad"
            value={
              sheet.actualPortions === null ? "" : String(sheet.actualPortions)
            }
            editable={!locked}
            onChangeText={(v) => change({ actualPortions: numeric(v) })}
          />
          <SectionHeader
            title={tr(
              "Consum planificat / real",
              "Planned / actual consumption",
            )}
          />
          {sheet.lines.map((l, i) => (
            <Card key={l.id}>
              <Body>{`${l.name} · ${l.plannedQuantity} ${l.unit} · ${l.plannedCost.toFixed(2)}`}</Body>
              <Field
                label={`${tr("Consum real", "Actual consumption")} (${l.unit})`}
                keyboardType="decimal-pad"
                value={
                  l.actualQuantity === null ? "" : String(l.actualQuantity)
                }
                editable={!locked}
                onChangeText={(v) =>
                  change({
                    lines: sheet.lines.map((x, n) =>
                      n === i ? { ...x, actualQuantity: numeric(v) } : x,
                    ),
                  })
                }
              />
              <Field
                label={tr("Lot", "Lot")}
                value={l.lot}
                editable={!locked}
                onChangeText={(v) =>
                  change({
                    lines: sheet.lines.map((x, n) =>
                      n === i ? { ...x, lot: v } : x,
                    ),
                  })
                }
              />
              <Field
                label={tr("Furnizor", "Supplier")}
                value={l.supplier}
                editable={!locked}
                onChangeText={(v) =>
                  change({
                    lines: sheet.lines.map((x, n) =>
                      n === i ? { ...x, supplier: v } : x,
                    ),
                  })
                }
              />
            </Card>
          ))}
          <Body>{`${tr("Cost plan / real / diferență", "Planned / actual cost / variance")}: ${totals?.plannedCost.toFixed(2)} / ${totals?.actualCost?.toFixed(2) ?? "—"} / ${totals?.variance?.toFixed(2) ?? "—"}\n${tr("Cost / porție; cost / kg", "Cost / portion; cost / kg")}: ${totals?.portionCost?.toFixed(2) ?? "—"}; ${totals?.costPerKg?.toFixed(2) ?? "—"}`}</Body>
          <SectionHeader title={tr("Utilaje folosite", "Equipment used")} />
          {equipment.map((e) => (
            <AppButton
              key={e.id}
              label={`${sheet.equipmentIds.includes(e.id) ? "✓ " : ""}${e.name}${e.available ? "" : tr(" — INDISPONIBIL", " — UNAVAILABLE")}`}
              variant="secondary"
              disabled={locked}
              onPress={() =>
                change({
                  equipmentIds: sheet.equipmentIds.includes(e.id)
                    ? sheet.equipmentIds.filter((id) => id !== e.id)
                    : [...sheet.equipmentIds, e.id],
                })
              }
            />
          ))}
          {sheet.equipmentIds.some(
            (id) => !equipment.find((e) => e.id === id)?.available,
          ) && (
            <Body>
              {tr(
                "Atenție: un utilaj selectat este indisponibil sau lipsește din registru.",
                "Warning: selected equipment is unavailable or missing from the register.",
              )}
            </Body>
          )}
          <SectionHeader
            title={tr(
              "Măsurători reale de proces",
              "Actual process measurements",
            )}
          />
          <Body>
            {tr(
              "Completează numai măsurători efectuate. Temperaturile și timpii nu sunt scalați cu porțiile.",
              "Enter only measurements actually taken. Temperatures and times are never scaled with portions.",
            )}
          </Body>
          {sheet.measurements.map((m, i) => {
            const edit = (p: Partial<typeof m>) =>
              change({
                measurements: sheet.measurements.map((x, n) =>
                  n === i ? { ...x, ...p } : x,
                ),
              });
            return (
              <Card key={m.id}>
                <Field
                  label={tr("Etapă", "Stage")}
                  value={m.stage}
                  editable={!locked}
                  onChangeText={(stage) => edit({ stage })}
                />
                <Field
                  label={tr("Măsurat la (ISO)", "Measured at (ISO)")}
                  value={m.recordedAt}
                  editable={!locked}
                  onChangeText={(recordedAt) => edit({ recordedAt })}
                />
                <Field
                  label="°C"
                  value={m.temperatureC === null ? "" : String(m.temperatureC)}
                  editable={!locked}
                  keyboardType="numbers-and-punctuation"
                  onChangeText={(v) =>
                    edit({
                      temperatureC:
                        v === ""
                          ? null
                          : /^-?\d+([.,]\d+)?$/.test(v)
                            ? Number(v.replace(",", "."))
                            : NaN,
                    })
                  }
                />
                <Field
                  label={tr("Minute reale", "Actual minutes")}
                  value={
                    m.durationMinutes === null ? "" : String(m.durationMinutes)
                  }
                  editable={!locked}
                  keyboardType="decimal-pad"
                  onChangeText={(v) => edit({ durationMinutes: numeric(v) })}
                />
                <Field
                  label={tr("Acțiune corectivă", "Corrective action")}
                  value={m.correctiveAction}
                  editable={!locked}
                  onChangeText={(correctiveAction) =>
                    edit({ correctiveAction })
                  }
                />
                {!locked && (
                  <AppButton
                    label={tr("Elimină măsurătoarea", "Remove measurement")}
                    variant="secondary"
                    onPress={() =>
                      change({
                        measurements: sheet.measurements.filter(
                          (x) => x.id !== m.id,
                        ),
                      })
                    }
                  />
                )}
              </Card>
            );
          })}
          {!locked && (
            <AppButton
              label={tr("Adaugă măsurătoare", "Add measurement")}
              variant="secondary"
              onPress={() =>
                change({
                  measurements: [
                    ...sheet.measurements,
                    {
                      id: createProductionDocumentId(),
                      stage: "",
                      recordedAt: "",
                      temperatureC: null,
                      durationMinutes: null,
                      correctiveAction: "",
                    },
                  ],
                })
              }
            />
          )}
          <Field
            label={tr("Note", "Notes")}
            multiline
            value={sheet.notes}
            editable={!locked}
            onChangeText={(notes) => change({ notes })}
          />
          {!locked && (
            <>
              <AppButton
                label={tr("Salvează ciorna", "Save draft")}
                disabled={busy}
                onPress={() => void run(() => save(sheet))}
              />
              <AppButton
                label={tr(
                  "Validează definitiv fișa",
                  "Validate sheet permanently",
                )}
                disabled={busy}
                onPress={() =>
                  void run(() => save(validateProductionSheet(sheet)))
                }
              />
            </>
          )}
          <AppButton
            label={tr(
              "Creează copie pentru corecție",
              "Create correction copy",
            )}
            disabled={busy}
            variant="secondary"
            onPress={() => setSheet(copyProductionSheet(sheet))}
          />
          {locked && (
            <AppButton
              label={tr(
                "Creează / deschide bon de consum",
                "Create / open consumption voucher",
              )}
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  const v = await createProductionSheetVoucher(
                    userId,
                    sheet.id,
                  );
                  if (active.current === userId)
                    router.push(
                      `/tools/consumption-vouchers?id=${v.id}` as Href,
                    );
                })
              }
            />
          )}
          <Body>
            {tr(
              "Bonul este creat numai la cerere, o singură dată. Fișa nu modifică automat stocul sau P&L.",
              "The voucher is created only on request, once. The sheet does not automatically change inventory or P&L.",
            )}
          </Body>
          {sheet.syncState === "conflict" &&
            (["remote", "local"] as const).map((choice) => (
              <AppButton
                key={choice}
                label={
                  choice === "remote"
                    ? tr("Păstrează versiunea cloud", "Keep cloud version")
                    : tr("Retrimite versiunea locală", "Resubmit local version")
                }
                onPress={() =>
                  void run(async () => {
                    const next = await resolveProductionSheet(
                      userId,
                      sheet.id,
                      choice,
                    );
                    if (active.current === userId) {
                      setSheets(next);
                      setSheet(next.find((s) => s.id === sheet.id) ?? null);
                    }
                  })
                }
              />
            ))}
          {transfers([sheet])}
        </Card>
      )}
    </Screen>
  );
}
