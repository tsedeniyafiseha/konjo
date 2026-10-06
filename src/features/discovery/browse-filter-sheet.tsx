import { type ReactNode, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import { useClientCopy } from '@/localization/use-client-copy';
import { fontFamilies, palette, radii, spacing } from '@/theme/tokens';
import { type BrowseFilters, countActiveFilters, emptyBrowseFilters, genderOptions, languageOptions, ratingOptions, sortOptions } from './browse-filters';

interface BrowseFilterSheetProps {
  visible: boolean;
  filters: BrowseFilters;
  categories: readonly { id: string; label: string }[];
  zones: readonly string[];
  /** How many specialists a draft would show; drives the apply button. */
  countFor: (filters: BrowseFilters) => number;
  onApply: (filters: BrowseFilters) => void;
  onClose: () => void;
}

/**
 * Bottom-sheet filter panel in the style of booking marketplaces: sections of
 * chips, a live "Show N professionals" button, and Clear all. Edits are kept
 * in a draft until Apply so the list does not jump while choosing.
 */
export function BrowseFilterSheet({ visible, filters, categories, zones, countFor, onApply, onClose }: BrowseFilterSheetProps) {
  const { categoryLabel, t } = useClientCopy();
  const [draft, setDraft] = useState<BrowseFilters>(filters);
  // Start every opening from the applied filters (state adjusted on prop change, not in an effect).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDraft(filters);
  }
  const count = countFor(draft);
  const applyLabel = count === 0 ? t('showResultsNone') : count === 1 ? t('showResultsOne') : t('showResults').replace('{count}', String(count));
  const toggleLanguage = (language: string) => setDraft((current) => ({
    ...current,
    languages: current.languages.includes(language) ? current.languages.filter((item) => item !== language) : [...current.languages, language],
  }));

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdropWrap}>
        <Pressable accessibilityLabel={t('close')} accessibilityRole="button" onPress={onClose} style={styles.backdrop} />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <Text accessibilityRole="header" style={styles.sheetTitle}>{t('filters')}</Text>
            {countActiveFilters(draft) ? <Text style={styles.activeCount}>{t('filtersActive').replace('{count}', String(countActiveFilters(draft)))}</Text> : null}
            <Pressable accessibilityLabel={t('close')} accessibilityRole="button" hitSlop={8} onPress={onClose} style={styles.closeButton}>
              <KonjoIcon color={palette.text} name={{ ios: 'xmark', android: 'close', web: 'close' }} size={18} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sections} showsVerticalScrollIndicator={false}>
            <Section title={t('sortBy')}>
              <Chip label={t('recommended')} onPress={() => setDraft({ ...draft, sortBy: null })} selected={draft.sortBy === null} />
              {sortOptions.map((option) => (
                <Chip key={option} label={option === 'rating' ? t('topRated') : option === 'distance' ? t('nearest') : t('price')} onPress={() => setDraft({ ...draft, sortBy: option })} selected={draft.sortBy === option} />
              ))}
            </Section>
            <Section title={t('rating')}>
              <Chip label={t('anyRating')} onPress={() => setDraft({ ...draft, minRating: null })} selected={draft.minRating === null} />
              {ratingOptions.map((option) => (
                <Chip key={option} label={`★ ${t('ratingAtLeast').replace('{rating}', String(option))}`} onPress={() => setDraft({ ...draft, minRating: option })} selected={draft.minRating === option} />
              ))}
            </Section>
            <Section title={t('gender')}>
              <Chip label={t('anyGender')} onPress={() => setDraft({ ...draft, gender: null })} selected={draft.gender === null} />
              {genderOptions.map((option) => (
                <Chip key={option} label={option === 'female' ? t('genderFemale') : t('genderMale')} onPress={() => setDraft({ ...draft, gender: option })} selected={draft.gender === option} />
              ))}
            </Section>
            <Section title={t('spokenLanguage')}>
              <Chip label={t('anyLanguage')} onPress={() => setDraft({ ...draft, languages: [] })} selected={draft.languages.length === 0} />
              {languageOptions.map((option) => (
                <Chip key={option} label={option} onPress={() => toggleLanguage(option)} selected={draft.languages.includes(option)} />
              ))}
            </Section>
            <Section title={t('profession')}>
              <Chip label={t('anyProfession')} onPress={() => setDraft({ ...draft, category: null })} selected={draft.category === null} />
              {categories.map((category) => (
                <Chip key={category.id} label={categoryLabel(category.id, category.label)} onPress={() => setDraft({ ...draft, category: category.id })} selected={draft.category === category.id} />
              ))}
            </Section>
            {zones.length ? (
              <Section title={t('serviceZone')}>
                <Chip label={t('anyGender')} onPress={() => setDraft({ ...draft, zone: null })} selected={draft.zone === null} />
                {zones.map((zone) => (
                  <Chip key={zone} label={zone} onPress={() => setDraft({ ...draft, zone })} selected={draft.zone === zone} />
                ))}
              </Section>
            ) : null}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable accessibilityRole="button" disabled={!countActiveFilters(draft)} onPress={() => setDraft(emptyBrowseFilters)} style={[styles.clearButton, !countActiveFilters(draft) && styles.clearButtonDisabled]}>
              <Text style={styles.clearLabel}>{t('clearAll')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => onApply(draft)} style={styles.applyButton}>
              <Text style={styles.applyLabel}>{applyLabel}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.chipRow}>{children}</View>
    </View>
  );
}

export function Chip({ label, selected, onPress, onRemove }: { label: string; selected: boolean; onPress: () => void; onRemove?: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onRemove ?? onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
      {onRemove ? <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}> ×</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdropWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(31, 42, 30, 0.35)' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheet: { maxHeight: '88%', backgroundColor: palette.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: spacing.xs },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: palette.border, marginBottom: spacing.sm },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  sheetTitle: { flex: 1, color: palette.text, fontFamily: fontFamilies.body.bold, fontSize: 18 },
  activeCount: { color: palette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 12 },
  closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  sections: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.lg },
  section: { gap: spacing.sm },
  sectionTitle: { color: palette.textMuted, fontFamily: fontFamilies.body.bold, fontSize: 10, letterSpacing: 0.7 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { flexDirection: 'row', minHeight: 36, borderRadius: radii.pill, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  chipSelected: { backgroundColor: palette.text, borderColor: palette.text },
  chipLabel: { color: palette.textSecondary, fontFamily: fontFamilies.body.semibold, fontSize: 12.5 },
  chipLabelSelected: { color: palette.white },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, borderTopWidth: 1, borderTopColor: palette.border },
  clearButton: { minHeight: 50, paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
  clearButtonDisabled: { opacity: 0.45 },
  clearLabel: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  applyButton: { flex: 1, minHeight: 50, borderRadius: radii.md, backgroundColor: palette.olive, alignItems: 'center', justifyContent: 'center' },
  applyLabel: { color: palette.white, fontFamily: fontFamilies.body.bold, fontSize: 15 },
});
