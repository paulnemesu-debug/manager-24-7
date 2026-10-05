import AsyncStorage from '@react-native-async-storage/async-storage';

import { isDemoMode, supabase } from '@/lib/supabase';
import type { CatalogIngredient, Recipe } from '@/types/recipe';

// An explicit allowlist keeps authentication and credentials out of backups.
const LOCAL_MODULES = {
  workspace: 'professional_foodcost.workspace.v1.',
  pendingSync: 'professional_foodcost.sync_queue.v1.',
  failedSync: 'professional_foodcost.sync_failed.v1.',
  preferences: 'professional_foodcost.preferences.v1.',
  temperatures: 'professional_foodcost.temperatures.v1.',
  cleaning: 'professional_foodcost.cleaning.v1.',
  consumptionVouchers: 'professional_foodcost.consumption_vouchers.v1.',
  bulkBatches: 'professional_foodcost.bulk_batches.v1.',
  haccpDocuments: 'professional_foodcost.haccp_documents.v1.',
  managementControls: 'manager247.management.v1.',
  operationsControl: 'manager247.operations-control.v1.',
  hr: 'manager247.hr.v1.',
  hrPendingDeletions: 'manager247.hr.deletions.v1.',
  hrLifecycle: 'manager247.hr-lifecycle.v1.',
  operationalDocuments: 'manager247.operational-documents.v1.',
  haccpAutocontrol: 'manager247.haccp_autocontrol.v1.',
  haccpEquipment: 'manager247.haccp-equipment.v1.',
  haccpProfile: 'manager247.haccp-routine-profile.v1.',
  haccpFavorites: 'manager247.haccp-favorites.v1.',
  locations: 'manager247.locations.v1.',
  pnl: 'manager247.pnl_reports.v1.',
  wasteCompliance: 'manager247.waste-compliance.v1.',
  invoiceMappings: 'manager247.invoice_product_mappings.v1.',
  priceAlerts: 'manager247.price_alert_history.v1.',
  recipeDrafts: 'manager247.recipe-drafts.v1.',
  clientErrors: 'manager247.client_errors.v1.',
  haccpReminderSettings: 'manager247.haccp_reminder.settings.v2.',
  haccpReminderEnabled: 'professional_foodcost.haccp_reminder.enabled.',
  haccpReminderEntries: 'professional_foodcost.haccp_reminder.entries.',
  autocontrolNotifications: 'manager247.haccp_autocontrol.notifications.v1.',
  weeklyReminderEnabled: 'manager247.weekly_report_reminders.enabled.v1.',
  weeklyReminderEntries: 'manager247.weekly_report_reminders.v1.',
};

type TableSpec = { name: string; owner?: string; order?: string[]; columns?: string };
const TABLES: TableSpec[] = [
  ...['recipes', 'recipe_ingredients', 'recipe_versions', 'ingredient_catalog',
    'ingredient_price_history', 'ingredient_supplier_offers', 'bulk_batches', 'consumption_vouchers',
    'haccp_documents', 'haccp_equipment', 'haccp_autocontrol_events', 'hr_employees', 'hr_shifts', 'hr_lifecycle', 'operational_documents',
    'pnl_reports', 'inventory_counts', 'inventory_schedules', 'labor_entries', 'menu_sales', 'sales_imports',
    'stock_policies', 'supplier_orders', 'waste_entries', 'waste_prevention_plans', 'waste_receivers',
    'food_redistributions', 'product_events'].map((name) => ({ name })),
  { name: 'business_locations', owner: 'owner_user_id' },
  { name: 'workspace_members', owner: 'owner_user_id' },
  { name: 'haccp_routine_profiles', order: ['user_id'] },
  { name: 'profiles', order: ['user_id'] },
  { name: 'user_preferences', order: ['user_id'] },
  { name: 'supplier_product_mappings', order: ['supplier', 'source_name'] },
  { name: 'subscriptions', order: ['user_id'],
    columns: 'user_id,platform,product_id,status,google_order_id,current_period_start,current_period_end,auto_renew,last_verified_at,created_at,updated_at' },
];

