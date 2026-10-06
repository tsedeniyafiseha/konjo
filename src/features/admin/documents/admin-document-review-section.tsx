import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAdminDocuments } from '@/features/admin/documents/admin-document-context';
import { fontFamilies, palette, radii, spacing } from '@/theme/tokens';

function fileName(storagePath: string): string {
  return storagePath.split('/').pop() ?? 'Private document';
}

export function AdminDocumentReviewSection() {
  const {
    documents: allDocuments,
    loading,
    activeDocumentId,
    error,
    refresh,
    previewDocument,
    reviewDocument,
    dismissError,
  } = useAdminDocuments();
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const documents = allDocuments.filter((document) => document.ownerRole === 'client');
  const busy = activeDocumentId !== null;

  return (
    <View>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.sectionTitle}>Client ID review</Text>
          <Text style={styles.sectionCopy}>Previews use a private URL that expires after 60 seconds. Every decision is audited.</Text>
        </View>
        <Pressable disabled={loading || busy} onPress={() => { void refresh(); }} style={styles.secondaryButton}>
          <Text style={styles.secondaryLabel}>{loading ? 'Loading…' : 'Refresh documents'}</Text>
        </Pressable>
      </View>

      {error ? (
        <Pressable accessibilityRole="alert" onPress={dismissError} style={styles.error}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorDismiss}>Dismiss</Text>
        </Pressable>
      ) : null}

      <View style={styles.list}>
        {documents.map((document) => {
          const active = activeDocumentId === document.id;
          const reason = rejectionReasons[document.id] ?? '';
          return (
            <View key={document.id} style={styles.card}>
              <View style={styles.documentHeader}>
                <View style={styles.documentCopy}>
                  <Text style={styles.documentTitle}>{document.ownerName}</Text>
                  <Text style={styles.documentMeta}>
                    {document.ownerRole} · {document.kind.replaceAll('_', ' ')} · {fileName(document.storagePath)}
                  </Text>
                  <Text style={styles.documentMeta}>
                    Uploaded {new Date(document.createdAt).toLocaleString()}
                  </Text>
                </View>
                <Pressable
                  disabled={busy}
                  onPress={() => { void previewDocument(document.id); }}
                  style={[styles.secondaryButton, busy && styles.disabled]}>
                  <Text style={styles.secondaryLabel}>{active ? 'Working…' : 'Open private preview'}</Text>
                </Pressable>
              </View>
              <TextInput
                accessibilityLabel={`Rejection reason for ${document.ownerName}`}
                editable={!busy}
                multiline
                onChangeText={(value) => setRejectionReasons((current) => ({
                  ...current,
                  [document.id]: value,
                }))}
                placeholder="Reason required when rejecting (minimum 10 characters)"
                placeholderTextColor={palette.textMuted}
                style={styles.reasonInput}
                value={reason}
              />
              <View style={styles.actions}>
                <Pressable
                  disabled={busy || reason.trim().length < 10}
                  onPress={() => { void reviewDocument(document.id, 'rejected', reason); }}
                  style={[styles.dangerButton, (busy || reason.trim().length < 10) && styles.disabled]}>
                  <Text style={styles.dangerLabel}>Reject document</Text>
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={() => { void reviewDocument(document.id, 'approved'); }}
                  style={[styles.primaryButton, busy && styles.disabled]}>
                  <Text style={styles.primaryLabel}>{active ? 'Saving…' : 'Approve document'}</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
        {!loading && !documents.length ? (
          <Text style={styles.empty}>No client ID documents are awaiting review.</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, marginTop: 30, marginBottom: spacing.sm },
  sectionTitle: { color: palette.text, fontFamily: fontFamilies.display.medium, fontSize: 21 },
  sectionCopy: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12, lineHeight: 18, marginTop: 3 },
  list: { gap: spacing.sm },
  card: { borderWidth: 1, borderColor: palette.border, borderRadius: radii.md, backgroundColor: palette.surface, padding: spacing.md },
  documentHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  documentCopy: { flex: 1, minWidth: 220 },
  documentTitle: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  documentMeta: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12, lineHeight: 18, marginTop: 2, textTransform: 'capitalize' },
  reasonInput: { minHeight: 70, borderWidth: 1, borderColor: palette.border, borderRadius: radii.sm, color: palette.text, fontFamily: fontFamilies.body.regular, fontSize: 13, marginTop: spacing.md, padding: spacing.sm, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
  secondaryButton: { minHeight: 40, borderWidth: 1, borderColor: palette.border, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  secondaryLabel: { color: palette.textSecondary, fontFamily: fontFamilies.body.semibold, fontSize: 12 },
  dangerButton: { minHeight: 40, borderWidth: 1, borderColor: palette.error, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  dangerLabel: { color: palette.error, fontFamily: fontFamilies.body.semibold, fontSize: 12 },
  primaryButton: { minHeight: 40, borderRadius: radii.sm, backgroundColor: palette.olive, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  primaryLabel: { color: palette.white, fontFamily: fontFamilies.body.semibold, fontSize: 12 },
  disabled: { opacity: 0.45 },
  error: { borderRadius: radii.sm, backgroundColor: '#FFF1EF', marginBottom: spacing.sm, padding: spacing.md },
  errorText: { color: palette.error, fontFamily: fontFamilies.body.regular, fontSize: 13 },
  errorDismiss: { color: palette.error, fontFamily: fontFamilies.body.bold, fontSize: 11, marginTop: 4 },
  empty: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 13, borderWidth: 1, borderColor: palette.border, borderRadius: radii.md, backgroundColor: palette.surface, padding: spacing.lg },
});
