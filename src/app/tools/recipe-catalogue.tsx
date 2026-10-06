import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Body, BrandHeader, Card, IconButton, Screen, SectionHeader, Title } from '@/components/ui';
import { Brand, Fonts, Radius } from '@/constants/theme';
import { useI18n } from '@/contexts/locale-context';
import { FOODCOM_NUTRIENT_LABELS, FOODCOM_NUTRIENT_UNITS, foodcomQuality, foodcomSourceUrl,
  type FoodcomPage, type FoodcomProgress, type FoodcomRecipe, type FoodcomState } from '@/lib/foodcom-catalog';
import { foodcomCopy, foodcomError } from '@/lib/foodcom-catalog-copy';
import { foodcomReader } from '@/lib/foodcom-catalog-store';

function Action({ label, onPress, disabled, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.action, secondary && styles.secondary, (disabled || pressed) && styles.dim]}>
    <Text style={[styles.actionText, secondary && styles.secondaryText]}>{label}</Text>
  </Pressable>;
}

export default function RecipeCatalogueScreen() {
  const router = useRouter();
  const { recipe: requestedRecipe } = useLocalSearchParams<{ recipe?: string }>();
  const { locale, format } = useI18n();
  const text = foodcomCopy(locale);
  const [state, setState] = useState<FoodcomState | null>(null);
  const [query, setQuery] = useState('');
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const cursor = cursors[cursors.length - 1];
  const [page, setPage] = useState<FoodcomPage>({ items: [], nextCursor: null });
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<FoodcomRecipe | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [refresh, setRefresh] = useState(0);
  const [progress, setProgress] = useState<FoodcomProgress | null>(null);
  const installation = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; installation.current?.abort(); };
  }, []);
  useEffect(() => {
    const id = Number(requestedRecipe);
    if (Number.isSafeInteger(id) && id > 0) setSelected(id);
  }, [requestedRecipe]);
  useEffect(() => {
    let active = true;
    foodcomReader.getState().then((value) => { if (active) { setState(value); setError(null); } }).catch((caught) => { if (active) { setState({ installed: false, count: 0 }); setError(caught); } });
    return () => { active = false; };
  }, [refresh]);
  useEffect(() => {
    if (!state?.installed || selected !== null) return;
    const controller = new AbortController();
    setLoading(true); setError(null);
    const timer = setTimeout(() => {
      foodcomReader.search({ query, cursor, limit: 30, signal: controller.signal }).then((value) => {
        if (!controller.signal.aborted) setPage(value);
      }).catch((caught) => { if (!controller.signal.aborted) { setError(caught); setPage({ items: [], nextCursor: null }); } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [state?.installed, query, cursor, selected, refresh]);
  useEffect(() => {
    if (!state?.installed || selected === null) return;
    const controller = new AbortController();
    setDetail(null); setLoading(true); setError(null);
    foodcomReader.getDetail(selected, controller.signal).then((value) => { if (!controller.signal.aborted) setDetail(value); })
      .catch((caught) => { if (!controller.signal.aborted) setError(caught); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [state?.installed, selected, refresh]);

  const install = async () => {
    const controller = new AbortController();
    installation.current = controller;
    setError(null); setProgress({ phase: 'downloading', completed: 0, total: 1 });
    try {
      await foodcomReader.install((value) => { if (mounted.current) setProgress(value); }, controller.signal);
    } catch (caught) { if (mounted.current && !controller.signal.aborted && !String(caught).includes('FOODCOM_CANCELLED')) setError(caught); }
    finally {
      installation.current = null;
      if (mounted.current) { setProgress(null); setState(await foodcomReader.getState().catch(() => ({ installed: false, count: 0 }))); }
    }
  };
  const remove = async () => {
    try { await foodcomReader.remove(); setState({ installed: false, count: 0 }); setSelected(null); setPage({ items: [], nextCursor: null }); setError(null); }
    catch (caught) { setError(caught); }
  };
  const quality = detail ? foodcomQuality(detail) : null;

  return <Screen>
    <BrandHeader mini />
    <View style={styles.top}>
      <IconButton icon="arrow-back" label={text.back} onPress={() => selected === null ? router.back() : setSelected(null)} />
      <Text style={styles.heading}>{text.title}</Text><View style={{ width: 42 }} />
    </View>
    {selected === null && <View><Title>{text.title}</Title><Body>{text.subtitle}</Body></View>}
    {!!error && <Card tone="gold"><Body>{foodcomError(error, locale)}</Body><Action label={text.retry} secondary onPress={() => state?.installed ? setRefresh((value) => value + 1) : void install()} /></Card>}
    {!state && <ActivityIndicator accessibilityLabel={text.loading} color={Brand.gold} />}
    {state && !state.installed && <Card>
      <SectionHeader title={text.downloadTitle} /><Body>{Platform.OS === 'web' ? text.webSize : text.nativeSize}</Body>
      <Body>{text.sourceWarning}</Body>
      {progress ? <View style={styles.gap}>
        <ActivityIndicator color={Brand.gold} />
        <Text style={styles.status}>{text[progress.phase]} · {Math.min(100, Math.floor(progress.completed / Math.max(1, progress.total) * 100))}%</Text>
        <Action label={text.pause} secondary onPress={() => installation.current?.abort()} />
      </View> : <View style={styles.gap}><Action label={text.resume} onPress={() => { void install(); }} />
        <Action label={text.remove} secondary onPress={() => { void remove(); }} /><Text style={styles.note}>{text.removeNote}</Text>
      </View>}
      <Text style={styles.note}>{text.licence}</Text>
    </Card>}
    {state?.installed && selected === null && <>
      <Card tone="soft"><Text style={styles.status}>{text.ready}</Text><Body>{text.sourceWarning}</Body>
        <Action label={text.remove} secondary onPress={() => { void remove(); }} /><Text style={styles.note}>{text.removeNote}</Text>
      </Card>
      <View style={styles.search}><Ionicons name="search" size={19} color={Brand.muted} />
        <TextInput accessibilityLabel={text.search} placeholder={text.search} placeholderTextColor={Brand.muted} value={query} maxLength={160}
          onChangeText={(value) => { setQuery(value); setCursors([null]); }} style={styles.input} />
      </View><Text style={styles.note}>{text.searchHint}</Text>
      {loading ? <ActivityIndicator accessibilityLabel={text.loading} color={Brand.gold} /> : <>
        {!error && !page.items.length && <Body>{text.empty}</Body>}
        {page.items.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title} onPress={() => setSelected(item.id)}>
          <Card><Text style={styles.category}>{item.category ?? text.unknown}</Text><Text style={styles.recipeTitle}>{item.title}</Text>
            <Text style={styles.note}>Food.com #{item.id}</Text></Card>
        </Pressable>)}
      </>}
      <View style={styles.navigation}>
        <Action label={text.previous} secondary disabled={loading || cursors.length === 1} onPress={() => setCursors((values) => values.slice(0, -1))} />
        <Action label={text.next} secondary disabled={loading || !page.nextCursor} onPress={() => setCursors((values) => [...values, page.nextCursor])} />
      </View>
    </>}
    {state?.installed && selected !== null && (loading ? <ActivityIndicator accessibilityLabel={text.loading} color={Brand.gold} /> : detail ? <>
      <Title>{detail.title}</Title><Text style={styles.category}>{detail.category ?? text.unknown} · Food.com #{detail.id}</Text>
      <Card tone="gold"><Body>{text.sourceWarning}</Body>{quality?.quantitiesUnmatched && <Body>{text.mismatch}</Body>}</Card>
      <Card><Body>{text.sourceServings}: {detail.servings ?? text.unknown}</Body><Body>{text.sourceYield}: {detail.yield ?? text.unknown}</Body></Card>
      <Card><SectionHeader title={text.ingredients} />{detail.ingredients.length ? detail.ingredients.map((item, index) => <Body key={index}>• {item}</Body>) : <Body>{text.unknown}</Body>}</Card>
      <Card><SectionHeader title={text.quantities} /><Body>{detail.quantities.map((item) => item ?? text.unknown).join(' | ') || text.unknown}</Body><Text style={styles.note}>{text.quantitiesNote}</Text></Card>
      <Card><SectionHeader title={text.nutrition} /><Body>{text.nutritionNote}</Body>
        {detail.nutrition.map((value, index) => <View key={index} style={styles.nutrient}><Text style={styles.nutrientLabel}>{FOODCOM_NUTRIENT_LABELS[locale][index]}</Text>
          <Text style={styles.nutrientValue}>{value === null ? text.unknown : `${format.number(value, 1)} ${FOODCOM_NUTRIENT_UNITS[index]}`}</Text></View>)}
      </Card>
      <Card><SectionHeader title={text.instructions} />{detail.instructions.length ? detail.instructions.map((step, index) => <Body key={index}>{index + 1}. {step}</Body>) : <Body>{text.unknown}</Body>}</Card>
      <Card tone="gold"><Body>{text.useNote}</Body>{quality?.missingServings && <Body>{text.noServings}</Body>}
        <Action label={text.use} onPress={() => router.push(`/recipe/new?foodcom=${detail.id}`)} />
        <Action label={text.source} secondary onPress={() => { void Linking.openURL(foodcomSourceUrl(detail)).catch(setError); }} />
        <Text style={styles.note}>{text.licence}</Text>
      </Card>
    </> : !error && <Body>{text.missing}</Body>)}
  </Screen>;
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 }, heading: { flex: 1, textAlign: 'center', color: Brand.navy, fontFamily: Fonts.bold, fontSize: 15 },
  action: { minHeight: 44, borderRadius: Radius.medium, paddingVertical: 12, paddingHorizontal: 15, backgroundColor: Brand.navy, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: Brand.white, borderWidth: 1, borderColor: Brand.line }, actionText: { color: Brand.white, fontFamily: Fonts.bold, fontSize: 13 }, secondaryText: { color: Brand.navy }, dim: { opacity: 0.5 },
  gap: { gap: 12 }, status: { color: Brand.navy, fontFamily: Fonts.bold, fontSize: 13 }, note: { color: Brand.muted, fontFamily: Fonts.regular, fontSize: 12, lineHeight: 18 },
  search: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Brand.line, borderRadius: Radius.medium, backgroundColor: Brand.white, paddingHorizontal: 12 },
  input: { flex: 1, minHeight: 48, paddingHorizontal: 10, color: Brand.ink, fontFamily: Fonts.regular, fontSize: 14 },
  category: { color: Brand.goldInk, fontFamily: Fonts.bold, fontSize: 12 }, recipeTitle: { color: Brand.navy, fontFamily: Fonts.extraBold, fontSize: 16, lineHeight: 22 },
  navigation: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  nutrient: { flexDirection: 'row', justifyContent: 'space-between', gap: 15, paddingVertical: 5, borderBottomWidth: 1, borderColor: Brand.line },
  nutrientLabel: { flex: 1, color: Brand.ink, fontSize: 13, fontFamily: Fonts.regular }, nutrientValue: { color: Brand.navy, fontSize: 13, fontFamily: Fonts.bold },
});
