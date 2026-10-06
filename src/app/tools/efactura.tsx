import { useI18n } from '@/contexts/locale-context';
/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { readDocumentText } from '@/lib/document-bytes';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';

import { ToolHeader } from '@/components/tool-header';
import { AppButton, Body, Card, Screen, SectionHeader, StatusPill } from '@/components/ui';
import { Brand, Fonts, TabularNumbers } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { usePreferences } from '@/contexts/preferences-context';
import { efacturaToScannedInvoice, parseEfacturaXml } from '@/lib/efactura';
import { stageInvoiceImport } from '@/lib/invoice-import-handoff';

const OAUTH_REGISTRATION_URL = 'https://www.anaf.ro/InregOauth/';
const API_GUIDE_URL = 'https://mfinante.gov.ro/static/10/eFactura/prezentare%20api%20efactura.pdf';

export default function EFacturaScreen() {
  const router = useRouter();
  const auth = useAuth();
  const { locale, t } = useI18n();
  const { format } = usePreferences();
  const [xml, setXml] = useState<string | null>(null);
  const document = useMemo(() => xml ? parseEfacturaXml(xml, locale) : null, [xml, locale]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pickXml = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ['application/xml', 'text/xml', 'text/plain'], copyToCacheDirectory: true, multiple: false });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    if ((asset.size ?? 0) > 10_000_000) {
      Alert.alert(t('operational.efactura.tooLarge'), t('operational.efactura.sizeLimit'));
      return;
    }
    setBusy(true);
    try {
      const content = await readDocumentText(asset.uri);
      parseEfacturaXml(content, locale);
      setXml(content);
      setFileName(asset.name);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const message = code === 'efactura_unsafe_xml'
        ? t('operational.efactura.unsafe')
        : code === 'efactura_invalid_root'
          ? t('operational.efactura.invalidRoot')
          : t('operational.efactura.unreadable');
      Alert.alert(t('operational.efactura.invalid'), message);
    } finally { setBusy(false); }
  };

  return (
    <Screen>
      <ToolHeader title="e-Factura / SPV" subtitle={t('operational.efactura.subtitle')} />

      <Card tone="navy">
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}><Ionicons name="shield-checkmark-outline" size={25} color={Brand.navyDeep} /></View>
          <View style={styles.copy}>
            <Text style={styles.heroTitle}>{t('operational.efactura.connector')}</Text>
            <StatusPill label={t('operational.efactura.requires')} status="watch" />
          </View>
        </View>
        <Body light>{t('operational.efactura.tokenNote')}</Body>
      </Card>

      <Card>
        <SectionHeader eyebrow={t('operational.efactura.setup')} title={t('operational.efactura.once')} />
        <Checklist index="1" title={t('operational.efactura.certificate')} body={t('operational.efactura.certificateNote')} />
        <Checklist index="2" title={t('operational.efactura.oauth')} body={t('operational.efactura.oauthNote')} />
        <Checklist index="3" title={t('operational.efactura.vault')} body={t('operational.efactura.vaultNote')} />
        <Checklist index="4" title={t('operational.efactura.upload')} body={t('operational.efactura.uploadNote')} />
        <View style={styles.actions}>
          <AppButton label={t('operational.efactura.register')} icon="open-outline" variant="secondary" onPress={() => void Linking.openURL(OAUTH_REGISTRATION_URL)} />
          <AppButton label={t('operational.efactura.guide')} icon="document-text-outline" variant="ghost" onPress={() => void Linking.openURL(API_GUIDE_URL)} />
        </View>
      </Card>

      <Card tone="soft">
        <SectionHeader eyebrow={t('operational.efactura.available')} title={t('operational.efactura.validate')} />
        <Body>{t('operational.efactura.validateNote')}</Body>
        <AppButton label={t('operational.efactura.choose')} icon="cloud-upload-outline" fullWidth loading={busy} onPress={() => void pickXml()} />
      </Card>

      {document && (
        <>
          <Card tone={document.errors.length ? 'gold' : 'soft'}>
            <View style={styles.resultHeader}>
              <View style={styles.copy}>
                <Text style={styles.resultTitle}>{document.invoiceNumber || fileName || t('operational.efactura.document')}</Text>
                <Text style={styles.meta}>{[document.issueDate, document.supplierName, document.currency].filter(Boolean).join(' · ')}</Text>
              </View>
              <StatusPill label={document.errors.length ? t('operational.efactura.errorCount', { count: document.errors.length }) : t('operational.efactura.structure')} status={document.errors.length ? 'critical' : 'healthy'} />
            </View>
            <View style={styles.metrics}>
              <Metric label={t('operational.documents.supplier')} value={document.supplierTaxId || '—'} />
              <Metric label={t('operational.efactura.customer')} value={document.customerTaxId || '—'} />
              <Metric label={t('operational.efactura.lines')} value={String(document.lines.length)} />
              <Metric label="Total" value={document.payableAmount === null ? '—' : format.money(document.payableAmount)} />
            </View>
            {document.errors.map((message) => <Notice key={message} critical text={message} />)}
            {document.warnings.map((message) => <Notice key={message} text={message} />)}
          </Card>

          <Card>
            <SectionHeader title={t('operational.efactura.invoiceLines')} />
            {document.lines.slice(0, 100).map((line) => (
              <View key={`${line.id}:${line.name}`} style={styles.line}>
                <View style={styles.copy}>
                  <Text style={styles.lineName}>{line.name}</Text>
                  <Text style={styles.meta}>{line.quantity ?? '—'} {line.unit ?? line.unitCode ?? '—'} · {t('operational.efactura.vat')} {line.vatPercent ?? '—'}%</Text>
                </View>
                <Text style={styles.linePrice}>{line.unitPrice === null ? '—' : format.money(line.unitPrice)}</Text>
              </View>
            ))}
          </Card>
          <AppButton label={t('operational.efactura.import')} icon="pricetags-outline" fullWidth onPress={() => {
            const handoff = stageInvoiceImport(auth.user?.id ?? 'demo', efacturaToScannedInvoice(document), fileName ?? t('operational.efactura.document'));
            router.push({ pathname: '/tools/invoice-import', params: { handoff } });
          }} />
        </>
      )}
    </Screen>
  );
}

