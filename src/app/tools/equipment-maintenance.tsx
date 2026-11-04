import { useEffect, useRef, useState } from "react";
import { Alert, Switch, Text, View } from "react-native";
import { ToolHeader } from "@/components/tool-header";
import { AppButton, Body, Card, Field, Screen } from "@/components/ui";
import { Select } from "@/components/inputs";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/locale-context";
import { useSubscription } from "@/contexts/subscription-context";
import {
  finishMaintenance,
  emptyAsset,
  emptyMaintenance,
  loadEquipmentRegistry,
  loadMaintenance,
  maintenanceStatus,
  resolveEquipment,
  resolveMaintenance,
  saveEquipment,
  saveMaintenance,
} from "@/lib/equipment-maintenance";
import {
  equipmentGrid,
  maintenanceGrid,
  equipmentPdf,
  parseEquipmentTransfer,
} from "@/lib/equipment-maintenance-transfer";
import {
  exportOperationsGrid,
  exportOperationsPdf,
  pickOperationsGrid,
} from "@/lib/operations-transfer-files";
import { operationalSyncLabel } from "@/lib/operational-sync";
import { localIsoDate } from "@/lib/local-date-time";
import type {
  EquipmentAsset,
  MaintenanceEntry,
} from "@/types/equipment-maintenance";
const maintenanceNumericKeys = [
  "recurrenceDays",
  "estimatedParts",
  "estimatedLabor",
  "estimatedTravel",
  "estimatedConsumables",
] as const;
type MaintenanceNumericKey = (typeof maintenanceNumericKeys)[number];
export default function EquipmentMaintenanceScreen() {
  const { user } = useAuth();
  const userId = user?.id ?? "demo";
  return <EquipmentMaintenanceSession key={userId} userId={userId} />;
}
function EquipmentMaintenanceSession({ userId }: { userId: string }) {
  const { locale } = useI18n();
  const { isViewer } = useSubscription();
  const l = (ro: string, en: string) => (locale === "ro" ? ro : en);
  const owner = useRef(userId);
  const busyAction = useRef(false);
  const [assets, setAssets] = useState<EquipmentAsset[]>([]);
  const [entries, setEntries] = useState<MaintenanceEntry[]>([]);
  const [asset, setAsset] = useState<EquipmentAsset | null>(null);
  const [entry, setEntry] = useState<MaintenanceEntry | null>(null);
  const [numericInputs, setNumericInputs] = useState<
    Partial<Record<MaintenanceNumericKey, string>>
  >({});
  const selectEntry = (next: MaintenanceEntry) => {
    setEntry(next);
    setNumericInputs(
      Object.fromEntries(
        maintenanceNumericKeys.map((key) => [key, String(next[key])]),
      ),
    );
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ReturnType<
    typeof parseEquipmentTransfer
  > | null>(null);
  const [actualDate, setActualDate] = useState("");
  const [parts, setParts] = useState("");
  const [labor, setLabor] = useState("");
  const [travel, setTravel] = useState("");
  const [consumables, setConsumables] = useState("");
  const refresh = async (id = userId) => {
    const [a, m] = await Promise.all([
      loadEquipmentRegistry(id),
      loadMaintenance(id),
    ]);
    if (owner.current === id) {
      setAssets(a);
      setEntries(m);
    }
  };
  useEffect(() => {
    owner.current = userId;
    setAssets([]);
    setEntries([]);
    setAsset(null);
    setEntry(null);
    setPreview(null);
    setError("");
    setBusy(false);
    void refresh(userId).catch((e) => {
      if (owner.current === userId) setError(String(e));
    });
    return () => {
      owner.current = "";
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (fn: (id: string) => Promise<void>) => {
    const id = userId;
    if (busyAction.current) return;
    busyAction.current = true;
    setBusy(true);
    setError("");
    try {
      await fn(id);
      if (owner.current === id) await refresh(id);
    } catch (e) {
      if (owner.current === id)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      busyAction.current = false;
      if (owner.current === id) setBusy(false);
    }
  };
  const still = (id: string) => {
    if (owner.current !== id) throw Error("Account changed");
  };
  const number = (v: string) => {
    if (!/^\d+(?:[.,]\d+)?$/.test(v)) return NaN;
    return Number(v.replace(",", "."));
  };
  const entryForSave = () => {
    if (!entry) throw Error(l("Selectează lucrarea.", "Select a task."));
    const parsed = { ...entry };
    for (const key of maintenanceNumericKeys) {
      const value = number(numericInputs[key] ?? String(entry[key]));
      if (
        !Number.isFinite(value) ||
        value < 0 ||
        (key === "recurrenceDays" &&
          (!Number.isSafeInteger(value) || value > 36500))
      )
        throw Error(
          l(
            "Introdu costuri finite pozitive sau zero și recurența în zile întregi (0–36500).",
            "Enter finite nonnegative costs and whole recurrence days (0–36500).",
          ),
        );
      parsed[key] = value;
    }
    return parsed;
  };
  const transfer = (
    kind: "assets" | "entries",
    format: "xlsx" | "csv" | "pdf",
    single = false,
  ) =>
    run(async () => {
      const grid =
        kind === "assets"
          ? equipmentGrid(single && asset ? [asset] : assets)
          : maintenanceGrid(single && entry ? [entry] : entries);
      if (format === "pdf")
        await exportOperationsPdf(
          kind,
          equipmentPdf(
            l("Utilaje și mentenanță", "Equipment and maintenance"),
            grid,
            locale,
          ),
        );
      else await exportOperationsGrid(kind, grid, format);
    });
  const buttons = (kind: "assets" | "entries", single = false) => (
    <View
      style={{
        gap: 8,
      }}
    >
      {(["xlsx", "csv", "pdf"] as const).map((f) => (
        <AppButton
          key={f}
          variant="secondary"
          disabled={busy}
          label={`${l("Exportă", "Export")} ${f.toUpperCase()}${single ? l(" fișă", " sheet") : ""}`}
          onPress={() => void transfer(kind, f, single)}
        />
      ))}
    </View>
  );
  const conflicts = (
    item: EquipmentAsset | MaintenanceEntry,
    kind: "asset" | "entry",
  ) =>
    item.syncState === "conflict" ? (
      <View
        style={{
          gap: 8,
        }}
      >
        {(["local", "remote"] as const).map((choice) => (
          <AppButton
            key={choice}
            disabled={busy || isViewer}
            label={
              choice === "local"
                ? l("Păstrează versiunea locală", "Keep local version")
                : l("Folosește versiunea cloud", "Use cloud version")
            }
            onPress={() =>
              void run(async (id) => {
                still(id);
                await (
                  kind === "asset" ? resolveEquipment : resolveMaintenance
                )(id, item.id, choice);
                still(id);
                setAsset(null);
                setEntry(null);
              })
            }
          />
        ))}
      </View>
    ) : null;
  return (
    <Screen>
      <ToolHeader
        title={l("Utilaje și mentenanță", "Equipment and maintenance")}
        subtitle={l(
          "Registru comun HACCP • istoric și costuri",
          "Shared HACCP registry • history and costs",
        )}
      />
      <Card>
        <Body>
          {l(
            "POLIDOM: integrare în așteptarea documentației API. Nu sunt trimise solicitări automate.",
            "POLIDOM: awaiting API documentation. No automatic requests are sent.",
          )}
        </Body>
        <Body>
          {l(
            "Șabloane: exportă un registru sau o fișă; păstrează anteturile. Date AAAA-LL-ZZ; costuri ≥ 0; recurență în zile (0 = fără). ID-urile existente sunt omise. Lucrările importate rămân neconfirmate; data și costurile sursă sunt păstrate în note. Tip: cleaning, upkeep, preventive, repair. available: true/false.",
            "Templates: export a list or sheet; retain headers. Dates YYYY-MM-DD; costs ≥ 0; recurrence in days (0 = none). Existing IDs are skipped. Imported tasks remain unconfirmed; source dates and costs are retained in notes. kind: cleaning, upkeep, preventive, repair. available: true/false.",
          )}
        </Body>
      </Card>
      {!!error && (
        <Card>
          <Body>{error}</Body>
        </Card>
      )}
      <AppButton
        label={l("Reîncarcă / sincronizează", "Reload / sync")}
        disabled={busy}
        onPress={() => void run(async () => {})}
      />
      <AppButton
        label={l("Importă XLSX / CSV", "Import XLSX / CSV")}
        disabled={busy || isViewer}
        onPress={() =>
          void run(async (id) => {
            const g = await pickOperationsGrid();
            still(id);
            if (g) setPreview(parseEquipmentTransfer(g));
          })
        }
      />
      {preview && (
        <Card>
          <Body>
            {`${preview.assets.length} ${l("utilaje", "assets")} / ${preview.entries.length} ${l("lucrări", "tasks")}`}
          </Body>
          {preview.errors.map((e, i) => (
            <Body key={i}>{e}</Body>
          ))}
          <Body>
            {l(
              "Previzualizare — confirmarea adaugă doar ID-uri noi.",
              "Preview — confirmation adds new IDs only.",
            )}
          </Body>
          {preview.assets.map((a) => (
            <Body key={a.id}>
              {`${a.id}: ${a.name}${assets.some((x) => x.id === a.id) ? l(" (omis)", " (skipped)") : ""}`}
            </Body>
          ))}
          {preview.entries.map((a) => (
            <Body key={a.id}>{`${a.dueDate}: ${a.title} → ${a.assetId}`}</Body>
          ))}
          <AppButton
            disabled={busy || isViewer || !!preview.errors.length}
            label={l("Confirmă importul", "Confirm import")}
            onPress={() =>
              void run(async (id) => {
                const registry = await loadEquipmentRegistry(id);
                const tasks = await loadMaintenance(id);
                still(id);
                if (
                  preview.entries.some(
                    (e) => !registry.some((a) => a.id === e.assetId),
                  )
                )
                  throw Error(
                    l(
                      "Import respins: utilaj necunoscut.",
                      "Import rejected: unknown equipment.",
                    ),
                  );
                for (const a of preview.assets) {
                  still(id);
                  if (!registry.some((x) => x.id === a.id))
                    await saveEquipment(id, a);
                }
                for (const e of preview.entries) {
                  still(id);
                  if (!tasks.some((x) => x.id === e.id))
                    await saveMaintenance(id, e);
                }
                still(id);
                setPreview(null);
              })
            }
          />
          <AppButton
            variant="secondary"
            label={l("Anulează", "Cancel")}
            onPress={() => setPreview(null)}
          />
        </Card>
      )}
      <Card>
        <Text
          style={{
            fontSize: 19,
            fontWeight: "700",
          }}
        >
          {l("Registru utilaje", "Equipment registry")}
        </Text>
        <AppButton
          disabled={isViewer || busy}
          label={l(
            "Adaugă utilaj fără temperatură",
            "Add equipment without temperatures",
          )}
          onPress={() => {
            setAsset(emptyAsset());
            setEntry(null);
          }}
        />
        {buttons("assets")}
        {assets.map((a) => (
          <View
            key={a.id}
            style={{
              paddingVertical: 10,
              gap: 6,
            }}
          >
            <Text
              style={{
                fontWeight: "700",
              }}
            >
              {a.name} {a.haccp ? "• HACCP" : ""}
            </Text>
            <Body>
              {`${a.available ? l("Disponibil", "Available") : l("Indisponibil", "Out of service")} • ${operationalSyncLabel(a, locale)}`}
            </Body>
            <AppButton
              variant="secondary"
              label={l("Fișă și istoric", "Sheet and history")}
              onPress={() => {
                setAsset(a);
                setEntry(null);
              }}
            />
          </View>
        ))}
      </Card>
      {asset && (
        <Card>
          <Text
            style={{
              fontSize: 19,
              fontWeight: "700",
            }}
          >
            {l("Fișă utilaj", "Equipment sheet")}
          </Text>
          {(
            [
              "name",
              "brand",
              "location",
              "model",
              "serial",
              "provider",
              "acquisitionDate",
              "warrantyDate",
              "manual",
              "photo",
              "notes",
            ] as const
          ).map((key, i) => (
            <Field
              key={key}
              editable={!isViewer && !busy && !(key === "name" && asset.haccp)}
              label={
                [
                  l("Denumire", "Name"),
                  l("Marcă", "Brand"),
                  l("Locație", "Location"),
                  "Model",
                  l("Serie", "Serial"),
                  l("Furnizor service", "Service provider"),
                  l("Achiziție AAAA-LL-ZZ", "Acquisition YYYY-MM-DD"),
                  l("Garanție AAAA-LL-ZZ", "Warranty YYYY-MM-DD"),
                  l("URL / referință manual", "Manual URL / reference"),
                  l("URL / referință foto", "Photo URL / reference"),
                  l("Note", "Notes"),
                ][i]
              }
              value={asset[key]}
              onChangeText={(v) =>
                setAsset({
                  ...asset,
                  [key]: v,
                })
              }
            />
          ))}
          <Body>{l("Disponibil pentru utilizare", "Available for use")}</Body>
          <Switch
            disabled={busy || isViewer}
            value={asset.available}
            onValueChange={(v) =>
              setAsset({
                ...asset,
                available: v,
              })
            }
          />
          {asset.haccp && (
            <Body>
              {l(
                "Denumirea și dezactivarea HACCP se modifică în setările HACCP.",
                "HACCP name and deactivation are managed in HACCP settings.",
              )}
            </Body>
          )}
          {conflicts(asset, "asset")}
          <AppButton
            disabled={busy || isViewer}
            label={l("Salvează utilaj", "Save equipment")}
            onPress={() =>
              void run(async (id) => {
                still(id);
                const saved = await saveEquipment(id, asset);
                still(id);
                setAsset(saved);
              })
            }
          />
          {buttons("assets", true)}
          <AppButton
            disabled={
              busy || isViewer || !assets.some((a) => a.id === asset.id)
            }
            label={l("Programează lucrare", "Schedule task")}
            onPress={() => {
              selectEntry(emptyMaintenance(asset.id));
              setActualDate("");
              setParts("");
              setLabor("");
              setTravel("");
              setConsumables("");
            }}
          />
          <Text
            style={{
              fontWeight: "700",
            }}
          >
            {l("Istoric și programări", "History and schedule")}
          </Text>
          {entries
            .filter((e) => e.assetId === asset.id)
            .map((e) => (
              <AppButton
                key={e.id}
                variant="secondary"
                label={`${e.dueDate} • ${e.title} • ${e.completedDate ? l("Finalizat", "Completed") : e.dueDate < localIsoDate() ? l("Restant", "Overdue") : l("Programat", "Scheduled")}`}
                onPress={() => {
                  selectEntry(e);
                  setActualDate(e.completedDate);
                  setParts(e.actualParts === null ? "" : String(e.actualParts));
                  setLabor(e.actualLabor === null ? "" : String(e.actualLabor));
                  setTravel(
                    e.actualTravel === null ? "" : String(e.actualTravel),
                  );
                  setConsumables(
                    e.actualConsumables === null
                      ? ""
                      : String(e.actualConsumables),
                  );
                }}
              />
            ))}
        </Card>
      )}
      <Card>
        <Text
          style={{
            fontSize: 19,
            fontWeight: "700",
          }}
        >
          {l("Toate lucrările", "All tasks")}
        </Text>
        {buttons("entries")}
        {entries.map((e) => (
          <AppButton
            key={e.id}
            variant="secondary"
            label={`${e.dueDate} • ${assets.find((a) => a.id === e.assetId)?.name ?? e.assetId} • ${e.title} • ${maintenanceStatus(e, localIsoDate()) === "overdue" ? l("Restant", "Overdue") : e.completedDate ? l("Finalizat", "Completed") : l("Programat", "Scheduled")}`}
            onPress={() => {
              selectEntry(e);
              setActualDate(e.completedDate);
              setParts(e.actualParts === null ? "" : String(e.actualParts));
              setLabor(e.actualLabor === null ? "" : String(e.actualLabor));
              setTravel(e.actualTravel === null ? "" : String(e.actualTravel));
              setConsumables(
                e.actualConsumables === null ? "" : String(e.actualConsumables),
              );
            }}
          />
        ))}
      </Card>
      {entry && (
        <Card>
          <Text
            style={{
              fontSize: 19,
              fontWeight: "700",
            }}
          >
            {l("Fișă lucrare", "Maintenance sheet")}
          </Text>
          <Body>
            {`${assets.find((a) => a.id === entry.assetId)?.name ?? entry.assetId} • ${operationalSyncLabel(entry, locale)}`}
          </Body>
          {!entry.completedDate && (
            <Select
              label={l("Tip", "Type")}
              value={entry.kind}
              placeholder=""
              options={[
                {
                  value: "cleaning",
                  label: l("Curățare", "Cleaning"),
                },
                {
                  value: "upkeep",
                  label: l("Întreținere", "Upkeep"),
                },
                {
                  value: "preventive",
                  label: l("Mentenanță preventivă", "Preventive maintenance"),
                },
                {
                  value: "repair",
                  label: l("Reparație", "Repair"),
                },
              ]}
              onChange={(v) => {
                if (v)
                  setEntry({
                    ...entry,
                    kind: v,
                  });
              }}
            />
          )}
          {(
            [
              "title",
              "responsible",
              "dueDate",
              "recurrenceDays",
              "estimatedParts",
              "estimatedLabor",
              "estimatedTravel",
              "estimatedConsumables",
              "notes",
            ] as const
          ).map((key, i) => (
            <Field
              key={key}
              editable={!isViewer && !busy && !entry.completedDate}
              label={
                [
                  l("Lucrare", "Task"),
                  l("Responsabil", "Responsible"),
                  l("Scadență AAAA-LL-ZZ", "Due YYYY-MM-DD"),
                  l("Recurență zile", "Recurrence days"),
                  l("Piese estimate", "Estimated parts"),
                  l("Manoperă estimată", "Estimated labor"),
                  l("Deplasare estimată", "Estimated travel"),
                  l("Consumabile estimate", "Estimated consumables"),
                  l("Note", "Notes"),
                ][i]
              }
              keyboardType={
                maintenanceNumericKeys.includes(key as MaintenanceNumericKey)
                  ? "decimal-pad"
                  : "default"
              }
              value={
                maintenanceNumericKeys.includes(key as MaintenanceNumericKey)
                  ? (numericInputs[key as MaintenanceNumericKey] ??
                    String(entry[key]))
                  : String(entry[key])
              }
              onChangeText={(v) => {
                if (
                  maintenanceNumericKeys.includes(key as MaintenanceNumericKey)
                )
                  setNumericInputs((current) => ({ ...current, [key]: v }));
                else setEntry({ ...entry, [key]: v });
              }}
            />
          ))}
          <Body>
            {`${l("Total estimat", "Estimated total")}: ${["estimatedParts", "estimatedLabor", "estimatedTravel", "estimatedConsumables"].every((key) => Number.isFinite(number(numericInputs[key as MaintenanceNumericKey] ?? String(entry[key as MaintenanceNumericKey])))) ? ["estimatedParts", "estimatedLabor", "estimatedTravel", "estimatedConsumables"].reduce((sum, key) => sum + number(numericInputs[key as MaintenanceNumericKey] ?? String(entry[key as MaintenanceNumericKey])), 0) : "—"}`}
          </Body>
          {conflicts(entry, "entry")}
          {!entry.completedDate && (
            <AppButton
              disabled={busy || isViewer}
              label={l("Salvează programarea", "Save schedule")}
              onPress={() =>
                void run(async (id) => {
                  still(id);
                  const saved = await saveMaintenance(id, entryForSave());
                  still(id);
                  selectEntry(saved);
                })
              }
            />
          )}
          <Field
            editable={!entry.completedDate && !isViewer}
            label={l("Data efectivă AAAA-LL-ZZ", "Actual date YYYY-MM-DD")}
            value={actualDate}
            onChangeText={setActualDate}
          />
          <Field
            editable={!entry.completedDate && !isViewer}
            label={l("Cost efectiv piese", "Actual parts cost")}
            value={parts}
            onChangeText={setParts}
          />
          <Field
            editable={!entry.completedDate && !isViewer}
            label={l("Cost efectiv manoperă", "Actual labor cost")}
            value={labor}
            onChangeText={setLabor}
          />
          <Field
            editable={!entry.completedDate && !isViewer}
            label={l("Cost efectiv deplasare", "Actual travel cost")}
            value={travel}
            onChangeText={setTravel}
          />
          <Field
            editable={!entry.completedDate && !isViewer}
            label={l("Cost efectiv consumabile", "Actual consumables cost")}
            value={consumables}
            onChangeText={setConsumables}
          />
          {entry.completedDate ? (
            <Body>
              {`${l("Finalizat explicit", "Explicitly completed")}: ${entry.completedDate} • ${l("Total efectiv", "Actual total")}: ${(entry.actualParts ?? 0) + (entry.actualLabor ?? 0) + (entry.actualTravel ?? 0) + (entry.actualConsumables ?? 0)}`}
            </Body>
          ) : (
            <AppButton
              disabled={busy || isViewer}
              label={l("Confirmă finalizarea", "Confirm completion")}
              onPress={() =>
                Alert.alert(
                  l("Finalizare lucrare", "Complete task"),
                  l(
                    "Salvezi data și costurile efective introduse?",
                    "Save the actual date and costs entered?",
                  ),
                  [
                    {
                      text: l("Anulează", "Cancel"),
                      style: "cancel",
                    },
                    {
                      text: l("Confirmă", "Confirm"),
                      onPress: () =>
                        void run(async (id) => {
                          still(id);
                          const completed = await finishMaintenance(
                            id,
                            entryForSave(),
                            actualDate,
                            number(parts),
                            number(labor),
                            number(travel),
                            number(consumables),
                          );
                          still(id);
                          selectEntry(completed);
                        }),
                    },
                  ],
                )
              }
            />
          )}
          {buttons("entries", true)}
        </Card>
      )}
    </Screen>
  );
}
