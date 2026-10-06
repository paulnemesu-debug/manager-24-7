import { locationErrorMessage } from '@/lib/locations-repository';
/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { FolderHub, FolderSection } from '@/components/folder-section';
import { ChoiceRow } from '@/components/inputs';
import { AppButton, Body, BrandHeader, Card, Field, IconButton, SectionHeader, StatusPill, Title } from '@/components/ui';
import { Brand, Fonts, Radius } from '@/constants/theme';
import { BETA_ACCESS, IS_PLAY_STORE_BUILD } from '@/constants/paradim';
import { COPYRIGHT_NOTICE, COPYRIGHT_NOTICE_EN, FOUNDER_NOTICE, FOUNDER_NOTICE_EN, PRODUCT_TRADE_NAME } from '@/constants/legal';
import { useAuth } from '@/contexts/auth-context';
import { useI18n } from '@/contexts/locale-context';
import { usePreferences } from '@/contexts/preferences-context';
import { useSubscription } from '@/contexts/subscription-context';
import { useWorkspace } from '@/contexts/workspace-context';
import { useBilling } from '@/hooks/use-billing';
import { SUPPORTED_CURRENCIES } from '@/lib/format';
import { exportAccountData } from '@/lib/account-export';
import {
  addLocation,
  listLocations,
  removeLocation,
  updateLocation,
  type BusinessLocation,
} from '@/lib/locations-repository';
import { inviteMember, listMembers, revokeMember, type WorkspaceMember } from '@/lib/team-repository';

