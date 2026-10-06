import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { fontFamilies, layout, palette, radii } from '@/theme/tokens';

type KonjoButtonVariant = 'primary' | 'dark';

interface KonjoButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  trailingLabel?: string;
  variant?: KonjoButtonVariant;
  style?: ViewStyle;
}

export function KonjoButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  trailingLabel,
  variant = 'primary',
  style,
}: KonjoButtonProps) {
  const isDisabled = disabled || loading;
  const isEthiopic = /[\u1200-\u137F]/.test(label);
  const backgroundColor = variant === 'dark' ? palette.oliveDark : palette.sage;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: loading, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor },
        isDisabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.white} />
      ) : (
        <>
          <Text style={[styles.label, isEthiopic && styles.ethiopicLabel]}>{label}</Text>
          {trailingLabel ? (
            <Text accessibilityElementsHidden style={styles.trailingLabel}>
              {trailingLabel}
            </Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: layout.controlHeight,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
  },
  label: {
    color: palette.white,
    fontFamily: fontFamilies.body.bold,
    fontSize: 17,
  },
  ethiopicLabel: {
    fontFamily: fontFamilies.ethiopic.semibold,
  },
  trailingLabel: {
    color: palette.white,
    fontSize: 25,
    fontWeight: '300',
    lineHeight: 25,
  },
  disabled: {
    opacity: 0.58,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
});
