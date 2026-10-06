import { Image } from 'expo-image';
import { describePayoutMethod } from '../../../shared/payout-method';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAdminDocuments } from '@/features/admin/documents/admin-document-context';
import { fontFamilies, palette, radii, spacing } from '@/theme/tokens';
import type {
  ApiAdminApplicationDocument,
  ApiAdminProfessionalApplication,
} from '../../../shared/api-contracts';

const REQUIRED_ID_KINDS = ['national_id_front', 'national_id_back', 'government_id'] as const;
const PORTFOLIO_MINIMUM = 3;

const kindLabels: Record<ApiAdminApplicationDocument['kind'], string> = {
  national_id_front: 'National ID — front',
  national_id_back: 'National ID — back',
  government_id: 'Additional government ID',
  portfolio: 'Portfolio photo',
  certificate: 'Certificate',
};

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>{value || '—'}</Text>
    </View>
  );
}

function EvidenceImage({ document }: { document: ApiAdminApplicationDocument }) {
  const { applicationImageUrl } = useAdminDocuments();
  const [uri, setUri] = useState<string | null>(null);
  const isPdf = document.storagePath.toLowerCase().endsWith('.pdf');

  useEffect(() => {
    let active = true;
    void applicationImageUrl(document.storagePath).then((url) => {
      if (active) setUri(url);
    });
    return () => { active = false; };
  }, [applicationImageUrl, document.storagePath]);

  const open = () => {
    if (!uri) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(uri, '_blank', 'noopener');
      return;
    }
    void WebBrowser.openBrowserAsync(uri);
  };

  return (
    <Pressable accessibilityLabel={`Open ${kindLabels[document.kind]}`} accessibilityRole="button" onPress={open} style={styles.evidence}>
      <View style={styles.evidenceFrame}>
        {uri && !isPdf ? (
          <Image contentFit="cover" source={{ uri }} style={StyleSheet.absoluteFill} />
        ) : (
          <Text style={styles.evidencePlaceholder}>{isPdf ? 'PDF' : 'Loading…'}</Text>
        )}
      </View>
      <Text numberOfLines={1} style={styles.evidenceLabel}>{kindLabels[document.kind]}</Text>
    </Pressable>
  );
}

