import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MaintenanceEntry } from "@/types/equipment-maintenance";
const state = vi.hoisted(() => ({
  save: vi.fn(),
  entries: [] as MaintenanceEntry[],
}));
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/contexts/locale-context", () => ({
  useI18n: () => ({ locale: "en" }),
}));
vi.mock("@/contexts/subscription-context", () => ({
  useSubscription: () => ({ isViewer: false }),
}));
vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  Switch: "Switch",
  Text: "Text",
  View: "View",
}));
vi.mock("@/components/tool-header", () => ({ ToolHeader: "ToolHeader" }));
vi.mock("@/components/inputs", () => ({ Select: "Select" }));
vi.mock("@/components/ui", () =>
  Object.fromEntries(
    ["AppButton", "Body", "Card", "Field", "Screen"].map((n) => [n, n]),
  ),
);
vi.mock("@/lib/operational-sync", () => ({
  operationalSyncLabel: () => "local",
}));
vi.mock("@/lib/equipment-maintenance", () => ({
  loadEquipmentRegistry: async () => [
    { id: "asset", name: "Oven", available: true },
  ],
  loadMaintenance: async () => state.entries,
  saveMaintenance: state.save,
  maintenanceStatus: () => "scheduled",
  emptyAsset: vi.fn(),
  emptyMaintenance: vi.fn(),
  finishMaintenance: vi.fn(),
  resolveEquipment: vi.fn(),
  resolveMaintenance: vi.fn(),
  saveEquipment: vi.fn(),
}));
vi.mock("@/lib/equipment-maintenance-transfer", () => ({
  equipmentGrid: vi.fn(),
  maintenanceGrid: vi.fn(),
  equipmentPdf: vi.fn(),
  parseEquipmentTransfer: vi.fn(),
}));
vi.mock("@/lib/operations-transfer-files", () => ({
  exportOperationsGrid: vi.fn(),
  exportOperationsPdf: vi.fn(),
  pickOperationsGrid: vi.fn(),
}));
import EquipmentMaintenanceScreen from "@/app/tools/equipment-maintenance";
let tree: ReactTestRenderer | undefined;
const nodes = (type: string) => tree!.root.findAll((n) => n.type === type);
const field = (label: string) =>
  nodes("Field").find((n) => n.props.label === label)!;
const press = async (label: string) =>
  act(async () => {
    nodes("AppButton")
      .find((n) => n.props.label === label)!
      .props.onPress();
  });
const select = async (title: string) =>
  act(async () => {
    nodes("AppButton")
      .find((n) => String(n.props.label).includes(title))!
      .props.onPress();
  });
const type = async (label: string, value: string) =>
  act(async () => {
    field(label).props.onChangeText(value);
  });
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.entries = ["Task A", "Task B"].map((title, i) => ({
    id: `entry${i}`,
    assetId: "asset",
    kind: "preventive",
    title,
    responsible: "Chef",
    dueDate: "2026-11-04",
    recurrenceDays: i + 1,
    completedDate: "",
    estimatedParts: i + 10,
    estimatedLabor: 0,
    estimatedTravel: 0,
    estimatedConsumables: 0,
    actualParts: null,
    actualLabor: null,
    actualTravel: null,
    actualConsumables: null,
    notes: "",
    updatedAt: "2026-11-03T12:00:00Z",
  }));
  state.save
    .mockReset()
    .mockImplementation(
      async (_user: string, entry: MaintenanceEntry) => entry,
    );
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => {
    tree = create(createElement(EquipmentMaintenanceScreen));
  });
  await select("Task A");
}
describe("maintenance numeric editing", () => {
  it("renders the task form without raw text inside native layout containers", async () => {
    await mount();
    const inspect = (node: ReturnType<ReactTestRenderer['toJSON']>, parent = ''): void => {
      if (Array.isArray(node)) {
        node.forEach(child => inspect(child, parent));
      } else if (node) {
        for (const child of node.children ?? []) {
          if (typeof child === 'string') {
            expect(['Text', 'Body'], `Raw text ${JSON.stringify(child)} under ${node.type}`).toContain(node.type);
          } else inspect(child, node.type);
        }
      }
    };
    inspect(tree!.toJSON());
  });
  it("preserves clearing and decimal prefixes and parses comma decimals only when saved", async () => {
    await mount();
    for (const value of ["", "1", "12", "12,", "12,5"]) {
      await type("Estimated parts", value);
      expect(field("Estimated parts").props.value).toBe(value);
      expect(state.save).not.toHaveBeenCalled();
    }
    await press("Save schedule");
    expect(state.save).toHaveBeenCalledWith(
      "demo",
      expect.objectContaining({ estimatedParts: 12.5 }),
    );
  });
  it.each(["", "12.", "Infinity", "-1", "1.2.3"])(
    "blocks saving invalid final cost %s",
    async (raw) => {
      await mount();
      await type("Estimated parts", raw);
      await press("Save schedule");
      expect(state.save).not.toHaveBeenCalled();
      expect(field("Estimated parts").props.value).toBe(raw);
    },
  );
  it("rejects fractional recurrence and restores numeric text when selecting a different task", async () => {
    await mount();
    await type("Recurrence days", "2,5");
    await press("Save schedule");
    expect(state.save).not.toHaveBeenCalled();
    await type("Estimated parts", "12.");
    await select("Task B");
    expect(field("Estimated parts").props.value).toBe("11");
    expect(field("Recurrence days").props.value).toBe("2");
  });
});