export function accountLocalModule(key: string, userId: string): string | null {
  const match = Object.entries(LOCAL_MODULES).find(([, prefix]) => key === prefix + userId);
  if (match) return match[0];
  const salesPrefix = 'professional_foodcost.sales.';
  const suffix = '.v1.' + userId;
  if (key.startsWith(salesPrefix) && key.endsWith(suffix)) {
    const period = key.slice(salesPrefix.length, -suffix.length);
    if (/^\d{4}-\d{2}-01$/.test(period)) return 'sales.' + period;
  }
  const pendingSalesPrefix = 'professional_foodcost.sales_pending.';
  if (key.startsWith(pendingSalesPrefix) && key.endsWith(suffix)) {
    const period = key.slice(pendingSalesPrefix.length, -suffix.length);
    if (/^\d{4}-\d{2}-01$/.test(period)) return 'salesPending.' + period;
  }
  if (userId === 'demo' && key === 'professional_foodcost.demo_recipes.v2') return 'legacyDemoRecipes';
  if (userId === 'demo' && key === 'professional_foodcost.demo_catalog.v1') return 'legacyDemoCatalog';
  return null;
}

async function readTable(spec: TableSpec, userId: string) {
  const rows: Record<string, unknown>[] = [];
  if (!supabase) return { rows, error: 'cloud_unavailable' };
  try {
    for (let offset = 0; ; offset += 500) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      try {
        let query = supabase.from(spec.name).select(spec.columns ?? '*').eq(spec.owner ?? 'user_id', userId);
        for (const column of spec.order ?? ['id']) query = query.order(column);
        const result = await query.range(offset, offset + 499).abortSignal(controller.signal);
        if (result.error) return { rows, error: result.error.code || 'cloud_read_failed' };
        const page = (result.data ?? []) as unknown as Record<string, unknown>[];
        rows.push(...page);
        if (page.length < 500) break;
      } finally { clearTimeout(timeout); }
    }
    return { rows, error: null };
  } catch { return { rows, error: 'cloud_read_failed' }; }
}

export async function buildAccountSnapshot(userId: string, recipes: Recipe[], catalog: CatalogIngredient[]) {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => accountLocalModule(key, userId));
  const entries = await AsyncStorage.multiGet(keys);
  const localModules: Record<string, unknown> = {};
  const issues: { module: string; code: string }[] = [];
  for (const [key, value] of entries) {
    const module = accountLocalModule(key, userId)!;
    try { localModules[module] = value === null ? null : JSON.parse(value); }
    catch { localModules[module] = { unparsedData: value }; issues.push({ module, code: 'invalid_local_json' }); }
  }
  const cloudAvailable = !isDemoMode && Boolean(supabase) && userId !== 'demo';
  const serverTables: Record<string, Record<string, unknown>[]> = {};
  const cloudModules: { module: string; rows: number; complete: boolean }[] = [];
  if (cloudAvailable) {
    try {
      const access = await supabase!.rpc('has_professional_access');
      if (access.error || access.data !== true) issues.push({ module: 'cloudAccess', code: 'some_modules_may_be_restricted' });
    } catch { issues.push({ module: 'cloudAccess', code: 'cloud_access_unverified' }); }
    // Limit concurrent requests on mobile while retrieving every page, including inactive rows.
    for (let offset = 0; offset < TABLES.length; offset += 4) {
      const group = TABLES.slice(offset, offset + 4);
      const results = await Promise.all(group.map((spec) => readTable(spec, userId)));
      results.forEach((result, index) => {
        const module = group[index].name;
        serverTables[module] = result.rows;
        cloudModules.push({ module, rows: result.rows.length, complete: !result.error });
        if (result.error) issues.push({ module, code: result.error });
      });
    }
    try {
      const { data, error } = await supabase!.rpc('list_hr_deletions');
      if (error) issues.push({ module: 'hrDeletedRows', code: error.code || 'cloud_read_failed' });
      else localModules.hrDeletedRows = data;
    } catch { issues.push({ module: 'hrDeletedRows', code: 'cloud_read_failed' }); }
  }
  return {
    formatVersion: 2,
    product: 'Manager 24/7',
    exportedAt: new Date().toISOString(),
    userId,
    recipes,
    ingredientCatalog: catalog,
    localModules,
    serverTables,
    manifest: {
      scope: 'Own account rows, visible recipe/catalog snapshots and account-scoped device data',
      localModules: Object.keys(localModules),
      cloudModules,
      cloudComplete: cloudAvailable && issues.length === 0,
      cloudAvailable,
      issues,
      photos: 'References only; original image files are not embedded',
      credentials: 'Excluded',
    },
  };
}
