/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { type Href, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { FolderHub, FolderSection } from '@/components/folder-section';
import { HaccpLabelCard } from '@/components/haccp-label-card';
import { ToolHeader } from '@/components/tool-header';
import { AppButton, Body, Card, Field, IconButton, SectionHeader } from '@/components/ui';
import { CATEGORY_LABEL_KEY } from '@/constants/categories';
import { Brand, Fonts, Radius, TabularNumbers } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { useWorkspace } from '@/contexts/workspace-context';
import { buildShoppingList, buildShoppingListMessage } from '@/lib/operations';
import { displayUnit } from '@/lib/display-unit';
import { createProductionDocumentId, saveConsumptionVoucher } from '@/lib/production-documents-repository';
import { addProductionRecipe, buildProductionRequests, parseProductionPortions, removeProductionRecipe, searchProductionRecipes, type ProductionPlan } from '@/lib/production-plan';
import { shareByEmail, shareOnWhatsApp } from '@/lib/share-links';

export function ProductionWorkspace({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const auth = useAuth();
  const { t, locale } = useI18n();
  const { format } = usePreferences();
  const { recipes, catalog } = useWorkspace();
  const [portions, setPortions] = useState<ProductionPlan>({});
  const [sharing, setSharing] = useState(false);
  const [query, setQuery] = useState('');
  const [savingVoucher, setSavingVoucher] = useState(false);
  const sellable = recipes.filter((recipe) => !recipe.isSubRecipe);
  const selected = Object.keys(portions).flatMap((id) => {
    const recipe = sellable.find((item) => item.id === id);
    return recipe ? [recipe] : [];
  });
  const matches = useMemo(() => searchProductionRecipes(recipes, query, portions, (recipe) => (
    recipe.category ? t(CATEGORY_LABEL_KEY[recipe.category]) : ''
  )), [recipes, query, portions, t]);
  const requests = useMemo(() => buildProductionRequests(recipes, portions), [recipes, portions]);
  const lines = useMemo(
    () => buildShoppingList(recipes, catalog, requests),
    [catalog, recipes, requests],
  );
  const total = lines.reduce((sum, line) => sum + line.cost, 0);

  const update = (recipeId: string, raw: string) => {
    setPortions((current) => ({
      ...current,
      [recipeId]: parseProductionPortions(raw),
    }));
  };

  const shareList = async (channel: 'whatsapp' | 'email') => {
    if (!lines.length || sharing) return;
    const message = buildShoppingListMessage({
      title: t('production.shareHeading', { date: format.date(new Date().toISOString()) }),
      lines,
      totalLabel: t('production.total'),
      totalValue: format.money(total),
      locale,
    });
    setSharing(true);
    try {
      if (channel === 'whatsapp') await shareOnWhatsApp(message);
      else await shareByEmail(t('production.shareSubject'), message);
    } catch {
      Alert.alert(t('production.shareFailedTitle'), t('production.shareFailedBody'));
    } finally {
      setSharing(false);
    }
  };

  const createVoucherFromPlan = async () => {
    if (!lines.length || savingVoucher) return;
    setSavingVoucher(true);
    try {
      const today = new Date();
      const documentDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const saved = await saveConsumptionVoucher(auth.user?.id ?? 'demo', {
        id: createProductionDocumentId(),
        documentDate,
        reference: t('production.voucherFromPlanReference'),
        source: 'production_plan',
        sourceReference: null,
        notes: '',
        lines: lines.map((line) => ({
          id: createProductionDocumentId(),
          catalogId: line.key.includes('|') ? null : line.key,
          name: line.name,
          quantity: line.quantity,
          unit: line.unit,
          purchasePrice: line.quantity > 0 ? line.cost / line.quantity : 0,
          priceUnit: line.unit,
          cost: line.cost,
        })),
      });
      router.push(`/tools/consumption-vouchers?id=${saved.id}` as Href);
    } catch (error) {
      Alert.alert(locale === 'ro' ? 'Bonul nu a fost salvat' : 'The voucher was not saved', error instanceof Error ? error.message : t('common.tryAgain'));
    } finally {
      setSavingVoucher(false);
    }
  };

  return (
    <FolderHub header={<ToolHeader title={t('production.title')} subtitle={t('production.subtitle')} showBack={!embedded} />}>
      <FolderSection id="plan" icon="calendar-outline" photo="planning" accent="gold"
        title={locale === 'ro' ? 'Planificare' : 'Production plan'}
        summary={locale === 'ro' ? `${selected.length} preparate · ${format.number(requests.reduce((sum, item) => sum + item.portions, 0))} porții` : `${selected.length} dishes · ${format.number(requests.reduce((sum, item) => sum + item.portions, 0))} portions`}>
        <Body>{t('production.planBody')}</Body>
        <View style={styles.search}>
          <Ionicons name="search" size={19} color={Brand.muted} />
          <TextInput
            accessibilityLabel={t('recipes.searchLabel')}
            placeholder={t('recipes.searchPlaceholder')}
            placeholderTextColor="#98A3AD"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            style={styles.searchInput}
          />
        </View>
        {matches.slice(0, 5).map((recipe) => (
          <Pressable
            key={recipe.id}
            accessibilityRole="button"
            accessibilityLabel={`${locale === 'ro' ? 'Adaugă' : 'Add'} ${recipe.title}`}
            onPress={() => {
              setPortions((current) => addProductionRecipe(current, recipe));
              setQuery('');
            }}
            style={({ pressed }) => [styles.searchResult, pressed && styles.pressed]}>
            <View style={styles.copy}>
              <Text style={styles.title}>{recipe.title}</Text>
              <Text style={styles.meta}>{recipe.category ? t(CATEGORY_LABEL_KEY[recipe.category]) : t('tabs.recipes')}</Text>
            </View>
            <Ionicons name="add-circle-outline" size={25} color={Brand.tealDeep} />
          </Pressable>
        ))}
        {matches.length > 5 && <Body>{locale === 'ro' ? `Primele 5 din ${matches.length} rezultate. Restrânge căutarea.` : `First 5 of ${matches.length} results. Refine your search.`}</Body>}
        {!!query.trim() && !matches.length && <Body>{locale === 'ro' ? 'Niciun preparat nou găsit. Preparatele adăugate sunt deja în plan.' : 'No new dishes found. Added dishes are already in the plan.'}</Body>}
        {!!selected.length && <SectionHeader title={locale === 'ro' ? 'Preparatele din plan' : 'Dishes in the plan'} />}
        {selected.map((recipe) => (
          <View key={recipe.id} style={styles.recipeRow}>
            <View style={styles.copy}>
              <Text style={styles.title}>{recipe.title}</Text>
              <Text style={styles.meta}>{t('production.basePortions', { count: recipe.servings })}</Text>
            </View>
            <Field
              style={styles.field}
              label={t('production.portions')}
              keyboardType="decimal-pad"
              value={portions[recipe.id] ? String(portions[recipe.id]) : ''}
              onChangeText={(value) => update(recipe.id, value)}
            />
            <IconButton icon="close-outline" label={`${locale === 'ro' ? 'Elimină' : 'Remove'} ${recipe.title}`} onPress={() => setPortions((current) => removeProductionRecipe(current, recipe.id))} />
          </View>
        ))}
        {!sellable.length && <Body>{t('production.noRecipes')}</Body>}
        {!!sellable.length && !selected.length && !query.trim() && <Body>{locale === 'ro' ? 'Planul este gol. Caută primul preparat.' : 'The plan is empty. Search for your first dish.'}</Body>}
      </FolderSection>

      <FolderSection id="shopping" icon="cart-outline" photo="suppliers" accent="green"
        title={t('production.listTitle')}
        summary={locale === 'ro' ? `${lines.length} ingrediente · ${format.money(total)}` : `${lines.length} ingredients · ${format.money(total)}`}>
      <Card tone={lines.length ? 'gold' : 'soft'}>
        <SectionHeader eyebrow={t('production.listEyebrow')} title={t('production.listTitle')} />
        {!lines.length && <Body>{t('production.empty')}</Body>}
        {lines.map((line) => (
          <View key={line.key} style={styles.line}>
            <View style={styles.copy}>
              <Text style={styles.title}>{line.name}</Text>
              <Text style={styles.meta}>{line.supplier ?? t('production.noSupplier')}</Text>
            </View>
            <View style={styles.right}>
              <Text style={styles.quantity}>{format.number(line.quantity)} {displayUnit(line.unit, locale)}</Text>
              <Text style={styles.cost}>{format.money(line.cost)}</Text>
            </View>
          </View>
        ))}
        {!!lines.length && (
          <>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('production.total')}</Text>
              <Text style={styles.totalValue}>{format.money(total)}</Text>
            </View>
            <View style={styles.actions}>
              <AppButton
                label={t('production.shareWhatsapp')}
                icon="logo-whatsapp"
                variant="secondary"
                disabled={sharing}
                onPress={() => void shareList('whatsapp')}
              />
              <AppButton
                label={t('production.shareEmail')}
                icon="mail-outline"
                variant="secondary"
                disabled={sharing}
                onPress={() => void shareList('email')}
              />
              <AppButton
                label={t('production.createVoucherFromPlan')}
                icon="receipt-outline"
                loading={savingVoucher}
                onPress={() => void createVoucherFromPlan()}
              />
            </View>
          </>
        )}
      </Card>
      </FolderSection>

      <FolderSection id="invoices" icon="receipt-outline" photo="exports" accent="navy" title={locale === 'ro' ? 'Facturi și e-Factura' : 'Invoices and e-Invoice'} summary={locale === 'ro' ? 'Scanare, prețuri și SPV' : 'Scanning, prices and SPV'}>
        <Card style={styles.invoiceCard}>
          <View style={styles.quickHeader}>
            <View style={[styles.quickIcon, styles.invoiceIcon]}>
              <Ionicons name="camera-outline" size={21} color={Brand.navyDeep} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.quickTitle}>{locale === 'ro' ? 'Facturi și prețuri' : 'Invoices and prices'}</Text>
              <Body>{locale === 'ro'
                ? 'Scanează facturile, confirmă noile prețuri și pregătește documentele pentru SPV.'
                : 'Scan invoices, confirm updated prices and prepare documents for SPV.'}</Body>
            </View>
          </View>
          <View style={styles.actions}>
            <AppButton
              label={locale === 'ro' ? 'Scanează o factură' : 'Scan an invoice'}
              icon="camera-outline"
              onPress={() => router.push('/tools/invoice-import' as Href)}
            />
            <AppButton
              label={locale === 'ro' ? 'e-Factura / SPV' : 'e-Invoice / SPV'}
              icon="cloud-upload-outline"
              variant="secondary"
              onPress={() => router.push('/tools/efactura' as Href)}
            />
          </View>
        </Card>
      </FolderSection>
      <FolderSection id="vouchers" icon="clipboard-outline" photo="operations" accent="teal" title={t('production.voucherTitle')} summary={t('production.voucherBody')}>
        <Card tone="soft">
          <View style={styles.quickHeader}>
            <View style={styles.quickIcon}>
              <Ionicons name="receipt-outline" size={21} color={Brand.tealDeep} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.quickTitle}>{t('production.voucherTitle')}</Text>
              <Body>{t('production.voucherBody')}</Body>
            </View>
          </View>
          <View style={styles.actions}>
            <AppButton
              label={t('production.voucherCreate')}
              icon="add-circle-outline"
              onPress={() => router.push('/tools/consumption-vouchers?mode=create' as Href)}
            />
            <AppButton
              label={t('production.voucherImport')}
              icon="document-attach-outline"
              variant="secondary"
              onPress={() => router.push('/tools/consumption-vouchers?mode=import' as Href)}
            />
          </View>
        </Card>
      </FolderSection>
      <FolderSection id="stock" icon="cube-outline" photo="ingredients" accent="amber" title={locale === 'ro' ? 'Stoc, comenzi și risipă' : 'Stock, orders and waste'} summary={locale === 'ro' ? 'Inventar și control operațional' : 'Inventory and operational control'}>
        <Card tone="soft">
          <View style={styles.quickHeader}>
            <View style={styles.quickIcon}>
              <Ionicons name="layers-outline" size={21} color={Brand.tealDeep} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.quickTitle}>{locale === 'ro' ? 'Stoc, comenzi și risipă' : 'Stock, orders and waste'}</Text>
              <Body>{locale === 'ro' ? 'Praguri de stoc, comenzi grupate pe furnizor, inventar recurent și registru deșeuri.' : 'Stock thresholds, supplier-grouped orders, recurring inventory and waste register.'}</Body>
            </View>
          </View>
          <View style={styles.actions}>
            <AppButton label={locale === 'ro' ? 'Control stoc' : 'Stock control'} icon="arrow-forward-outline" variant="secondary" onPress={() => router.push('/tools/operations-control' as Href)} />
            <AppButton label={locale === 'ro' ? 'Dosar risipă' : 'Waste dossier'} icon="document-text-outline" variant="secondary" onPress={() => router.push('/tools/waste-compliance' as Href)} />
            <AppButton label={locale === 'ro' ? 'Control managerial' : 'Management control'} icon="pulse-outline" variant="secondary" onPress={() => router.push('/tools/management-control' as Href)} />
          </View>
        </Card>
      </FolderSection>


      <FolderSection id="labels" icon="pricetag-outline" photo="haccp" accent="teal" title={locale === 'ro' ? 'Etichete de producție' : 'Production labels'} summary={locale === 'ro' ? 'Preparare, păstrare și trasabilitate' : 'Preparation, storage and traceability'}>
        <HaccpLabelCard />
      </FolderSection>
    </FolderHub>
  );
}

