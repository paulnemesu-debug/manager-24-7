/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { Children, isValidElement, useCallback, useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import { BackHandler, Keyboard, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { ToolHeader } from '@/components/tool-header';
import { Screen } from '@/components/ui';
import { Brand, Fonts, Radius } from '@/constants/theme';
import { FOLDER_PHOTOS, type FolderPhotoKey } from '@/constants/folder-photos';

type FolderAccent = 'gold' | 'navy' | 'teal' | 'green' | 'amber';
type FolderIcon = keyof typeof Ionicons.glyphMap;
type FolderSectionProps = PropsWithChildren<{
  id: string;
  title: string;
  summary?: string;
  icon: FolderIcon;
  photo?: FolderPhotoKey;
  accent?: FolderAccent;
}>;

const ACCENTS = {
  gold: { backgroundColor: Brand.goldSoft, color: Brand.goldInk },
  navy: { backgroundColor: '#E5EDF4', color: Brand.navy },
  teal: { backgroundColor: Brand.tealSoft, color: Brand.tealDeep },
  green: { backgroundColor: Brand.greenSoft, color: Brand.green },
  amber: { backgroundColor: Brand.amberSoft, color: Brand.amber },
};

const ICON_PHOTOS: Partial<Record<FolderIcon, FolderPhotoKey>> = {
  'restaurant-outline': 'recipes', 'book-outline': 'mine', 'create-outline': 'mine',
  'checkmark-done-circle-outline': 'mine', 'leaf-outline': 'ingredients',
  'document-text-outline': 'exports', 'download-outline': 'exports', 'archive-outline': 'exports',
  'person-circle-outline': 'account', 'people-outline': 'about', 'information-circle-outline': 'about',
  'shield-checkmark-outline': 'security', 'lock-closed-outline': 'security', 'card-outline': 'subscription',
  'calendar-outline': 'planning', 'clipboard-outline': 'planning', 'cart-outline': 'suppliers',
  'cube-outline': 'suppliers', 'scale-outline': 'operations', 'options-outline': 'account',
  'grid-outline': 'planning', 'bar-chart-outline': 'operations', 'thermometer-outline': 'haccp',
};

/** FolderHub afișează conținutul secțiunii într-o pagină proprie. */
export function FolderSection({ children }: FolderSectionProps) {
  return <>{children}</>;
}

export function FolderLink({ title, summary, icon, photo, accent = 'gold', tile = false, onPress }: {
  title: string;
  summary?: string;
  icon: FolderIcon;
  photo?: FolderPhotoKey;
  accent?: FolderAccent;
  tile?: boolean;
  onPress: () => void;
}) {
  const colors = ACCENTS[accent];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      testID={tile ? 'folder-photo-tile' : 'folder-photo-link'}
      style={({ pressed }) => [styles.folder, tile && styles.tile, pressed && styles.pressed]}>
      <Image
        source={FOLDER_PHOTOS[photo ?? ICON_PHOTOS[icon] ?? 'operations']}
        style={[styles.photo, tile && styles.tilePhoto, { backgroundColor: colors.backgroundColor }]}
        contentFit="cover"
        transition={120}
        accessible={false}
      />
      <View style={[styles.copy, tile && styles.tileCopy]}>
        <Text style={[styles.title, tile && styles.tileTitle]} numberOfLines={tile ? 2 : undefined}>{title}</Text>
        {!!summary && <Text style={styles.summary} numberOfLines={tile ? 1 : 2}>{summary}</Text>}
      </View>
      {!tile && <Ionicons name="chevron-forward" size={20} color={Brand.navySoft} />}
    </Pressable>
  );
}

/** Păstrează formularele vizitate, dar afișează numai folderul deschis. */
export function FolderHub({ children, header, notice, initialFolder, navigationKey, layout = 'list' }: PropsWithChildren<{
  header: ReactNode;
  notice?: ReactNode;
  initialFolder?: string;
  navigationKey?: string;
  layout?: 'list' | 'grid';
}>) {
  const { width, height, fontScale } = useWindowDimensions();
  const folders = Children.toArray(children).filter((child) => (
    isValidElement<FolderSectionProps>(child) && child.type === FolderSection
  )).filter(isValidElement<FolderSectionProps>);
  const [activeId, setActiveId] = useState<string | null>(initialFolder ?? null);
  const [visited, setVisited] = useState<string[]>(initialFolder ? [initialFolder] : []);
  const scrollRef = useRef<ScrollView>(null);
  const active = folders.find((folder) => folder.props.id === activeId);
  const grid = layout === 'grid';
  // Large accessibility text and very short viewports retain scrolling.
  const fittedGrid = grid && !active && height >= 540 && width >= 320 && fontScale <= 1.3;
  const rows = Array.from({ length: Math.ceil(folders.length / 2) }, (_, index) => folders.slice(index * 2, index * 2 + 2));

  const open = useCallback((id: string) => {
    Keyboard.dismiss();
    setVisited((current) => current.includes(id) ? current : [...current, id]);
    setActiveId(id);
  }, []);
  const close = useCallback(() => {
    Keyboard.dismiss();
    setActiveId(null);
  }, []);

  useEffect(() => {
    if (initialFolder) open(initialFolder);
  }, [initialFolder, navigationKey, open]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, [activeId]);
  useFocusEffect(useCallback(() => {
    if (!activeId) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => listener.remove();
  }, [activeId, close]));

  return (
    <Screen scroll={!fittedGrid} scrollRef={scrollRef} style={fittedGrid ? styles.fittedScreen : undefined}>
      {active ? (
        <ToolHeader title={active.props.title} subtitle={active.props.summary ?? ''} onBack={close} />
      ) : header}
      {notice}
      <View style={[styles.content, grid && styles.grid, fittedGrid && styles.fittedGrid, !!active && styles.hidden]} accessibilityElementsHidden={!!active} importantForAccessibility={active ? 'no-hide-descendants' : 'auto'}>
        {grid ? rows.map((row, index) => (
          <View key={index} style={[styles.gridRow, !fittedGrid && styles.scrollGridRow]}>
            {row.map((folder) => <FolderLink key={folder.props.id} {...folder.props} tile onPress={() => open(folder.props.id)} />)}
            {row.length === 1 && <View style={styles.emptyTile} />}
          </View>
        )) : folders.map((folder) => <FolderLink key={folder.props.id} {...folder.props} onPress={() => open(folder.props.id)} />)}
      </View>
      {folders.map((folder) => visited.includes(folder.props.id) && (
        <View
          key={folder.props.id}
          style={[styles.content, active?.props.id !== folder.props.id && styles.hidden]}
          accessibilityElementsHidden={active?.props.id !== folder.props.id}
          importantForAccessibility={active?.props.id === folder.props.id ? 'auto' : 'no-hide-descendants'}>
          {folder.props.children}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  folder: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 92, borderWidth: 1, borderColor: Brand.line, borderRadius: Radius.large, backgroundColor: Brand.white, overflow: 'hidden' },
  photo: { width: 68, height: 68, borderRadius: 13 },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  title: { color: Brand.navyDeep, fontSize: 16, lineHeight: 21, fontFamily: Fonts.extraBold },
  summary: { color: Brand.muted, fontSize: 11, lineHeight: 16, fontFamily: Fonts.regular },
  content: { gap: 12 },
  fittedScreen: { paddingBottom: 12, gap: 10 },
  grid: { gap: 12 },
  fittedGrid: { flex: 1, minHeight: 0 },
  gridRow: { flex: 1, flexDirection: 'row', gap: 12, minHeight: 0 },
  scrollGridRow: { flex: 0, height: 200 },
  emptyTile: { flex: 1 },
  tile: { flex: 1, minWidth: 0, minHeight: 0, flexDirection: 'column', alignItems: 'stretch', padding: 0, gap: 0 },
  tilePhoto: { flex: 1, width: '100%', height: undefined, minHeight: 40, borderRadius: 0 },
  tileCopy: { flex: 0, gap: 3, padding: 11 },
  tileTitle: { fontSize: 14, lineHeight: 18 },
  hidden: { display: 'none' },
  pressed: { opacity: 0.76 },
});