function Checklist({ index, title, body }: { index: string; title: string; body: string }) {
  return <View style={styles.checkRow}><View style={styles.checkIndex}><Text style={styles.checkIndexText}>{index}</Text></View><View style={styles.copy}><Text style={styles.lineName}>{title}</Text><Text style={styles.meta}>{body}</Text></View></View>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text></View>;
}

function Notice({ text, critical = false }: { text: string; critical?: boolean }) {
  return <View style={styles.notice}><Ionicons name={critical ? 'close-circle-outline' : 'alert-circle-outline'} size={17} color={critical ? Brand.red : Brand.amber} /><Text style={styles.noticeText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  copy: { flex: 1 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: Brand.gold, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: Brand.white, fontSize: 17, fontFamily: Fonts.extraBold, marginBottom: 6 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: Brand.line, paddingTop: 9 },
  checkIndex: { width: 30, height: 30, borderRadius: 10, backgroundColor: Brand.mint, alignItems: 'center', justifyContent: 'center' },
  checkIndexText: { color: Brand.navy, fontSize: 12, fontFamily: Fonts.extraBold },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  resultTitle: { color: Brand.navyDeep, fontSize: 17, fontFamily: Fonts.extraBold },
  meta: { color: Brand.muted, fontSize: 10, lineHeight: 15, marginTop: 2, fontFamily: Fonts.regular },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  metric: { width: '48%', borderRadius: 12, backgroundColor: Brand.white, padding: 9 },
  metricLabel: { color: Brand.muted, fontSize: 8, fontFamily: Fonts.bold, textTransform: 'uppercase' },
  metricValue: { color: Brand.navyDeep, fontSize: 14, marginTop: 3, fontFamily: Fonts.extraBold, ...TabularNumbers },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  noticeText: { flex: 1, color: Brand.navySoft, fontSize: 10, lineHeight: 15, fontFamily: Fonts.medium },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: Brand.line, paddingBottom: 8 },
  lineName: { color: Brand.navyDeep, fontSize: 12, fontFamily: Fonts.extraBold },
  linePrice: { color: Brand.navyDeep, fontSize: 13, fontFamily: Fonts.extraBold, ...TabularNumbers },
});