export default function ProductionScreen() {
  return <ProductionWorkspace />;
}

const styles = StyleSheet.create({
  invoiceCard: { backgroundColor: Brand.goldSoft, borderColor: '#DEB957' },
  invoiceIcon: { backgroundColor: Brand.gold },
  quickHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  quickIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: Brand.tealSoft, alignItems: 'center', justifyContent: 'center' },
  quickTitle: { color: Brand.navyDeep, fontSize: 16, fontFamily: Fonts.extraBold, marginBottom: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recipeRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderTopColor: Brand.line, paddingTop: 10 },
  recipeIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: Brand.tealSoft, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  title: { color: Brand.navyDeep, fontSize: 13, fontFamily: Fonts.extraBold },
  meta: { color: Brand.muted, fontSize: 10, marginTop: 2 },
  field: { width: 76 },
  search: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: Brand.line, borderRadius: Radius.medium, backgroundColor: Brand.white },
  searchInput: { flex: 1, minHeight: 46, paddingHorizontal: 8, color: Brand.ink, fontSize: 13, fontFamily: Fonts.regular },
  searchResult: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, padding: 10, borderRadius: 12, backgroundColor: Brand.tealSoft },
  pressed: { opacity: 0.72 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#E6C978', paddingTop: 10 },
  right: { alignItems: 'flex-end' },
  quantity: { color: Brand.navyDeep, fontSize: 13, fontFamily: Fonts.extraBold, ...TabularNumbers },
  cost: { color: Brand.muted, fontSize: 10, marginTop: 2 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#DAB85D', paddingTop: 12 },
  totalLabel: { color: Brand.navy, fontSize: 13, fontFamily: Fonts.bold },
  totalValue: { color: Brand.navyDeep, fontSize: 20, fontFamily: Fonts.extraBold, ...TabularNumbers },
});