export default function AccountScreen() {
  const router = useRouter();
  const auth = useAuth();
  const subscription = useSubscription();
  const billing = useBilling();
  const { recipes, catalog } = useWorkspace();
  const { t, locale } = useI18n();
  const {
    currency,
    defaultVatPercent,
    format,
    isPendingSync,
    retrySync,
    setCurrency,
    setDefaultVatPercent,
  } = usePreferences();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const signOut = async () => {
    await auth.signOut();
    router.replace('/sign-in');
  };

  const deleteAccount = () => {
    Alert.alert(
      t('account.deleteConfirmTitle'),
      t('account.deleteConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('account.deleteConfirmAction'),
          style: 'destructive',
          onPress: () => {
            setIsDeleting(true);
            void auth.deleteAccount()
              .then(() => {
                Alert.alert(t('account.deleteSuccessTitle'), t('account.deleteSuccessBody'));
                router.replace('/sign-in');
              })
              .catch((caught) => Alert.alert(
                t('account.deleteFailed'),
                caught instanceof Error ? caught.message : t('common.tryAgain'),
              ))
              .finally(() => setIsDeleting(false));
          },
        },
      ],
    );
  };

  const restore = async () => {
    try {
      if (IS_PLAY_STORE_BUILD) await billing.restore();
      await subscription.refresh();
      Alert.alert(t('account.restoreStartedTitle'), t('account.restoreStartedBody'));
    } catch (caught) {
      Alert.alert(
        t('account.restoreFailed'),
        caught instanceof Error ? caught.message : t('common.tryAgain'),
      );
    }
  };

  return (
    <FolderHub layout="grid" header={(
      <>
      <BrandHeader compact />
      <View>
        <Title>{t('account.title')}</Title>
        <Body>{t('account.subtitle')}</Body>
      </View>
      </>
    )}>
      <FolderSection id="account" icon="person-circle-outline" photo="account" accent="navy"
        title={locale === 'ro' ? 'Contul meu' : 'My account'}
        summary={auth.user?.email ?? 'demo@paradim.ro'}>
        <Card tone="navy">
          <SectionHeader title={locale === 'ro' ? 'Profil și locație' : 'Profile and location'} light />
          <Text style={styles.accountEmail}>{auth.user?.email ?? 'demo@paradim.ro'}</Text>
        </Card>

        {!subscription.isViewer && (
          <LocationsCard
            userId={auth.user?.id ?? 'demo'}
            isAdmin={subscription.isAdmin}
          />
        )}

        {!auth.isDemo && !subscription.isViewer && <TeamCard />}
        <Card>
          <SectionHeader eyebrow={t('account.financeEyebrow')} title={t('account.financeTitle')} />
          <Body>{t('account.financeBody')}</Body>
          <ChoiceRow
            label={t('account.currency')}
            options={SUPPORTED_CURRENCIES.map((value) => ({ value, label: value }))}
            value={currency}
            onChange={setCurrency}
          />
          <Field
            label={t('account.defaultVat')}
            hint={t('account.defaultVatHint')}
            keyboardType="decimal-pad"
            value={String(defaultVatPercent)}
            onChangeText={(value) => setDefaultVatPercent(
              Number(value.replace(',', '.').replace(/[^0-9.]/g, '')) || 0,
            )}
          />
          {isPendingSync && (
            <View style={styles.pendingRow}>
              <Ionicons name="cloud-offline-outline" size={17} color={Brand.amber} />
              <Text style={styles.pendingText}>{t('account.preferencesPending')}</Text>
              <AppButton label={t('common.retry')} variant="ghost" onPress={() => void retrySync()} />
            </View>
          )}
        </Card>

        {subscription.isAdmin && (
          <Card tone="gold">
            <SectionHeader eyebrow={t('account.adminEyebrow')} title={t('account.adminTitle')} />
            <Body>{t('account.adminBody')}</Body>
          </Card>
        )}

        {subscription.isViewer && (
          <Card tone="gold">
            <SectionHeader eyebrow={t('account.viewerEyebrow')} title={t('account.viewerTitle')} />
            <Body>{t('account.viewerBody')}</Body>
          </Card>
        )}

        <AppButton
          label={t('account.signOut')}
          icon="log-out-outline"
          variant="danger"
          fullWidth
          onPress={() => void signOut()}
        />
      </FolderSection>

      <FolderSection id="subscription" icon="card-outline" photo="subscription" accent="gold"
        title={locale === 'ro' ? 'Abonament' : 'Subscription'}
        summary={locale === 'ro' ? 'Plan, acces și restaurare' : 'Plan, access and restore'}>
        <Card tone="navy">
          <SectionHeader eyebrow={t('account.planEyebrow')} title={t('account.planTitle')} light />
          <StatusPill
            label={auth.isDemo ? t('account.demoMode') : BETA_ACCESS ? 'Acces beta complet'
              : subscription.isAdmin ? t('account.adminBadge') : t(`subscription.${subscription.status}`)}
            status={subscription.hasAccess ? 'healthy' : 'critical'}
          />
          <Text style={styles.accountEmail}>{auth.user?.email ?? 'demo@paradim.ro'}</Text>
          {!!subscription.periodEnd && !subscription.isAdmin && <Body light>{t('account.periodEnd', { date: format.date(subscription.periodEnd) })}</Body>}
        </Card>
        {!BETA_ACCESS && !auth.isDemo && !subscription.isAdmin && (
          <Card>
            <SectionHeader
              eyebrow={t('account.subscriptionEyebrow')}
              title={t('account.subscriptionTitle')}
            />
            <Body>{t('account.subscriptionBody')}</Body>
            <AppButton
              label={t('account.restore')}
              icon="refresh"
              variant="secondary"
              fullWidth
              onPress={() => void restore()}
            />
          </Card>
        )}

      </FolderSection>

      <FolderSection id="security" icon="shield-checkmark-outline" photo="security" accent="green"
        title={locale === 'ro' ? 'Siguranță și date' : 'Security and data'}
        summary={locale === 'ro' ? 'Protecție, export și ștergere cont' : 'Protection, export and account deletion'}>
        <Card>
          <SectionHeader eyebrow={t('account.securityEyebrow')} title={t('account.securityTitle')} />
          <Info icon="lock-closed-outline" text={t('account.security1')} />
          <Info icon="cloud-done-outline" text={t('account.security2')} />
          <Info icon="card-outline" text={t('account.security3')} />
        </Card>

        <Card>
          <SectionHeader eyebrow={locale === 'ro' ? 'DATELE TALE' : 'YOUR DATA'} title={locale === 'ro' ? 'Exportul datelor contului' : 'Account data export'} />
          <Body>{locale === 'ro' ? 'Exportă rețetele, schițele, ingredientele, HR, HACCP, P&L, inventarele și documentele contului din cloud și de pe dispozitiv. Fișierul include un raport al modulelor exportate. Fotografiile sunt incluse ca referințe.' : 'Export recipes, drafts, ingredients, HR, HACCP, P&L, inventories and account documents from cloud and device. The file includes an export coverage report. Photos are included as references.'}</Body>
          <AppButton
            label={locale === 'ro' ? 'Exportă datele' : 'Export data'}
            icon="download-outline"
            fullWidth
            loading={isExporting}
            onPress={() => {
              setIsExporting(true);
              void exportAccountData(auth.user?.id ?? 'demo', recipes, catalog)
                .then((result) => {
                  if (!result.cloudComplete) Alert.alert(locale === 'ro' ? 'Export cu observații' : 'Export with notes', locale === 'ro' ? 'Exportul a fost creat. Unele module nu au putut fi citite sau verificate; detaliile sunt în raportul din fișier.' : 'Export created. Some modules could not be read or verified; see the report in the file.');
                })
                .catch((error) => Alert.alert(t('operational.account.exportError'), locationErrorMessage(error, locale)))
                .finally(() => setIsExporting(false));
            }}
          />
        </Card>

        {!auth.isDemo && (
          <Card>
            <SectionHeader eyebrow={t('account.deleteEyebrow')} title={t('account.deleteTitle')} />
            <Body>{t('account.deleteBody')}</Body>
            <AppButton
              label={isDeleting ? t('account.deleteInProgress') : t('account.deleteButton')}
              icon="trash-outline"
              variant="danger"
              fullWidth
              loading={isDeleting}
              onPress={deleteAccount}
            />
          </Card>
        )}
      </FolderSection>

      <FolderSection id="about" icon="information-circle-outline" photo="about" accent="gold"
        title={locale === 'ro' ? t('operational.account.about') : 'About the app'}
        summary="MANAGER 24/7™ by PARADIM">
        <Card>
          <SectionHeader eyebrow={t('operational.account.legal')} title={t('operational.account.about')} />
          <Text style={styles.aboutProduct}>{PRODUCT_TRADE_NAME}</Text>
          <Body>{locale === 'ro' ? FOUNDER_NOTICE : FOUNDER_NOTICE_EN}</Body>
          <Body>{t('operational.account.owner')}</Body>
          <Body>{locale === 'ro' ? COPYRIGHT_NOTICE : COPYRIGHT_NOTICE_EN}</Body>
          <Text style={styles.proprietaryNotice}>{t('operational.account.proprietary')}</Text>
        </Card>
      </FolderSection>
    </FolderHub>
  );
}

