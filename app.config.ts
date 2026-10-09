import type { ConfigContext, ExpoConfig } from 'expo/config';

/** Deployment identifiers are supplied by the owning Expo/Apple/Google accounts. */
export default ({ config }: ConfigContext): ExpoConfig => {
  const projectId = process.env.KONJO_EAS_PROJECT_ID;
  const androidPackage = process.env.KONJO_ANDROID_PACKAGE;
  const bundleIdentifier = process.env.KONJO_IOS_BUNDLE_IDENTIFIER;
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  // CARTO Basemaps key for the in-app MapLibre map. Published to the app as the
  // full style URL only; never logged. Restrict the key to the app in CARTO.
  const cartoBasemapsApiKey = process.env.CARTO_BASEMAPS_API_KEY?.trim() || null;
  const mapStyleUrl = cartoBasemapsApiKey
    ? `https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json?key=${encodeURIComponent(cartoBasemapsApiKey)}`
    : null;
  if (process.env.EAS_BUILD_PROFILE === 'production') {
    if (!projectId) throw new Error('Set KONJO_EAS_PROJECT_ID before a production native build.');
    if (!apiBaseUrl?.startsWith('https://')) {
      throw new Error('Production native builds require an HTTPS EXPO_PUBLIC_API_BASE_URL.');
    }
    if (process.env.EXPO_PUBLIC_ENABLE_PROFESSIONAL_MOCK_OTP === 'true') {
      throw new Error('Production native builds cannot enable the professional mock OTP.');
    }
    if (process.env.EAS_BUILD_PLATFORM === 'android' && (!androidPackage || !googleServicesFile)) {
      throw new Error('Android production builds require KONJO_ANDROID_PACKAGE and GOOGLE_SERVICES_JSON.');
    }
    if (process.env.EAS_BUILD_PLATFORM === 'ios' && !bundleIdentifier) {
      throw new Error('iOS production builds require KONJO_IOS_BUNDLE_IDENTIFIER.');
    }
  }
  const plugins = [...(config.plugins ?? [])];
  return {
    ...config,
    name: config.name ?? 'Konjo', slug: config.slug ?? 'konjo-client',
    plugins: plugins as ExpoConfig['plugins'],
    extra: {
      ...config.extra,
      ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}),
      // The vector style the in-app map renders (CARTO Voyager with the Konjo key).
      ...(mapStyleUrl ? { mapStyleUrl } : {}),
    },
    android: { ...config.android, softwareKeyboardLayoutMode: 'resize', ...(androidPackage ? { package: androidPackage } : {}), ...(googleServicesFile ? { googleServicesFile } : {}) },
    ios: { ...config.ios, ...(bundleIdentifier ? { bundleIdentifier } : {}) },
  };
};
