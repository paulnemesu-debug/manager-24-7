import { useI18n } from '@/contexts/locale-context';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ToolHeader } from '@/components/tool-header';
import { Select } from '@/components/inputs';
import { AppButton, Card, Field, Screen, SectionHeader, StatusPill } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useOperationalResource } from '@/hooks/use-operational-resource';
import { getDocumentCategories, documentExpiryStatus, loadOperationalDocuments, saveOperationalDocument, resolveOperationalDocument } from '@/lib/operational-documents';
import { operationalSyncLabel, operationalErrorMessage } from '@/lib/operational-sync';
import type { OperationalDocument } from '@/types/operational-document';
import { Brand, Fonts } from '@/constants/theme';
const emptyDraft = (): OperationalDocument => ({ id: '', title: '', owner: '', category: 'other', issueDate: '', expiryDate: '', notes: '', updatedAt: '', archived: false });
export default function ComplianceDocuments() {
  const auth = useAuth();
  const { locale, t } = useI18n();
  const userId = auth.user?.id ?? 'demo';
  const { data: docs, error, loading, refresh } = useOperationalResource(useCallback(() => loadOperationalDocuments(userId), [userId]));
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const save = async (item: OperationalDocument, reset = true) => {
    setBusy(true);
    try { await saveOperationalDocument(userId, { ...item, id: item.id || undefined }, locale); if (reset) setDraft(emptyDraft()); refresh(); }
    catch (reason) { Alert.alert(t('operational.documents.saveError'), operationalErrorMessage(reason, locale)); }
    finally { setBusy(false); }
  };
  const visible = (docs ?? []).filter((doc) => showArchived || !doc.archived);
  const active = (docs ?? []).filter((doc) => !doc.archived);
  const expired = active.filter((doc) => (documentExpiryStatus(doc.expiryDate, new Date(), locale).days ?? 1) < 0).length;
  const soon = active.filter((doc) => { const days = documentExpiryStatus(doc.expiryDate, new Date(), locale).days; return days !== null && days >= 0 && days <= 30; }).length;
  return <Screen><ToolHeader title={t('operational.documents.title')} subtitle={t('operational.documents.subtitle')} />
    <Card><SectionHeader eyebrow={t('operational.documents.status')} title={loading ? t('operational.common.loading') : t('operational.documents.activeCount', { count: active.length })} /><Text style={styles.summary}>{t('operational.documents.summary', { expired, soon })}</Text></Card>
    {!!error && <Card><Text>{error}</Text><AppButton label={t('operational.common.retry')} onPress={refresh} /></Card>}
    <Card><SectionHeader eyebrow={draft.id ? t('operational.documents.update') : t('operational.documents.new')} title={draft.id ? t('operational.documents.edit') : t('operational.documents.add')} />
      <Field label={t('operational.documents.document')} value={draft.title} onChangeText={(title) => setDraft((current) => ({ ...current, title }))} />
      <Select label={t('operational.common.category')} value={draft.category} options={getDocumentCategories(locale)} placeholder={t('operational.documents.chooseCategory')} onChange={(category) => { if (category) setDraft((current) => ({ ...current, category })); }} />
      <Field label={t('operational.documents.owner')} value={draft.owner} onChangeText={(owner) => setDraft((current) => ({ ...current, owner }))} />
      <Field label={t('operational.documents.issued')} value={draft.issueDate} onChangeText={(issueDate) => setDraft((current) => ({ ...current, issueDate }))} />
      <Field label={t('operational.documents.expires')} value={draft.expiryDate} onChangeText={(expiryDate) => setDraft((current) => ({ ...current, expiryDate }))} />
      <Field label={t('operational.common.notes')} value={draft.notes} multiline onChangeText={(notes) => setDraft((current) => ({ ...current, notes }))} />
      <AppButton label={t('operational.documents.save')} icon="save-outline" loading={busy} onPress={() => void save(draft)} />
      {!!draft.id && <AppButton label={t('operational.common.cancelEdit')} variant="ghost" disabled={busy} onPress={() => setDraft(emptyDraft())} />}
    </Card>
    <AppButton label={showArchived ? t('operational.documents.hideArchive') : t('operational.documents.showArchive')} variant="secondary" onPress={() => setShowArchived((value) => !value)} />
    {visible.map((doc) => { const status = documentExpiryStatus(doc.expiryDate, new Date(), locale); return <Card key={doc.id}>
      <View style={styles.row}><View style={styles.flex}><Text style={styles.title}>{doc.title}</Text><Text style={styles.meta}>{doc.owner || t('operational.documents.noOwner')}{doc.expiryDate ? ` · ${doc.expiryDate}` : ''}</Text></View><StatusPill label={doc.archived ? t('operational.documents.archived') : status.label} status={doc.archived ? 'neutral' : status.tone === 'danger' ? 'critical' : status.tone} /></View>
      {!!doc.notes && <Text style={styles.notes}>{doc.notes}</Text>}<Text style={styles.meta}>{operationalSyncLabel(doc, locale)}</Text>
      {doc.syncState === 'conflict' ? <View style={styles.stack}>
        <Text style={styles.meta}>{t('operational.documents.remoteSummary', { title: String(doc.remoteConflict?.data.title ?? ''), date: String(doc.remoteConflict?.data.expiryDate || t('operational.documents.noExpiry')) })}</Text>
        <AppButton label={t('operational.common.remote')} onPress={() => void resolveOperationalDocument(userId, doc.id, 'remote').then(refresh).catch((reason) => Alert.alert(t('operational.common.error'), operationalErrorMessage(reason, locale)))} />
        <AppButton label={t('operational.common.local')} variant="secondary" onPress={() => void resolveOperationalDocument(userId, doc.id, 'local').then(refresh).catch((reason) => Alert.alert(t('operational.common.error'), operationalErrorMessage(reason, locale)))} />
      </View> : <View style={styles.row}>
        <AppButton label={t('operational.documents.renew')} variant="secondary" disabled={busy} onPress={() => setDraft(doc)} />
        <AppButton label={doc.archived ? t('operational.documents.reactivate') : t('operational.documents.archive')} variant="ghost" disabled={busy} onPress={() => void save({ ...doc, archived: !doc.archived }, false)} />
      </View>}
    </Card>; })}
  </Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }, flex: { flex: 1 }, title: { fontFamily: Fonts.bold, color: Brand.navyDeep, fontSize: 15 }, meta: { fontFamily: Fonts.regular, color: Brand.muted, fontSize: 12, marginTop: 5 }, notes: { fontFamily: Fonts.regular, color: Brand.ink, fontSize: 12, marginTop: 8 }, summary: { fontFamily: Fonts.bold, color: Brand.navyDeep }, stack: { gap: 8, marginTop: 8 } });