function LocationsCard({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const { t, locale } = useI18n();
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => void listLocations(userId).then(setLocations).catch(() => undefined);
  useEffect(load, [userId]);

  const resetForm = () => {
    setName('');
    setAddress('');
    setEditingId(null);
  };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (editingId) {
        await updateLocation(userId, editingId, name, address);
      } else {
        await addLocation(userId, name, address, { canManageMultiple: isAdmin });
      }
      resetForm();
      load();
    } catch (error) {
      Alert.alert(t('operational.locations.saveError'), locationErrorMessage(error, locale));
    } finally { setBusy(false); }
  };

  const edit = (location: BusinessLocation) => {
    setEditingId(location.id);
    setName(location.name);
    setAddress(location.address);
  };

  const remove = (location: BusinessLocation) => {
    Alert.alert(
      t('operational.locations.remove'),
      t('operational.locations.deleteBody', { name: location.name }),
      [
        { text: t('operational.common.cancel'), style: 'cancel' },
        {
          text: t('operational.locations.delete'),
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            void removeLocation(userId, location.id, { canManageMultiple: isAdmin })
              .then(() => {
                if (editingId === location.id) resetForm();
                load();
              })
              .catch((error) => Alert.alert(
                t('operational.locations.deleteError'),
                locationErrorMessage(error, locale),
              ))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  };

  const showForm = isAdmin || locations.length === 0 || editingId !== null;

  return (
    <Card tone={isAdmin ? 'gold' : 'soft'}>
      <SectionHeader
        eyebrow={isAdmin ? t('operational.locations.multi') : t('operational.locations.account')}
        title={isAdmin ? t('operational.locations.company') : t('operational.locations.your')}
      />
      <Body>{isAdmin
        ? t('operational.locations.multiNote')
        : t('operational.locations.accountNote')}</Body>

      {showForm && (
        <View style={styles.locationForm}>
          <Field label={t('operational.locations.name')} value={name} onChangeText={setName} />
          <Field label={t('operational.locations.address2')} value={address} onChangeText={setAddress} />
          <View style={styles.locationFormActions}>
            <AppButton
              label={editingId ? t('operational.locations.save') : t('operational.locations.add')}
              icon={editingId ? 'save-outline' : 'business-outline'}
              loading={busy}
              disabled={!name.trim()}
              onPress={() => void save()}
            />
            {!!editingId && <AppButton label={t('operational.common.cancel')} variant="ghost" onPress={resetForm} />}
          </View>
        </View>
      )}

      {locations.map((location) => (
        <View key={location.id} style={styles.teamRow}>
          <View style={styles.teamRowCopy}>
            <Text style={styles.teamEmail}>{location.name}</Text>
            <Text style={styles.teamRole}>{location.address || t('operational.locations.noAddress')}</Text>
          </View>
          <StatusPill label={t('operational.locations.active')} status="healthy" />
          <View style={styles.locationActions}>
            <IconButton icon="create-outline" label={t('operational.locations.edit')} onPress={() => edit(location)} />
            {isAdmin && (
              <IconButton
                icon="trash-outline"
                label={t('operational.locations.delete')}
                danger
                onPress={() => remove(location)}
              />
            )}
          </View>
        </View>
      ))}
    </Card>
  );
}

function TeamCard() {
  const { t, locale } = useI18n();
  const [email, setEmail] = useState('');
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviting, setIsInviting] = useState(false);
  const [teamRole, setTeamRole] = useState<'manager' | 'head_chef' | 'viewer'>('viewer');

  const load = () => {
    setIsLoading(true);
    void listMembers().then(setMembers).catch(() => undefined).finally(() => setIsLoading(false));
  };

  useEffect(load, []);

  const sendInvite = async (targetEmail: string, role: WorkspaceMember['role'], clearField = false) => {
    const clean = targetEmail.trim();
    if (!clean) return;
    setIsInviting(true);
    try {
      const result = await inviteMember(clean, role, locale);
      if (clearField) setEmail('');
      load();
      Alert.alert(
        t('account.teamInviteSentTitle'),
        result.delivery === 'resend'
          ? t('account.teamInviteSentBody')
          : t('account.teamInviteCodeBody'),
      );
    } catch (caught) {
      Alert.alert(
        t('account.teamInviteFailed'),
        caught instanceof Error ? caught.message : t('common.tryAgain'),
      );
    } finally {
      setIsInviting(false);
    }
  };

  const invite = () => sendInvite(email, teamRole, true);

  const revoke = (memberId: string) => {
    void revokeMember(memberId)
      .then(load)
      .catch((caught) => Alert.alert(
        t('account.teamRevokeFailed'),
        caught instanceof Error ? caught.message : t('common.tryAgain'),
      ));
  };

  return (
    <Card>
      <SectionHeader eyebrow={t('account.teamEyebrow')} title={t('account.teamTitle')} />
      <Body>{t('account.teamBody')}</Body>

      <ChoiceRow
        label={t('operational.account.colleagueRole')}
        options={[
          { value: 'manager', label: 'Manager' },
          { value: 'head_chef', label: t('operational.account.chef') },
          { value: 'viewer', label: t('operational.account.viewer') },
        ]}
        value={teamRole}
        onChange={setTeamRole}
      />

      <View style={styles.teamInviteRow}>
        <TextInput
          style={styles.teamInput}
          placeholder={t('account.teamEmailPlaceholder')}
          placeholderTextColor="#98A3AD"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          inputMode="email"
          value={email}
          onChangeText={setEmail}
          onSubmitEditing={() => void invite()}
          returnKeyType="send"
        />
        <AppButton
          label={t('account.teamInvite')}
          icon="person-add-outline"
          loading={isInviting}
          disabled={!email.trim()}
          onPress={() => void invite()}
        />
      </View>

      {!isLoading && !members.length && <Body>{t('account.teamEmpty')}</Body>}

      {members.map((member) => {
        const deliveryFailed = member.inviteDelivery === 'failed';
        const statusLabel = member.status === 'active'
          ? t('account.teamStatusActive')
          : deliveryFailed
            ? t('account.teamDeliveryFailed')
            : member.inviteSentAt
              ? t('account.teamDeliverySent')
              : t('account.teamStatusPending');
        return <View key={member.id} style={styles.teamRow}>
          <View style={styles.teamRowCopy}>
            <Text style={styles.teamEmail} numberOfLines={1}>{member.invitedEmail}</Text>
            <Text style={styles.teamRole}>{member.role === 'head_chef' ? t('operational.account.chef') : member.role === 'manager' ? 'Manager' : t('operational.account.viewer')}</Text>
            <StatusPill
              label={statusLabel}
              status={member.status === 'active' ? 'healthy' : deliveryFailed ? 'critical' : 'watch'}
            />
          </View>
          <View style={styles.teamActions}>
            {member.status !== 'active' && (
              <AppButton
                label={t('account.teamResend')}
                variant="secondary"
                loading={isInviting}
                onPress={() => void sendInvite(member.invitedEmail, member.role)}
              />
            )}
            <AppButton
              label={t('account.teamRevoke')}
              variant="ghost"
              onPress={() => revoke(member.id)}
            />
          </View>
        </View>;
      })}
    </Card>
  );
}

function Info({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.info}>
      <View style={styles.infoIcon}><Ionicons name={icon} size={18} color={Brand.gold} /></View>
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  accountEmail: { color: Brand.white, fontSize: 16, fontFamily: Fonts.bold, marginTop: 6 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  infoIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: Brand.navy, alignItems: 'center', justifyContent: 'center' },
  infoText: { flex: 1, color: Brand.ink, fontSize: 13, lineHeight: 19 },
  footer: { color: Brand.muted, textAlign: 'center', fontSize: 10 },
  legalFooter: { alignItems: 'center', gap: 3, paddingVertical: 8 },
  legalProduct: { color: Brand.navyDeep, textAlign: 'center', fontSize: 11, fontFamily: Fonts.bold },
  aboutProduct: { color: Brand.navyDeep, fontSize: 17, fontFamily: Fonts.extraBold },
  proprietaryNotice: { color: Brand.muted, fontSize: 11, lineHeight: 16, fontFamily: Fonts.medium },
  teamInviteRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  teamInput: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: Brand.line,
    backgroundColor: Brand.white,
    borderRadius: Radius.medium,
    paddingHorizontal: 14,
    color: Brand.ink,
    fontSize: 14,
  },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pendingText: { flex: 1, color: Brand.amber, fontSize: 12, lineHeight: 17 },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Brand.line,
    paddingTop: 12,
  },
  teamRowCopy: { flex: 1, gap: 6 },
  teamActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 },
  teamEmail: { color: Brand.navyDeep, fontSize: 14, fontFamily: Fonts.extraBold },
  teamRole: { color: Brand.muted, fontSize: 10, fontFamily: Fonts.medium },
  locationForm: { gap: 10 },
  locationFormActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  locationActions: { flexDirection: 'row', gap: 4 },
});
