import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ToolHeader } from '@/components/tool-header';
import { Select } from '@/components/inputs';
import { AppButton, Card, Field, Screen, SectionHeader, StatusPill } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useOperationalResource } from '@/hooks/use-operational-resource';
import { DOCUMENT_CATEGORIES, documentExpiryStatus, loadOperationalDocuments, saveOperationalDocument, resolveOperationalDocument } from '@/lib/operational-documents';
import { operationalSyncLabel } from '@/lib/operational-sync';
import type { OperationalDocument } from '@/types/operational-document';
import { Brand, Fonts } from '@/constants/theme';
const emptyDraft = (): OperationalDocument => ({ id: '', title: '', owner: '', category: 'other', issueDate: '', expiryDate: '', notes: '', updatedAt: '', archived: false });
export default function ComplianceDocuments() {
  const auth = useAuth();
  const userId = auth.user?.id ?? 'demo';
  const { data: docs, error, loading, refresh } = useOperationalResource(useCallback(() => loadOperationalDocuments(userId), [userId]));
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const save = async (item: OperationalDocument, reset = true) => {
    setBusy(true);
    try { await saveOperationalDocument(userId, { ...item, id: item.id || undefined }); if (reset) setDraft(emptyDraft()); refresh(); }
    catch (reason) { Alert.alert('Documentul nu s-a salvat', reason instanceof Error ? reason.message : 'Încearcă din nou.'); }
    finally { setBusy(false); }
  };
  const visible = (docs ?? []).filter((doc) => showArchived || !doc.archived);
  const active = (docs ?? []).filter((doc) => !doc.archived);
  const expired = active.filter((doc) => (documentExpiryStatus(doc.expiryDate).days ?? 1) < 0).length;
  const soon = active.filter((doc) => { const days = documentExpiryStatus(doc.expiryDate).days; return days !== null && days >= 0 && days <= 30; }).length;
  return <Screen><ToolHeader title="Documente & expirări" subtitle="Urmărește autorizațiile, medicina muncii, instruirile și documentele operaționale." />
    <Card><SectionHeader eyebrow="STARE DOSAR" title={loading ? 'Se încarcă…' : `${active.length} documente active`} /><Text style={styles.summary}>{expired} expirate · {soon} expiră în 30 zile</Text></Card>
    {!!error && <Card><Text>{error}</Text><AppButton label="Reîncearcă" onPress={refresh} /></Card>}
    <Card><SectionHeader eyebrow={draft.id ? 'ACTUALIZARE' : 'DOCUMENT NOU'} title={draft.id ? 'Editează documentul' : 'Adaugă termen de urmărit'} />
      <Field label="Document" value={draft.title} onChangeText={(title) => setDraft((current) => ({ ...current, title }))} />
      <Select label="Categorie" value={draft.category} options={DOCUMENT_CATEGORIES} placeholder="Alege categoria" onChange={(category) => { if (category) setDraft((current) => ({ ...current, category })); }} />
      <Field label="Responsabil / titular" value={draft.owner} onChangeText={(owner) => setDraft((current) => ({ ...current, owner }))} />
      <Field label="Emis la (AAAA-LL-ZZ, opțional)" value={draft.issueDate} onChangeText={(issueDate) => setDraft((current) => ({ ...current, issueDate }))} />
      <Field label="Expiră la (AAAA-LL-ZZ, opțional)" value={draft.expiryDate} onChangeText={(expiryDate) => setDraft((current) => ({ ...current, expiryDate }))} />
      <Field label="Observații" value={draft.notes} multiline onChangeText={(notes) => setDraft((current) => ({ ...current, notes }))} />
      <AppButton label="Salvează documentul" icon="save-outline" loading={busy} onPress={() => void save(draft)} />
      {!!draft.id && <AppButton label="Renunță la editare" variant="ghost" disabled={busy} onPress={() => setDraft(emptyDraft())} />}
    </Card>
    <AppButton label={showArchived ? 'Ascunde arhiva' : 'Arată și documentele arhivate'} variant="secondary" onPress={() => setShowArchived((value) => !value)} />
    {visible.map((doc) => { const status = documentExpiryStatus(doc.expiryDate); return <Card key={doc.id}>
      <View style={styles.row}><View style={styles.flex}><Text style={styles.title}>{doc.title}</Text><Text style={styles.meta}>{doc.owner || 'Fără responsabil'}{doc.expiryDate ? ` · ${doc.expiryDate}` : ''}</Text></View><StatusPill label={doc.archived ? 'Arhivat' : status.label} status={doc.archived ? 'neutral' : status.tone === 'danger' ? 'critical' : status.tone} /></View>
      {!!doc.notes && <Text style={styles.notes}>{doc.notes}</Text>}<Text style={styles.meta}>{operationalSyncLabel(doc)}</Text>
      {doc.syncState === 'conflict' ? <View style={styles.stack}>
        <Text style={styles.meta}>În cont: {String(doc.remoteConflict?.data.title ?? '')} · expiră {String(doc.remoteConflict?.data.expiryDate ?? 'fără termen')}</Text>
        <AppButton label="Folosește versiunea din cont" onPress={() => void resolveOperationalDocument(userId, doc.id, 'remote').then(refresh).catch((reason) => Alert.alert('Eroare', String(reason)))} />
        <AppButton label="Păstrează versiunea locală" variant="secondary" onPress={() => void resolveOperationalDocument(userId, doc.id, 'local').then(refresh).catch((reason) => Alert.alert('Eroare', String(reason)))} />
      </View> : <View style={styles.row}>
        <AppButton label="Editează / reînnoiește" variant="secondary" disabled={busy} onPress={() => setDraft(doc)} />
        <AppButton label={doc.archived ? 'Reactivează' : 'Arhivează'} variant="ghost" disabled={busy} onPress={() => void save({ ...doc, archived: !doc.archived }, false)} />
      </View>}
    </Card>; })}
  </Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }, flex: { flex: 1 }, title: { fontFamily: Fonts.bold, color: Brand.navyDeep, fontSize: 15 }, meta: { fontFamily: Fonts.regular, color: Brand.muted, fontSize: 12, marginTop: 5 }, notes: { fontFamily: Fonts.regular, color: Brand.ink, fontSize: 12, marginTop: 8 }, summary: { fontFamily: Fonts.bold, color: Brand.navyDeep }, stack: { gap: 8, marginTop: 8 } });
