/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { createContext, useContext, useEffect, useState, type PropsWithChildren, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand, Fonts, Radius, Shadow, Spacing, TabularNumbers } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';
import { LanguageSelector } from '@/components/language-selector';

const CompactUiContext = createContext(false);

export function Screen({
  children,
  scroll = true,
  bottomSafeArea = false,
  forceLight = false,
  style,
  footer,
  scrollRef,
}: PropsWithChildren<{
  scroll?: boolean;
  bottomSafeArea?: boolean;
  /** Păstrează fundalul deschis pe ecranele care au un design exclusiv light. */
  forceLight?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Bară fixă sub conținut, în afara zonei de scroll — rămâne vizibilă tot timpul. */
  footer?: ReactNode;
  scrollRef?: Ref<ScrollView>;
}>) {
  const { width, height } = useWindowDimensions();
  const compact = width < 480 || height < 760;
  const content = scroll ? (
    <ScrollView
      ref={scrollRef}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.screenContent,
        compact && styles.screenContentCompact,
        footer ? styles.screenContentWithFooter : null,
        footer && compact ? styles.screenContentWithFooterCompact : null,
        style,
      ]}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screenContent, compact && styles.screenContentCompact, styles.flex, style]}>
      {children}
    </View>
  );

  return (
    <CompactUiContext.Provider value={compact}>
      <SafeAreaView style={styles.safeArea} edges={bottomSafeArea || footer ? ['top', 'left', 'right', 'bottom'] : ['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {content}
          {!!footer && (
            <View style={[styles.stickyFooter, compact && styles.stickyFooterCompact]}>
              {footer}
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </CompactUiContext.Provider>
  );
}

export function BrandHeader({
  compact = false,
  prominent = false,
  mini = false,
}: {
  compact?: boolean;
  /** Logo mai mare pentru primul ecran, fără a modifica antetele listelor. */
  prominent?: boolean;
  /** Antet discret pentru ecranele operaționale, unde cifra are prioritate. */
  mini?: boolean;
}) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const compactUi = useContext(CompactUiContext);
  const prominentSize = Math.min(132, Math.max(96, width * 0.3));
  return (
    <View style={[
      styles.brandHeader,
      compactUi && styles.brandHeaderPhone,
      compact && styles.brandHeaderCompact,
      prominent && styles.brandHeaderProminent,
      mini && styles.brandHeaderMini,
    ]}>
      <Image
        source={require('../../assets/brand/manager247-logo-transparent.png')}
        style={[
          styles.logo,
          (width < 400 || compactUi) && styles.logoSmall,
          compact && styles.logoCompact,
          prominent && { width: prominentSize, height: prominentSize, borderRadius: prominentSize / 2 },
          mini && styles.logoMini,
        ]}
        contentFit="contain"
        accessibilityLabel="Manager 24/7 by PARADIM"
      />
      {!prominent && (
        <View style={[styles.brandCopy, prominent && styles.brandCopyProminent]}>
          <Text style={[
            styles.productName,
            compactUi && styles.productNameCompact,
            (compact || mini) && styles.productNameMini,
            prominent && styles.productNameProminent,
          ]}>{t('common.appName')}</Text>
          {!compact && !mini && <Text style={[styles.tagline, compactUi && styles.taglineCompact]}>{t('common.tagline')}</Text>}
        </View>
      )}
      <LanguageSelector />
    </View>
  );
}

export function Card({
  children,
  style,
  tone = 'white',
}: PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  tone?: 'white' | 'navy' | 'gold' | 'soft';
}>) {
  const compact = useContext(CompactUiContext);
  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        tone === 'navy' && styles.cardNavy,
        tone === 'gold' && styles.cardGold,
        tone === 'soft' && styles.cardSoft,
        style,
      ]}>
      {children}
    </View>
  );
}

export function Title({ children, light = false }: PropsWithChildren<{ light?: boolean }>) {
  const compact = useContext(CompactUiContext);
  return <Text style={[styles.title, compact && styles.titleCompact, light && styles.lightText]}>{children}</Text>;
}

export function Subtitle({ children, light = false }: PropsWithChildren<{ light?: boolean }>) {
  const compact = useContext(CompactUiContext);
  return <Text style={[styles.subtitle, compact && styles.subtitleCompact, light && styles.lightMuted]}>{children}</Text>;
}

