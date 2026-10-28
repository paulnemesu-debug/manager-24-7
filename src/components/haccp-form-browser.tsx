import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChoiceRow, Select } from '@/components/inputs';
import { AppButton, Body, Card, Field } from '@/components/ui';
import { HACCP_CATEGORY_LABELS, HACCP_FORMS, localize, type HaccpFormCategory } from '@/constants/haccp-forms';
import { Brand, Fonts } from '@/constants/theme';
import type { Locale } from '@/i18n/translations';
import type { HaccpDocument } from '@/types/haccp';

const PAGE_SIZE = 6;
const CATEGORIES: HaccpFormCategory[] = ['personnel', 'pest', 'sanitation', 'production', 'storage', 'reception'];

export function HaccpFormBrowser({ locale, documents, favorites, ready, initialFavorites = false, toggleFavorite, openForm }: {
  locale: Locale;
  documents: readonly HaccpDocument[];
  favorites: readonly string[];
  ready: boolean;
  initialFavorites?: boolean;
  toggleFavorite: (code: string) => Promise<void>;
  openForm: (code: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<HaccpFormCategory | 'all'>('all');
  const [scope, setScope] = useState<'all' | 'favorites'>(initialFavorites ? 'favorites' : 'all');
  const [page, setPage] = useState(1);
  const [busyCodes, setBusyCodes] = useState<string[]>([]);
  const forms = useMemo(() => {
    const search = query.trim().toLocaleLowerCase(locale === 'ro' ? 'ro-RO' : 'en-GB').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return HACCP_FORMS.filter((form) => (scope === 'all' || favorites.includes(form.code))
      && (category === 'all' || form.category === category)
      && `${form.code} ${localize(form.title, locale)}`.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(search));
  }, [category, favorites, locale, query, scope]);
  const pages = Math.max(1, Math.ceil(forms.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const star = async (code: string) => {
    if (busyCodes.includes(code) || !ready) return;
    setBusyCodes((codes) => [...codes, code]);
    try { await toggleFavorite(code); }
    catch { Alert.alert(locale === 'ro' ? 'Favoritul nu a fost salvat' : 'Favorite was not saved', locale === 'ro' ? 'Încearcă din nou. Selecția anterioară este păstrată.' : 'Try again. The previous selection is kept.'); }
    finally { setBusyCodes((codes) => codes.filter((item) => item !== code)); }
  };
  return <>
    <ChoiceRow options={[
      { value: 'all' as const, label: locale === 'ro' ? 'Toate formularele' : 'All forms' },
      { value: 'favorites' as const, label: `${locale === 'ro' ? 'Favorite' : 'Favorites'} (${favorites.length})` },
    ]} value={scope} onChange={(value) => { setScope(value); setPage(1); }} />
    <Field label={locale === 'ro' ? 'Caută un formular' : 'Find a form'} placeholder={locale === 'ro' ? 'Nume sau cod, de exemplu frigider' : 'Name or code, for example fridge'} value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} />
    <Select label={locale === 'ro' ? 'Categorie' : 'Category'} placeholder={locale === 'ro' ? 'Toate categoriile' : 'All categories'} value={category}
      options={[{ value: 'all', label: locale === 'ro' ? 'Toate categoriile' : 'All categories' }, ...CATEGORIES.map((value) => ({ value, label: localize(HACCP_CATEGORY_LABELS[value], locale) }))]}
      onChange={(value) => { setCategory(value ?? 'all'); setPage(1); }} />
    <Body>{locale === 'ro' ? 'Apasă steaua pentru formularele pe care vrei să le găsești rapid. Favoritele se păstrează pe acest dispozitiv, separat pentru fiecare cont.' : 'Tap the star for the forms you want to find quickly. Favorites stay on this device, separately for each account.'}</Body>
    {forms.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE).map((form) => {
      const selected = favorites.includes(form.code);
      const count = documents.filter((document) => document.formCode === form.code).length;
      return <View key={form.code} style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={localize(form.title, locale)} onPress={() => openForm(form.code)} style={({ pressed }) => [styles.open, pressed && styles.pressed]}>
          <Text style={styles.code}>{form.code} · {localize(HACCP_CATEGORY_LABELS[form.category], locale)}</Text>
          <Text style={styles.title}>{localize(form.shortTitle, locale)}</Text>
          <Text style={styles.meta}>{count ? `${count} ${locale === 'ro' ? 'înregistrări' : 'records'}` : locale === 'ro' ? 'Fără înregistrări' : 'No records'}</Text>
        </Pressable>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: !ready || busyCodes.includes(form.code) }}
          accessibilityLabel={`${selected ? (locale === 'ro' ? 'Scoate din favorite' : 'Remove favorite') : (locale === 'ro' ? 'Adaugă la favorite' : 'Add favorite')}: ${localize(form.shortTitle, locale)}`}
          disabled={!ready || busyCodes.includes(form.code)} onPress={() => void star(form.code)} style={styles.star}>
          <Ionicons name={selected ? 'star' : 'star-outline'} size={25} color={selected ? Brand.goldInk : Brand.muted} />
        </Pressable>
      </View>;
    })}
    {!forms.length && <Card tone="soft"><Body>{scope === 'favorites' && !favorites.length
      ? (locale === 'ro' ? 'Nu ai favorite încă. Alege „Toate formularele” și apasă steaua celor dorite.' : 'No favorites yet. Choose “All forms” and star the ones you need.')
      : (locale === 'ro' ? 'Niciun formular pentru această căutare.' : 'No form matches this search.')}</Body></Card>}
    {pages > 1 && <View style={styles.pager}>
      <AppButton label={locale === 'ro' ? 'Înapoi' : 'Previous'} variant="secondary" disabled={current === 1} onPress={() => setPage(current - 1)} />
      <Text style={styles.meta}>{current} / {pages}</Text>
      <AppButton label={locale === 'ro' ? 'Înainte' : 'Next'} variant="secondary" disabled={current === pages} onPress={() => setPage(current + 1)} />
    </View>}
  </>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Brand.line, backgroundColor: Brand.white, borderRadius: 18 },
  open: { flex: 1, minWidth: 0, padding: 14, gap: 4 },
  code: { fontSize: 10, lineHeight: 14, fontFamily: Fonts.bold, color: Brand.tealDeep },
  title: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.extraBold, color: Brand.navyDeep },
  meta: { fontSize: 11, lineHeight: 16, fontFamily: Fonts.regular, color: Brand.muted },
  star: { width: 52, minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pressed: { opacity: 0.7 },
});
