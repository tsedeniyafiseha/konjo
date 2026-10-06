import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ProfessionalDocument } from '@/application/professional-documents/professional-document-contracts';
import { KonjoIcon } from '@/components/ui/konjo-icon';
import { useProfessionalDocuments } from '@/features/professional/documents/professional-document-context';
import {
  fillPortfolioCopy,
  PORTFOLIO_LIMIT,
  professionalPortfolioCopy,
} from '@/features/professional/registration/professional-portfolio-copy';
import type { ProfessionalAppLanguage } from '@/features/professional/registration/professional-registration-types';
import { fontFamilies, professionalPalette, radii, spacing } from '@/theme/tokens';

function confirmRemoval(title: string, body: string, keep: string, remove: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${body}`)) onConfirm();
    return;
  }
  Alert.alert(title, body, [
    { text: keep, style: 'cancel' },
    { text: remove, style: 'destructive', onPress: onConfirm },
  ]);
}

function PortfolioTile({
  document,
  disabled,
  language,
  onRemove,
}: {
  document: ProfessionalDocument;
  disabled: boolean;
  language: ProfessionalAppLanguage;
  onRemove: () => void;
}) {
  const { previewUrl } = useProfessionalDocuments();
  const copy = professionalPortfolioCopy[language];
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void previewUrl(document.id).then((url) => {
      if (active) setUri(url);
    });
    return () => { active = false; };
  }, [document.id, previewUrl]);

  return (
    <View style={styles.tile}>
      {uri ? (
        <Image accessibilityLabel={copy.step} contentFit="cover" source={{ uri }} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={styles.placeholder}>
          <KonjoIcon color={professionalPalette.textMuted} name={{ ios: 'photo', android: 'image', web: 'image' }} size={26} />
        </View>
      )}
      <View style={[styles.badge, document.status === 'approved' ? styles.badgeLive : styles.badgeReview]}>
        <Text style={document.status === 'approved' ? styles.badgeLiveText : styles.badgeReviewText}>
          {document.status === 'approved' ? copy.live : copy.inReview}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={copy.remove}
        accessibilityRole="button"
        disabled={disabled}
        hitSlop={6}
        onPress={onRemove}
        style={({ pressed }) => [styles.removeButton, (disabled || pressed) && styles.dimmed]}>
        <KonjoIcon color={professionalPalette.white} name={{ ios: 'xmark', android: 'close', web: 'close' }} size={14} />
      </Pressable>
    </View>
  );
}

/** Upload, preview and remove portfolio photos for the signed-in professional. */
export function PortfolioGrid({ language }: { language: ProfessionalAppLanguage }) {
  const { documents, loading, mutationStatus, error, uploadDocument, deleteDocument, dismissError } = useProfessionalDocuments();
  const copy = professionalPortfolioCopy[language];
  const photos = documents.filter((document) => document.kind === 'portfolio' && document.status !== 'rejected');
  const busy = mutationStatus !== 'idle';
  const full = photos.length >= PORTFOLIO_LIMIT;

  const remove = (document: ProfessionalDocument) => confirmRemoval(
    copy.removeTitle,
    copy.removeBody,
    copy.keep,
    copy.remove,
    () => { void deleteDocument(document.id); },
  );

  return (
    <View style={styles.container}>
      <Text style={styles.count}>{fillPortfolioCopy(copy.count, { count: photos.length, limit: PORTFOLIO_LIMIT })}</Text>
      {loading ? <ActivityIndicator color={professionalPalette.olive} /> : null}
      <View style={styles.grid}>
        {photos.map((document) => (
          <PortfolioTile
            key={document.id}
            disabled={busy}
            document={document}
            language={language}
            onRemove={() => remove(document)}
          />
        ))}
        {!full ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy || loading}
            onPress={() => { dismissError(); void uploadDocument('portfolio'); }}
            style={({ pressed }) => [styles.tile, styles.addTile, (busy || loading) && styles.dimmed, pressed && styles.dimmed]}>
            {mutationStatus === 'uploading' || mutationStatus === 'picking'
              ? <ActivityIndicator color={professionalPalette.olive} />
              : <KonjoIcon color={professionalPalette.olive} name={{ ios: 'plus', android: 'add', web: 'add' }} size={26} />}
            <Text style={styles.addLabel}>{busy ? copy.adding : copy.add}</Text>
          </Pressable>
        ) : null}
      </View>
      {full ? <Text style={styles.hint}>{fillPortfolioCopy(copy.limitReached, { limit: PORTFOLIO_LIMIT })}</Text> : null}
      {!loading && !photos.length ? <Text style={styles.hint}>{copy.empty}</Text> : null}
      {error ? (
        <Pressable accessibilityRole="alert" onPress={dismissError} style={styles.error}>
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  count: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '31%',
    minWidth: 96,
    aspectRatio: 3 / 4,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: professionalPalette.surfaceMuted,
    borderWidth: 1,
    borderColor: professionalPalette.border,
  },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  addTile: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderStyle: 'dashed', borderColor: professionalPalette.olive, backgroundColor: professionalPalette.white, padding: spacing.xs },
  addLabel: { color: professionalPalette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 12, textAlign: 'center' },
  badge: { position: 'absolute', left: 6, bottom: 6, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3 },
  badgeLive: { backgroundColor: professionalPalette.greenSoft },
  badgeReview: { backgroundColor: professionalPalette.goldSoft },
  badgeLiveText: { color: professionalPalette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 10 },
  badgeReviewText: { color: professionalPalette.goldText, fontFamily: fontFamilies.body.semibold, fontSize: 10 },
  removeButton: { position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(21, 32, 26, 0.72)', alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.5 },
  hint: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 12, lineHeight: 18 },
  error: { borderRadius: radii.sm, backgroundColor: '#FFF1EF', padding: spacing.sm },
  errorText: { color: professionalPalette.danger, fontFamily: fontFamilies.body.regular, fontSize: 13 },
});
