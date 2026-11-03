import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProductionSheet } from "@/types/production-sheet";
const state = vi.hoisted(() => ({
  sheets: [] as ProductionSheet[],
  save: vi.fn(),
  viewer: false,
  resolve: vi.fn(),
}));
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/contexts/locale-context", () => ({
  useI18n: () => ({ locale: "en" }),
}));
vi.mock("@/contexts/subscription-context", () => ({
  useSubscription: () => ({ isViewer: state.viewer }),
}));
vi.mock("@/contexts/workspace-context", () => ({
  useWorkspace: () => ({ recipes: [], catalog: [] }),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("react-native", () => ({ View: "View" }));
vi.mock("@/components/tool-header", () => ({ ToolHeader: "ToolHeader" }));
vi.mock("@/components/ui", () =>
  Object.fromEntries(
    ["AppButton", "Body", "Card", "Field", "Screen", "SectionHeader"].map(
      (n) => [n, n],
    ),
  ),
);
vi.mock("@/lib/equipment-maintenance", () => ({
  loadEquipmentRegistry: async () => [],
}));
vi.mock("@/lib/operational-sync", () => ({
  operationalSyncLabel: () => "local",
}));
vi.mock("@/lib/production-sheets", () => ({
  loadProductionSheets: async () => state.sheets,
  saveProductionSheet: state.save,
  productionSheetTotals: () => ({
    plannedCost: 10,
    actualCost: 10,
    variance: 0,
    portionCost: 1,
    costPerKg: 1,
  }),
  resolveProductionSheet: state.resolve,
  copyProductionSheet: vi.fn(),
  createProductionSheet: vi.fn(),
  createProductionSheetVoucher: vi.fn(),
  importProductionSheets: vi.fn(),
  validateProductionSheet: vi.fn(),
}));
vi.mock("@/lib/production-sheets-transfer", () => ({
  previewProductionSheetsImport: vi.fn(),
  productionSheetsGrid: vi.fn(),
  productionSheetsHtml: vi.fn(),
}));
vi.mock("@/lib/operations-transfer-files", () => ({
  exportOperationsGrid: vi.fn(),
  exportOperationsPdf: vi.fn(),
  pickOperationsGrid: vi.fn(),
}));
vi.mock("@/lib/production-documents-repository", () => ({
  createProductionDocumentId: () => "new",
}));
import ProductionSheetsScreen from "@/app/tools/production-sheets";
let tree: ReactTestRenderer | undefined;
const nodes = (type: string) => tree!.root.findAll((n) => n.type === type);
const field = () =>
  nodes("Field").find((n) => n.props.label === "Actual consumption (kg)")!;
const press = async (label: string) =>
  act(async () => {
    nodes("AppButton")
      .find((n) => n.props.label === label)!
      .props.onPress();
  });
const select = async () =>
  act(async () => {
    nodes("AppButton")
      .find((n) => String(n.props.label).includes("Soup"))!
      .props.onPress();
  });
const draft = (): ProductionSheet => ({
  id: "sheet",
  correctionOf: null,
  batchDate: "2026-11-03",
  recipeId: "recipe",
  recipeTitle: "Soup",
  recipeVersion: "1",
  recipeSnapshot: "{}",
  plannedPortions: 10,
  lines: [
    {
      id: "line",
      catalogId: null,
      name: "Flour",
      unit: "kg",
      plannedQuantity: 1,
      plannedCost: 10,
      unitCost: 10,
      actualQuantity: 1,
      lot: "",
      supplier: "",
    },
  ],
  actualWeightGrams: 1000,
  actualPortions: 10,
  responsible: "Chef",
  equipmentIds: [],
  measurements: [],
  notes: "",
  status: "draft",
  validatedAt: null,
  voucherId: "voucher",
  createdAt: "2026-11-03T10:00:00Z",
  updatedAt: "2026-11-03T10:00:00Z",
});
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.sheets = [draft()];
  state.viewer = false;
  state.save
    .mockReset()
    .mockImplementation(async (_u: string, s: ProductionSheet) => s);
  state.resolve.mockReset().mockImplementation(async () => state.sheets);
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => {
    tree = create(createElement(ProductionSheetsScreen));
  });
  await select();
}
it("reopening the same saved draft resets visible raw input to the saved model", async () => {
  await mount();
  await act(async () => field().props.onChangeText("2,5"));
  expect(field().props.value).toBe("2,5");
  await select();
  expect(field().props.value).toBe("1");
  await press("Save draft");
  expect(state.save).toHaveBeenCalledWith(
    "demo",
    expect.objectContaining({
      lines: [expect.objectContaining({ actualQuantity: 1 })],
    }),
  );
});
it("accepting a cloud conflict refreshes same-id raw fields", async () => {
  state.sheets[0].syncState = "conflict";
  await mount();
  await act(async () => field().props.onChangeText("9."));
  state.sheets = [
    { ...draft(), lines: [{ ...draft().lines[0], actualQuantity: 3 }] },
  ];
  await press("Keep cloud version");
  expect(field().props.value).toBe("3");
});
it("viewer input and mutation handlers cannot save changes", async () => {
  state.viewer = true;
  await mount();
  expect(field().props.editable).toBe(false);
  const save = nodes("AppButton").find((n) => n.props.label === "Save draft");
  if (save) {
    expect(save.props.disabled).toBe(true);
    await act(async () => save.props.onPress());
  }
  expect(state.save).not.toHaveBeenCalled();
  expect(
    nodes("AppButton").find((n) => n.props.label === "Import Excel / CSV")!
      .props.disabled,
  ).toBe(true);
});