export function AdminApplicationReviewCard({
  item,
  reviewing = false,
  onApprove,
  onReject,
  hideActions = false,
}: {
  item: ApiAdminProfessionalApplication;
  reviewing?: boolean;
  onApprove?(): void;
  onReject?(reason: string): void;
  hideActions?: boolean;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const { application, phoneNumber } = item;
  const profile = application.profile;
  const documents = item.documents ?? [];
  const idDocuments = documents.filter((document) => document.kind !== 'portfolio');
  const portfolio = documents.filter((document) => document.kind === 'portfolio');
  const educationCertificates = documents.filter((document) => document.kind === 'certificate' && document.credentialType !== 'course');
  const courseCertificates = documents.filter((document) => document.kind === 'certificate' && document.credentialType === 'course');
  const missingIds = REQUIRED_ID_KINDS.filter((kind) => !documents.some((document) => document.kind === kind));
  const portfolioShortfall = Math.max(0, PORTFOLIO_MINIMUM - portfolio.length);
  const ready = missingIds.length === 0 && portfolioShortfall === 0 && educationCertificates.length > 0;
  const activeDays = application.workingDays.filter((day) => day.enabled);
  const activeZones = application.travelZones.filter((zone) => zone.active);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.name}>{profile.displayName}</Text>
          <Text style={styles.meta}>Application {application.id} · Submitted {new Date(application.submittedAt).toLocaleString()}</Text>
        </View>
        <View style={[styles.badge, ready ? styles.badgeReady : styles.badgeMissing]}>
          <Text style={ready ? styles.badgeReadyText : styles.badgeMissingText}>
            {ready ? 'All documents submitted' : 'Submission incomplete'}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Identity documents</Text>
      <View style={styles.evidenceRow}>
        {idDocuments.map((document) => <EvidenceImage document={document} key={document.id} />)}
      </View>
      {missingIds.length ? (
        <Text style={styles.warning}>Missing: {missingIds.map((kind) => kindLabels[kind]).join(', ')}</Text>
      ) : null}
      <Text style={styles.sectionTitle}>Education certificate ({educationCertificates.length})</Text>
      <View style={styles.evidenceRow}>{educationCertificates.map((document) => <EvidenceImage document={document} key={document.id} />)}</View>
      {!educationCertificates.length ? <Text style={styles.warning}>Highest-education certificate is required.</Text> : null}

      <Text style={styles.sectionTitle}>Course certificates ({courseCertificates.length})</Text>
      <View style={styles.evidenceRow}>{courseCertificates.map((document) => <EvidenceImage document={document} key={document.id} />)}</View>

      <Text style={styles.sectionTitle}>Portfolio ({portfolio.length})</Text>
      <View style={styles.evidenceRow}>
        {portfolio.map((document) => <EvidenceImage document={document} key={document.id} />)}
      </View>
      {portfolioShortfall ? <Text style={styles.warning}>{portfolioShortfall} more portfolio photo(s) required.</Text> : null}

      <Text style={styles.sectionTitle}>Profile</Text>
      <View style={styles.grid}>
        <Detail label="Legal name" value={profile.legalName} />
        <Detail label="Display name" value={profile.displayName} />
        <Detail label="Verified phone" value={phoneNumber ?? ''} />
        <Detail label="Email" value={profile.email} />
        <Detail label="Specialty" value={profile.specialty} />
        <Detail label="Base zone" value={profile.baseZone} />
        <Detail label="Experience" value={`${profile.yearsExperience} years`} />
        <Detail label="Education" value={profile.educationLevel ?? ''} />
        <Detail label="Gender" value={profile.gender === 'unspecified' ? 'Prefer not to say' : profile.gender ?? ''} />
        <Detail label="Payout method" value={describePayoutMethod(profile.payoutMethod)} />
        <Detail label="Language skills" value={profile.languageSkills.map((skill) => `${skill.language} (${skill.proficiency})`).join(', ')} />
        <Detail label="App language" value={application.preferredLanguage.toUpperCase()} />
      </View>
      <Detail label="Professional introduction" value={profile.bio} />

      <Text style={styles.sectionTitle}>Services and availability</Text>
      {application.services.map((service) => (
        <Detail key={service.id} label={service.name} value={`${service.durationMinutes} min · ETB ${service.price.toLocaleString()}${service.note ? ` · ${service.note}` : ''}`} />
      ))}
      <Detail label="Working hours" value={activeDays.map((day) => `${day.day}: ${day.hours}`).join(' · ')} />
      <Detail label="Travel zones" value={activeZones.map((zone) => zone.label).join(', ')} />

      {hideActions ? null : rejecting ? (
        <View style={styles.rejectBox}>
          <TextInput
            accessibilityLabel={`Reason for rejecting ${profile.displayName}`}
            editable={!reviewing}
            maxLength={300}
            multiline
            onChangeText={setReason}
            placeholder="Reason sent to the professional by SMS (for example: ID photo is blurry)"
            placeholderTextColor={palette.textMuted}
            style={styles.reasonInput}
            value={reason}
          />
          <View style={styles.actions}>
            <Pressable disabled={reviewing} onPress={() => { setRejecting(false); setReason(''); }} style={[styles.secondaryButton, reviewing && styles.disabled]}>
              <Text style={styles.secondaryLabel}>Cancel</Text>
            </Pressable>
            <Pressable disabled={reviewing || reason.trim().length < 5} onPress={() => onReject?.(reason)} style={[styles.dangerButton, (reviewing || reason.trim().length < 5) && styles.disabled]}>
              <Text style={styles.dangerLabel}>{reviewing ? 'Sending…' : 'Reject and notify'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable disabled={reviewing} onPress={() => setRejecting(true)} style={[styles.dangerButton, reviewing && styles.disabled]}>
            <Text style={styles.dangerLabel}>Reject</Text>
          </Pressable>
          <Pressable disabled={reviewing || !ready} onPress={() => onApprove?.()} style={[styles.primaryButton, (reviewing || !ready) && styles.disabled]}>
            <Text style={styles.primaryLabel}>{reviewing ? 'Approving…' : 'Approve professional'}</Text>
          </Pressable>
        </View>
      )}
      {hideActions ? null : <Text style={styles.footnote}>Approving publishes the professional and their portfolio in the client app and sends them an SMS.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: palette.border, borderRadius: radii.md, backgroundColor: palette.surface, padding: spacing.md },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  headerCopy: { flex: 1, minWidth: 220 },
  name: { color: palette.text, fontFamily: fontFamilies.display.medium, fontSize: 20 },
  meta: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12, marginTop: 2 },
  badge: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 7 },
  badgeReady: { backgroundColor: '#EAF4EC' },
  badgeMissing: { backgroundColor: '#FFF4DE' },
  badgeReadyText: { color: palette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 11 },
  badgeMissingText: { color: '#7D5B14', fontFamily: fontFamilies.body.semibold, fontSize: 11 },
  sectionTitle: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13, marginTop: spacing.md, marginBottom: spacing.xs },
  evidenceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  evidence: { width: 132 },
  evidenceFrame: { width: 132, height: 100, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
  evidencePlaceholder: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11 },
  evidenceLabel: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 11, marginTop: 4 },
  warning: { color: palette.error, fontFamily: fontFamilies.body.regular, fontSize: 12, marginTop: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  detail: { minWidth: 180, flexGrow: 1, flexBasis: 180, marginBottom: spacing.xs },
  detailLabel: { color: palette.textMuted, fontFamily: fontFamilies.body.semibold, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  detailValue: { color: palette.text, fontFamily: fontFamilies.body.regular, fontSize: 13, lineHeight: 19, marginTop: 2 },
  rejectBox: { marginTop: spacing.md },
  reasonInput: { minHeight: 70, borderWidth: 1, borderColor: palette.border, borderRadius: radii.sm, color: palette.text, fontFamily: fontFamilies.body.regular, fontSize: 13, padding: spacing.sm, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
  primaryButton: { minHeight: 42, borderRadius: radii.sm, backgroundColor: palette.olive, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  primaryLabel: { color: palette.white, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  secondaryButton: { minHeight: 42, borderWidth: 1, borderColor: palette.border, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  secondaryLabel: { color: palette.textSecondary, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  dangerButton: { minHeight: 42, borderWidth: 1, borderColor: palette.error, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  dangerLabel: { color: palette.error, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  disabled: { opacity: 0.45 },
  footnote: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11, marginTop: spacing.sm, textAlign: 'right' },
});
