import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import { useClientCopy } from '@/localization/use-client-copy';
import { fontFamilies, palette, radii, spacing } from '@/theme/tokens';

export function ClientBackHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useClientCopy();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel={t('goBack')}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
        <KonjoIcon
          color={palette.text}
          name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
          size={19}
        />
      </Pressable>
      <Text accessibilityRole="header" style={styles.headerTitle}>{title}</Text>
    </View>
  );
}

export function SettingsRow({
  icon,
  label,
  onPress,
  trailing,
  last = false,
}: {
  icon: ComponentProps<typeof KonjoIcon>['name'];
  label: string;
  onPress?: () => void;
  trailing?: ReactNode;
  last?: boolean;
}) {
  const content = (
    <>
      <KonjoIcon color={palette.olive} name={icon} size={19} />
      <Text style={styles.rowLabel}>{label}</Text>
      {trailing ?? (onPress ? (
        <KonjoIcon
          color={palette.textMuted}
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={17}
        />
      ) : null)}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && styles.pressed]}>
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.row, !last && styles.rowBorder]}>{content}</View>;
}

export function KonjoSwitch({ value, onChange, label }: { value: boolean; onChange: () => void; label: string }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      hitSlop={8}
      onPress={onChange}
      style={[styles.switchTrack, value && styles.switchTrackActive]}>
      <View style={[styles.switchThumb, value && styles.switchThumbActive]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 17 },
  row: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.surfaceMuted },
  rowLabel: { flex: 1, color: palette.text, fontFamily: fontFamilies.body.medium, fontSize: 14 },
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: radii.pill,
    backgroundColor: palette.border,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  switchTrackActive: { backgroundColor: palette.sage },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: palette.white },
  switchThumbActive: { alignSelf: 'flex-end' },
  pressed: { opacity: 0.7 },
});
