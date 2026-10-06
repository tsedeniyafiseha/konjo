export const palette = {
  canvas: '#FAF9F5',
  surface: '#FFFFFF',
  surfaceMuted: '#F2F3EE',
  sageSoft: '#E7EEE3',
  sage: '#A7B993',
  olive: '#5B6D54',
  oliveDark: '#202B22',
  gold: '#C8A252',
  text: '#222923',
  textSecondary: '#687067',
  textMuted: '#A2A99E',
  border: '#E0E3DD',
  error: '#BA1A1A',
  white: '#FFFFFF',
  overlay: 'rgba(14, 21, 15, 0.24)',
} as const;

// Exact colors used by the supplied onboarding reference in static-export/app.html.
export const onboardingPalette = {
  canvas: '#FAF9F5',
  splash: '#91A27B',
  sage: '#9CAF88',
  olive: '#586851',
  forest: '#15201A',
  text: '#212822',
  textSecondary: '#5F665C',
  textMuted: '#9DA399',
  border: '#E6E8E2',
  white: '#FFFFFF',
} as const;

export const professionalPalette = {
  ...onboardingPalette,
  greenSoft: '#E9F0E6',
  surfaceMuted: '#F5F4EF',
  gold: '#C5A059',
  goldText: '#775A19',
  goldSoft: '#FBF3E2',
  danger: '#BA1A1A',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 40,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 28,
  pill: 999,
} as const;

export const fontFamilies = {
  display: {
    regular: 'BodoniModa_400Regular',
    medium: 'BodoniModa_500Medium',
    semibold: 'BodoniModa_600SemiBold',
  },
  body: {
    regular: 'PlusJakartaSans_400Regular',
    medium: 'PlusJakartaSans_500Medium',
    semibold: 'PlusJakartaSans_600SemiBold',
    bold: 'PlusJakartaSans_700Bold',
  },
  ethiopic: {
    regular: 'NotoSansEthiopic_400Regular',
    semibold: 'NotoSansEthiopic_600SemiBold',
  },
} as const;

export const shadows = {
  card: {
    shadowColor: '#1A221B',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
} as const;

export const layout = {
  contentMaxWidth: 520,
  horizontalPadding: 28,
  controlHeight: 52,
  minimumTouchTarget: 48,
} as const;
