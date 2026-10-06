/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';

export type RollerPickerItem = { value: string; label: string };
export type RollerPickerColumn = {
  key: string;
  label?: string;
  items: RollerPickerItem[];
};

const ITEM_HEIGHT = 58;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

function nearestIndex(items: RollerPickerItem[], value: string) {
  const index = items.findIndex((item) => item.value === value);
  return Math.max(0, index);
}

function RollerColumn({
  column,
  value,
  onChange,
}: {
  column: RollerPickerColumn;
  value: string;
  onChange: (value: string) => void;
}) {
  const initialIndex = nearestIndex(column.items, value);
  const selectFromOffset = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.max(0, Math.min(
      column.items.length - 1,
      Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT),
    ));
    const item = column.items[index];
    if (item) onChange(item.value);
  };

  return (
    <View style={styles.columnWrap}>
      {!!column.label && <Text style={styles.columnLabel}>{column.label}</Text>}
      <View style={styles.rollerWindow}>
        <View pointerEvents="none" style={styles.selectionBand} />
        <FlatList
          key={`${column.key}-${value}`}
          data={column.items}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
          keyExtractor={(item) => item.value}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          bounces={false}
          style={styles.rollerList}
          contentContainerStyle={styles.rollerContent}
          onMomentumScrollEnd={selectFromOffset}
          renderItem={({ item }) => {
            const selected = item.value === value;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onChange(item.value)}
                style={styles.rollerItem}>
                <Text style={[styles.rollerText, selected && styles.rollerTextSelected]}>{item.label}</Text>
              </Pressable>
            );
          }}
        />
      </View>
    </View>
  );
}

export function RollerPickerModal({
  visible,
  title,
  columns,
  values,
  confirmLabel: customConfirmLabel,
  cancelLabel: customCancelLabel,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  columns: RollerPickerColumn[];
  values: Record<string, string>;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const { locale, t } = useI18n();
  const confirmLabel = customConfirmLabel ?? (locale === 'ro' ? 'Gata' : 'Done');
  const cancelLabel = customCancelLabel ?? t('common.cancel');
  const initial = useMemo(() => ({ ...values }), [values]);
  const [selected, setSelected] = useState<Record<string, string>>(initial);

  useEffect(() => {
    if (visible) setSelected({ ...values });
  }, [values, visible]);

  if (!visible) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel={cancelLabel} onPress={onCancel} style={StyleSheet.absoluteFill} />
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.columns}>
            {columns.map((column, index) => (
              <View key={column.key} style={styles.columnGroup}>
                {index > 0 && <Text style={styles.separator}>:</Text>}
                <RollerColumn
                  column={column}
                  value={selected[column.key] ?? column.items[0]?.value ?? ''}
                  onChange={(next) => setSelected((current) => ({ ...current, [column.key]: next }))}
                />
              </View>
            ))}
          </View>
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={[styles.action, styles.cancel]}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable onPress={() => onConfirm(selected)} style={[styles.action, styles.confirm]}>
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(5, 22, 37, 0.42)' },
  sheet: { backgroundColor: Brand.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 24 },
  title: { color: Brand.navyDeep, fontSize: 19, fontFamily: Fonts.extraBold, textAlign: 'center' },
  columns: { minHeight: PICKER_HEIGHT + 28, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', marginTop: 10 },
  columnGroup: { flexDirection: 'row', alignItems: 'center' },
  columnWrap: { width: 116 },
  columnLabel: { color: Brand.muted, fontSize: 10, fontFamily: Fonts.bold, textAlign: 'center', textTransform: 'uppercase', marginBottom: 6 },
  rollerWindow: { height: PICKER_HEIGHT, overflow: 'hidden' },
  rollerContent: { paddingVertical: ITEM_HEIGHT * 2 },
  selectionBand: { position: 'absolute', left: 4, right: 4, top: ITEM_HEIGHT * 2, height: ITEM_HEIGHT, borderRadius: Radius.medium, backgroundColor: '#F1F4F6', borderTopWidth: 1, borderBottomWidth: 1, borderColor: Brand.line, zIndex: 0 },
  rollerList: { zIndex: 1 },
  rollerItem: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  rollerText: { color: '#B0B6BC', fontSize: 30, fontFamily: Fonts.medium, ...TabularNumbers },
  rollerTextSelected: { color: Brand.ink, fontSize: 40, fontFamily: Fonts.extraBold },
  separator: { color: Brand.ink, fontSize: 36, fontFamily: Fonts.extraBold, marginHorizontal: -8, marginTop: 18, zIndex: 2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  action: { minHeight: 50, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.medium },
  cancel: { backgroundColor: '#F2F5F6' },
  confirm: { backgroundColor: Brand.gold },
  cancelText: { color: Brand.navy, fontSize: 14, fontFamily: Fonts.bold },
  confirmText: { color: Brand.navyDeep, fontSize: 14, fontFamily: Fonts.extraBold },
});
