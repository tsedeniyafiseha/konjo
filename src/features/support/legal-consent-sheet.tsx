import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KonjoButton } from '@/components/ui/konjo-button';
import { legalDocuments, legalLabels, type LegalDocument, type LegalLanguage } from './legal-content';
import { fontFamilies, palette, radii, spacing } from '@/theme/tokens';

interface LegalConsentSheetProps {
  visible: boolean;
  language: LegalLanguage;
  onAccept(): void;
  onClose(): void;
}

const END_THRESHOLD = 24;

/**
 * Full-screen sheet with the Terms & Conditions and the Privacy & Security
 * policy. The "I understand and agree" button unlocks once the reader reaches
 * the end (or immediately when everything fits on screen).
 */
export function LegalConsentSheet({ visible, language, onAccept, onClose }: LegalConsentSheetProps) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      {visible ? <SheetBody language={language} onAccept={onAccept} onClose={onClose} /> : null}
    </Modal>
  );
}

function SheetBody({ language, onAccept, onClose }: Omit<LegalConsentSheetProps, 'visible'>) {
  const labels = legalLabels[language] ?? legalLabels.en;
  const { terms, privacy } = legalDocuments(language);
  const ethiopic = language === 'am';
  const [reachedEnd, setReachedEnd] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const fitsOnScreen = viewportHeight > 0 && contentHeight > 0 && contentHeight <= viewportHeight + END_THRESHOLD;
  const canAccept = reachedEnd || fitsOnScreen;

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - END_THRESHOLD) setReachedEnd(true);
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.header}>
        <Text style={[styles.title, ethiopic && styles.ethiopic]}>{labels.sheetTitle}</Text>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={onClose}><Text style={[styles.close, ethiopic && styles.ethiopic]}>{labels.close}</Text></Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        onContentSizeChange={(_, height) => setContentHeight(height)}
        onLayout={(event: LayoutChangeEvent) => setViewportHeight(event.nativeEvent.layout.height)}
        onScroll={onScroll}
        scrollEventThrottle={64}
        style={styles.scroll}
      >
        <Text style={[styles.updated, ethiopic && styles.ethiopic]}>{labels.lastUpdated}</Text>
        {labels.fallbackNote ? <Text style={styles.note}>{labels.fallbackNote}</Text> : null}
        <Document document={terms} ethiopic={ethiopic} />
        <View style={styles.divider} />
        <Document document={privacy} ethiopic={ethiopic} />
      </ScrollView>
      <View style={styles.footer}>
        {!canAccept ? <Text style={[styles.hint, ethiopic && styles.ethiopic]}>{labels.scrollHint}</Text> : null}
        <KonjoButton disabled={!canAccept} label={labels.accept} onPress={onAccept} variant="dark" />
      </View>
    </SafeAreaView>
  );
}

function Document({ document, ethiopic }: { document: LegalDocument; ethiopic: boolean }) {
  return (
    <View>
      <Text style={[styles.documentTitle, ethiopic && styles.ethiopicDisplay]}>{document.title}</Text>
      <Text style={[styles.paragraph, styles.intro, ethiopic && styles.ethiopic]}>{document.intro}</Text>
      {document.sections.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text style={[styles.heading, ethiopic && styles.ethiopic]}>{section.heading}</Text>
          {section.paragraphs.map((paragraph, index) => (
            <Text key={index} style={[styles.paragraph, ethiopic && styles.ethiopic]}>{paragraph}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.border },
  title: { color: palette.text, fontFamily: fontFamilies.display.medium, fontSize: 20 },
  close: { color: palette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl },
  updated: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 12, marginBottom: spacing.md },
  note: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 18, backgroundColor: palette.surfaceMuted, borderRadius: radii.md, padding: spacing.sm, marginBottom: spacing.md },
  documentTitle: { color: palette.text, fontFamily: fontFamilies.display.medium, fontSize: 24, marginBottom: spacing.xs },
  intro: { color: palette.textSecondary },
  section: { marginTop: spacing.md },
  heading: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 15, marginBottom: spacing.xxs },
  paragraph: { color: palette.text, fontFamily: fontFamilies.body.regular, fontSize: 14, lineHeight: 21, marginTop: spacing.xs },
  divider: { height: 1, backgroundColor: palette.border, marginVertical: spacing.xl },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, borderTopWidth: 1, borderTopColor: palette.border, backgroundColor: palette.canvas, gap: spacing.xs },
  hint: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 12.5, textAlign: 'center' },
  ethiopic: { fontFamily: fontFamilies.ethiopic.regular },
  ethiopicDisplay: { fontFamily: fontFamilies.ethiopic.semibold },
});