export function SectionHeader({
  eyebrow,
  title,
  action,
  light = false,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  light?: boolean;
}) {
  const compact = useContext(CompactUiContext);
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionCopy}>
        {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text numberOfLines={2} style={[styles.sectionTitle, compact && styles.sectionTitleCompact, light && styles.lightText]}>{title}</Text>
      </View>
      {action}
    </View>
  );
}

export function Body({ children, light = false }: PropsWithChildren<{ light?: boolean }>) {
  const compact = useContext(CompactUiContext);
  return <Text style={[styles.body, compact && styles.bodyCompact, light && styles.lightMuted]}>{children}</Text>;
}

type AppButtonProps = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
};

export function AppButton({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled = false,
  loading = false,
  fullWidth = false,
}: AppButtonProps) {
  const compact = useContext(CompactUiContext);
  const foreground = variant === 'primary' ? Brand.navyDeep
    : variant === 'danger' ? Brand.red
      : variant === 'secondary' ? Brand.navy
        : Brand.navySoft;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        variant === 'danger' && styles.buttonDanger,
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : (
        <>
          {!!icon && <Ionicons name={icon} size={18} color={foreground} />}
          <Text style={[styles.buttonText, { color: foreground }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  danger = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
  danger?: boolean;
}) {
  const compact = useContext(CompactUiContext);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, compact && styles.iconButtonCompact, pressed && styles.buttonPressed]}>
      <Ionicons name={icon} size={compact ? 18 : 20} color={danger ? Brand.red : Brand.navy} />
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  style,
  ...props
}: TextInputProps & { label: string; hint?: string; style?: StyleProp<ViewStyle> }) {
  const compact = useContext(CompactUiContext);
  return (
    <View style={[styles.fieldWrap, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label}
        placeholderTextColor="#98A3AD"
        selectionColor={Brand.tealDeep}
        cursorColor={Brand.tealDeep}
        style={[styles.input, compact && styles.inputCompact, props.multiline && styles.inputMultiline]}
      />
      {!!hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => (
        <Pressable
          key={option}
          onPress={() => onChange(option)}
          style={[styles.segment, option === value && styles.segmentActive]}>
          <Text style={[styles.segmentText, option === value && styles.segmentTextActive]}>
            {option}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Metric({
  label,
  value,
  accent = 'navy',
}: {
  label: string;
  value: string;
  accent?: 'navy' | 'gold' | 'green' | 'red';
}) {
  const compact = useContext(CompactUiContext);
  const accentColor = accent === 'gold' ? Brand.gold
    : accent === 'green' ? Brand.green
      : accent === 'red' ? Brand.red
        : Brand.navy;
  return (
    <View style={[styles.metric, compact && styles.metricCompact]}>
      <View style={[styles.metricLine, compact && styles.metricLineCompact, { backgroundColor: accentColor }]} />
      <Text style={[styles.metricLabel, compact && styles.metricLabelCompact]}>{label}</Text>
      <Text style={[styles.metricValue, compact && styles.metricValueCompact]}>{value}</Text>
    </View>
  );
}

export function StatusPill({
  label,
  status,
}: {
  label: string;
  status: 'healthy' | 'watch' | 'critical' | 'neutral';
}) {
  const palette = status === 'healthy'
    ? { bg: Brand.greenSoft, fg: Brand.green }
    : status === 'watch'
      ? { bg: Brand.amberSoft, fg: Brand.amber }
      : status === 'critical'
        ? { bg: Brand.redSoft, fg: Brand.red }
        : { bg: '#EDF1F4', fg: Brand.muted };
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <View style={[styles.pillDot, { backgroundColor: palette.fg }]} />
      <Text style={[styles.pillText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={Brand.gold} size="large" />
      <Text style={styles.loadingText}>{label ?? t('common.loading')}</Text>
    </View>
  );
}

export function SkeletonBlock({
  height,
  width = '100%',
  radius = 12,
}: {
  height: number;
  width?: number | `${number}%`;
  radius?: number;
}) {
  const [opacity] = useState(() => new Animated.Value(0.42));
  useEffect(() => {
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.9, duration: 720, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.42, duration: 720, useNativeDriver: true }),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return <Animated.View style={{ height, width, borderRadius: radius, opacity, backgroundColor: '#DCE6E8' }} />;
}

/** Încărcare fără salt vizual pentru listele operaționale. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <View style={styles.skeletonList} accessibilityLabel="Loading">
      <SkeletonBlock height={32} width="58%" />
      <SkeletonBlock height={46} />
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={styles.skeletonCard}>
          <View style={styles.skeletonHeader}>
            <SkeletonBlock height={50} width={72} radius={14} />
            <View style={styles.skeletonCopy}>
              <SkeletonBlock height={15} width="76%" />
              <SkeletonBlock height={10} width="48%" />
            </View>
          </View>
          <SkeletonBlock height={52} />
        </View>
      ))}
    </View>
  );
}

/** Ilustrație locală mică pentru empty-state; nu depinde de rețea. */
export function EmptyStateGraphic({ kind = 'recipe' }: { kind?: 'recipe' | 'ingredient' | 'chart' }) {
  const icon = kind === 'ingredient' ? 'leaf-outline' : kind === 'chart' ? 'analytics-outline' : 'restaurant-outline';
  return (
    <View style={styles.emptyGraphic}>
      <View style={styles.emptyGraphicSun} />
      <View style={styles.emptyGraphicPlate}>
        <Ionicons name={icon} size={28} color={Brand.navy} />
      </View>
      <View style={styles.emptyGraphicLeaf} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: Brand.cream },
  safeAreaDark: { backgroundColor: '#071521' },
  screenContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    padding: Spacing.three,
    paddingBottom: 32,
    gap: Spacing.three,
  },
  screenContentCompact: { padding: 12, paddingBottom: 20, gap: 10 },
  screenContentWithFooter: { paddingBottom: 24 },
  screenContentWithFooterCompact: { paddingBottom: 12 },
  stickyFooter: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Brand.line,
    backgroundColor: Brand.cream,
  },
  stickyFooterCompact: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 },
  stickyFooterDark: { backgroundColor: '#071521', borderTopColor: '#294052' },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  brandHeaderPhone: { gap: 10 },
  brandHeaderCompact: { justifyContent: 'space-between' },
  brandHeaderProminent: { justifyContent: 'center' },
  brandHeaderMini: { justifyContent: 'flex-start' },
  logo: { width: 68, height: 68, borderRadius: 34 },
  logoCompact: { width: 62, height: 62, borderRadius: 31 },
  logoSmall: { width: 58, height: 58, borderRadius: 29 },
  logoMini: { width: 44, height: 44, borderRadius: 22 },
  brandCopy: { flex: 1, minWidth: 0 },
  brandCopyProminent: { flexGrow: 0, flexBasis: 145 },
  productName: { color: Brand.navy, fontSize: 19, fontFamily: Fonts.extraBold },
  productNameCompact: { fontSize: 17 },
  productNameMini: { fontSize: 13 },
  productNameProminent: { fontSize: 21, lineHeight: 24 },
  tagline: { color: Brand.muted, fontSize: 12, marginTop: 3, fontFamily: Fonts.regular },
  taglineCompact: { fontSize: 10, marginTop: 1 },
  card: {
    backgroundColor: Brand.white,
    borderColor: Brand.line,
    borderWidth: 1,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: 12,
    ...Shadow,
  },
  cardCompact: { borderRadius: 18, padding: 12, gap: 8 },
  cardDark: { backgroundColor: '#102432', borderColor: '#294052' },
  cardSoftDark: { backgroundColor: '#142B39', borderColor: '#294052' },
  cardNavy: { backgroundColor: Brand.navy, borderColor: Brand.navy },
  cardGold: { backgroundColor: Brand.goldSoft, borderColor: '#E8CD89' },
  cardSoft: { backgroundColor: '#F0F4F6', borderColor: '#E2E8EB' },
  title: {
    color: Brand.navyDeep,
    fontSize: 30,
    lineHeight: 36,
    fontFamily: Fonts.extraBold,
    letterSpacing: -0.7,
  },
  titleCompact: { fontSize: 24, lineHeight: 29 },
  textDark: { color: '#F3F7F9' },
  mutedDark: { color: '#B5C4CD' },
  subtitle: { color: Brand.muted, fontSize: 15, lineHeight: 22, fontFamily: Fonts.regular },
  subtitleCompact: { fontSize: 13, lineHeight: 18 },
  lightText: { color: Brand.white },
  lightMuted: { color: '#D9E2E8' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionCopy: { flex: 1 },
  eyebrow: {
    color: Brand.goldInk,
    fontSize: 11,
    fontFamily: Fonts.bold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sectionTitle: { color: Brand.navyDeep, fontSize: 21, fontFamily: Fonts.extraBold },
  sectionTitleCompact: { fontSize: 17 },
  body: { color: Brand.muted, fontSize: 14, lineHeight: 21, fontFamily: Fonts.regular },
  bodyCompact: { fontSize: 12, lineHeight: 17 },
  button: {
    minHeight: 48,
    borderRadius: Radius.medium,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonCompact: { minHeight: 44, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 13 },
  buttonPrimary: { backgroundColor: Brand.gold },
  buttonSecondary: { backgroundColor: Brand.white, borderColor: Brand.line, borderWidth: 1 },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonDanger: { backgroundColor: Brand.redSoft },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  buttonText: { fontSize: 14, fontFamily: Fonts.bold, flexShrink: 1, textAlign: 'center' },
  fullWidth: { alignSelf: 'stretch' },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F4F6',
  },
  iconButtonCompact: { width: 44, height: 44, borderRadius: 12 },
  fieldWrap: { gap: 6 },
  fieldLabel: {
    color: Brand.navySoft,
    fontSize: 11,
    fontFamily: Fonts.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: Brand.line,
    backgroundColor: Brand.white,
    borderRadius: Radius.medium,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: Brand.ink,
    fontSize: 15,
    fontFamily: Fonts.regular,
    ...TabularNumbers,
  },
  inputCompact: { minHeight: 42, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, borderRadius: 13 },
  inputMultiline: { minHeight: 100, textAlignVertical: 'top' },
  inputDark: { backgroundColor: '#0B1C28', borderColor: '#355064', color: '#F3F7F9' },
  fieldLabelDark: { color: '#C7D4DC' },
  fieldHint: { color: Brand.muted, fontSize: 11, lineHeight: 16, fontFamily: Fonts.regular },
  segmented: {
    backgroundColor: '#EDF1F4',
    borderRadius: Radius.small,
    padding: 3,
    flexDirection: 'row',
    alignSelf: 'flex-start',
  },
  segment: { minWidth: 42, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  segmentActive: { backgroundColor: Brand.navy },
  segmentText: { color: Brand.muted, textAlign: 'center', fontSize: 12, fontFamily: Fonts.extraBold },
  segmentTextActive: { color: Brand.white },
  metric: {
    flex: 1,
    minWidth: 145,
    backgroundColor: Brand.white,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Brand.line,
    padding: 14,
  },
  metricCompact: { minWidth: 132, borderRadius: 14, padding: 10 },
  metricLine: { width: 34, height: 3, borderRadius: 2, marginBottom: 12 },
  metricLineCompact: { width: 28, marginBottom: 7 },
  metricLabel: { color: Brand.muted, fontSize: 11, fontFamily: Fonts.bold, textTransform: 'uppercase' },
  metricLabelCompact: { fontSize: 9 },
  metricValue: { color: Brand.navyDeep, fontSize: 21, fontFamily: Fonts.extraBold, marginTop: 7, ...TabularNumbers },
  metricValueCompact: { fontSize: 18, marginTop: 4 },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.pill,
  },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 11, fontFamily: Fonts.bold },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { color: Brand.muted, fontFamily: Fonts.bold },
  skeletonList: { flex: 1, gap: 12, paddingVertical: 4 },
  skeletonCard: {
    gap: 13,
    padding: 14,
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: Brand.line,
    backgroundColor: Brand.white,
  },
  skeletonHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skeletonCopy: { flex: 1, gap: 9 },
  emptyGraphic: { width: 82, height: 72, alignItems: 'center', justifyContent: 'center' },
  emptyGraphicSun: {
    position: 'absolute', top: 0, right: 3, width: 25, height: 25,
    borderRadius: 13, backgroundColor: Brand.goldSoft,
  },
  emptyGraphicPlate: {
    width: 61, height: 61, borderRadius: 31, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Brand.mint, borderWidth: 5, borderColor: Brand.white,
    ...Shadow,
  },
  emptyGraphicLeaf: {
    position: 'absolute', left: 2, bottom: 4, width: 21, height: 10,
    borderTopLeftRadius: 12, borderBottomRightRadius: 12, backgroundColor: Brand.teal,
    transform: [{ rotate: '-18deg' }],
  },
});
