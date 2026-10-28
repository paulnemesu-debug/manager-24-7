import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { ToolHeader } from '@/components/tool-header';
import { AppButton, Body, Card, ListSkeleton, Screen, SectionHeader } from '@/components/ui';
import { HACCP_FORMS, localize } from '@/constants/haccp-forms';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { useSubscription } from '@/contexts/subscription-context';
import { useHaccpDocuments } from '@/hooks/use-haccp-documents';
import { loadHaccpProfile } from '@/lib/haccp-routine-repository';
import type { HaccpDocument } from '@/types/haccp';
import type { HaccpRoutineProfile } from '@/types/haccp-routine';

export default function LegacyHaccpScreen() {
  const { user } = useAuth();
  const { locale } = useI18n();
  const { isViewer } = useSubscription();
  const userId = user?.id ?? 'demo';
  const { documents, isLoading, save } = useHaccpDocuments(userId);
  const [profile, setProfile] = useState<HaccpRoutineProfile | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    void loadHaccpProfile(userId, user?.email ?? 'Operator').then((next) => { if (active) setProfile(next); }).catch(() => undefined);
    return () => { active = false; };
  }, [userId, user?.email]));
  const legacy = useMemo(() => documents.filter((item) => !item.headerValues._location_id), [documents]);
  const ro = locale === 'ro';
  const assign = async (document: HaccpDocument) => {
    if (!profile?.defaultLocationId) return;
    setBusy(true);
    try {
      await save({ ...document,
        headerValues: { ...document.headerValues, _location_id: profile.defaultLocationId,
          _location_name: profile.defaultLocationName, location: profile.defaultLocationName, _location_confirmed_at: new Date().toISOString() },
        updatedAt: new Date().toISOString() });
    } catch { Alert.alert(ro ? 'Atribuirea nu a reușit' : 'Assignment failed', ro ? 'Încearcă din nou.' : 'Try again.'); }
    finally { setBusy(false); }
  };
  return <Screen>
    <ToolHeader title={ro ? 'Arhivă HACCP de confirmat' : 'HACCP archive to confirm'}
      subtitle={ro ? 'Documentele vechi rămân păstrate. Confirmă locația înainte de includerea lor în pachetul pentru control.' : 'Older documents are retained. Confirm their location before including them in inspection packs.'} />
    <Card><Body>{ro ? `Locația activă: ${profile?.defaultLocationName ?? '…'}` : `Active location: ${profile?.defaultLocationName ?? '…'}`}</Body>
      {!profile?.defaultLocationId && <Body>{ro ? 'Selectează o locație în setările HACCP înainte de atribuire.' : 'Select a location in HACCP settings before assigning documents.'}</Body>}</Card>
    {isLoading ? <ListSkeleton rows={3} /> : legacy.slice((Math.min(page, Math.max(1, Math.ceil(legacy.length / 6))) - 1) * 6, Math.min(page, Math.max(1, Math.ceil(legacy.length / 6))) * 6).map((document) => {
      const form = HACCP_FORMS.find((item) => item.code === document.formCode);
      return <Card key={document.id}>
        <SectionHeader title={form ? localize(form.title, locale) : document.formCode} />
        <Body>{`${document.headerValues.location || document.headerValues._location_name || '—'} · ${document.headerValues.period || `${document.headerValues.month || ''}/${document.headerValues.year || ''}`} · ${document.rows.length} ${ro ? 'înregistrări' : 'entries'}`}</Body>
        <AppButton label={ro ? 'Confirmă locația documentului' : 'Confirm document location'} variant="secondary"
          disabled={isViewer || !profile?.defaultLocationId || busy} onPress={() => {
            Alert.alert(ro ? 'Confirmi locația?' : 'Confirm location?', ro
              ? `Acest document aparține locației „${profile?.defaultLocationName}”? Confirmarea locației nu validează măsurătorile.`
              : `Does this document belong to “${profile?.defaultLocationName}”? Assigning a location does not validate measurements.`, [
              { text: ro ? 'Anulează' : 'Cancel', style: 'cancel' },
              { text: ro ? 'Confirmă' : 'Confirm', onPress: () => void assign(document) },
            ]);
          }} />
      </Card>;
    })}
    {!isLoading && !legacy.length && <Body>{ro ? 'Toate documentele au o locație confirmată.' : 'All documents have a confirmed location.'}</Body>}
    {legacy.length > 6 && <Card>
      <AppButton label={ro ? 'Înapoi' : 'Previous'} variant="ghost" disabled={page <= 1} onPress={() => setPage(Math.max(1, page - 1))} />
      <AppButton label={ro ? 'Următoarele' : 'Next'} variant="secondary" disabled={page * 6 >= legacy.length} onPress={() => setPage(page + 1)} />
    </Card>}
  </Screen>;
}
