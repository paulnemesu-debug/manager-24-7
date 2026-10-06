import { createElement, useEffect } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translate, type Locale, type TranslationKey } from '@/i18n/translations';

const state = vi.hoisted(() => ({ locale: 'en' as Locale, push: vi.fn() }));
vi.mock('@/contexts/locale-context', () => ({ useI18n: () => ({ locale: state.locale, t: (key: TranslationKey, params?: Record<string, string | number>) => translate(state.locale, key, params) }) }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }), useFocusEffect: (callback: () => void) => useEffect(callback, [callback]) }));
vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (values: { default: unknown }) => values.default },
  Alert: { alert: vi.fn() }, StyleSheet: { create: (styles: object) => styles },
  View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView',
  Keyboard: { dismiss: vi.fn() }, BackHandler: { addEventListener: () => ({ remove: vi.fn() }) },
  useWindowDimensions: () => ({ width: 360, height: 800, fontScale: 1 }),
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('expo-image', () => ({ Image: 'Image' }));
vi.mock('@/constants/folder-photos', () => ({ FOLDER_PHOTOS: {} }));
vi.mock('@/components/tool-header', () => ({ ToolHeader: 'ToolHeader' }));
vi.mock('@/components/ui', () => Object.fromEntries(['AppButton', 'Body', 'Card', 'Screen', 'StatusPill'].map(name => [name, name])));
vi.mock('@/components/haccp-today', () => ({ HaccpToday: 'HaccpToday' }));
vi.mock('@/components/haccp-form-browser', () => ({ HaccpFormBrowser: 'HaccpFormBrowser' }));
vi.mock('@/components/haccp-autocontrol-calendar', () => ({ HaccpAutocontrolCalendar: 'HaccpAutocontrolCalendar' }));
vi.mock('@/components/haccp-date-input', () => ({ HaccpDateInput: 'HaccpDateInput' }));
vi.mock('@/components/haccp-time-input', () => ({ HaccpTimeInput: 'HaccpTimeInput' }));
vi.mock('@/hooks/use-focused-sync-retry', () => ({ useFocusedSyncRetry: vi.fn() }));
vi.mock('@/hooks/use-haccp-favorites', () => ({ useHaccpFavorites: () => ({ codes: [], ready: true, toggle: vi.fn() }) }));
vi.mock('@/hooks/use-haccp-documents', () => ({ useHaccpDocuments: () => ({ documents: [], pendingCount: 0, refresh: vi.fn(), save: vi.fn(), saveMany: vi.fn() }) }));
vi.mock('@/lib/haccp-auto-complete', () => ({ autoCompleteHaccpDossier: vi.fn(), HACCP_AUTO_COMPLETE_EXCLUDED_CODES: [] }));
vi.mock('@/lib/haccp-export', () => ({ exportHaccpControlPackPdf: vi.fn() }));
vi.mock('@/lib/haccp-reminders', () => ({ getHaccpReminderSettings: async () => ({ enabled: false, time: '20:00' }), setHaccpReminderTime: vi.fn(), syncHaccpReminders: vi.fn() }));
vi.mock('@/lib/haccp-routine-repository', () => ({ loadHaccpProfile: async () => null, listHaccpEquipment: async () => [] }));
vi.mock('@/lib/offline-workspace', () => ({ workspaceErrorMessage: vi.fn() }));

// FolderHub, FolderSection and FolderLink deliberately use their real implementations.
import { HaccpWorkspace } from '@/app/tools/haccp';

let tree: ReactTestRenderer | undefined;
const find = (type: string) => tree!.root.findAll(node => node.type === type);
const visible = (node: ReactTestInstance) => {
  for (let current: ReactTestInstance | null = node; current; current = current.parent) {
    if (current.props.accessibilityElementsHidden) return false;
  }
  return true;
};
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); state.push.mockClear(); });
afterEach(async () => { await act(async () => tree?.unmount()); tree = undefined; vi.unstubAllGlobals(); });

describe('HACCP inspection navigation with the real folder hub', () => {
  it.each([['en', 'Records', 'Control Mode · inspections'], ['ro', 'Dosar', 'Control Mode · DSVSA / DSP / ITM']] as const)(
    'renders and opens Control Mode in %s while retaining all five folders',
    async (locale, records, title) => {
      state.locale = locale;
      await act(async () => { tree = create(createElement(HaccpWorkspace)); });
      const recordsTab = find('Pressable').find(node => node.props.accessibilityRole === 'tab' && node.findAll(child => child.type === 'Text' as string).some(child => child.children.join('') === records));
      expect(recordsTab).toBeDefined();
      await act(async () => recordsTab!.props.onPress());
      const controlLink = () => find('Pressable').find(node => visible(node) && node.props.accessibilityLabel === title);
      expect(controlLink()).toBeDefined();
      expect(find('Pressable').filter(node => node.props.testID === 'folder-photo-tile' && visible(node))).toHaveLength(5);
      await act(async () => controlLink()!.props.onPress());
      expect(state.push).toHaveBeenLastCalledWith('/tools/control-mode');
      await act(async () => find('Pressable').find(node => node.props.testID === 'folder-photo-tile')!.props.onPress());
      expect(controlLink()).toBeDefined();
      await act(async () => controlLink()!.props.onPress());
      expect(state.push).toHaveBeenCalledTimes(2);
    },
  );
});
