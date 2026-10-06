import { Image } from 'expo-image';
import { type Href, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { HorizontalScrollView } from '@/components/ui/horizontal-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamilies, layout, onboardingPalette } from '@/theme/tokens';
import { ClientLanguageToggle } from '@/localization/client-language-toggle';
import { usePublicClientCopy } from '@/localization/use-public-client-copy';
import { useAuthSession } from '@/features/auth/session-context';

const welcomeSplash = require('../../../assets/images/konjo/welcome-splash.png');
const welcomingHero = require('../../../assets/images/konjo/welcoming.png');
const welcomeOverlay = require('../../../assets/images/konjo/welcome-overlay.svg');

// Exact normalized path coordinates [norm_x, norm_y] directly traced from the brand artwork.
// The path explicitly passes into the top of "j", travels down the stem of "j",
// loops gracefully through the teardrop flourish of "j", and continues down through the bottom wave.
const LINE_POINTS: [number, number][] = [
  // 1. Upper wave flowing down towards the j
  [0.505, 0.000],
  [0.505, 0.039],
  [0.503, 0.078],
  [0.498, 0.117],
  [0.489, 0.156],
  [0.473, 0.195],
  [0.456, 0.234],
  [0.443, 0.273],
  [0.450, 0.312],
  [0.481, 0.352],
  [0.543, 0.391],
  [0.588, 0.415],
  [0.612, 0.435],
  // 2. Passing directly into and down the stem of "j"
  [0.621, 0.459],
  [0.623, 0.488],
  [0.621, 0.518],
  [0.616, 0.537],
  // 3. Flowing through the teardrop flourish loop of "j"
  [0.600, 0.557],
  [0.570, 0.570],
  [0.530, 0.568],
  [0.508, 0.555],
  [0.515, 0.533],
  [0.543, 0.516],
  [0.574, 0.510],
  [0.600, 0.525],
  [0.577, 0.552],
  [0.543, 0.574],
  // 4. Exiting "j" and continuing down the bottom wave
  [0.527, 0.601],
  [0.494, 0.635],
  [0.480, 0.669],
  [0.487, 0.708],
  [0.510, 0.747],
  [0.529, 0.796],
  [0.534, 0.835],
  [0.525, 0.874],
  [0.508, 0.923],
  [0.497, 0.967],
  [0.495, 1.000],
];

const POINT_PROGRESS = LINE_POINTS.map((_, i) => i / (LINE_POINTS.length - 1));
const POINT_X = LINE_POINTS.map((pt) => pt[0]);
const POINT_Y = LINE_POINTS.map((pt) => pt[1]);

export function WelcomeScreen() {
  const { isAmharic, t } = usePublicClientCopy();
  const { session, status } = useAuthSession();
  const scrollRef = useRef<ScrollView>(null);
  const { width, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [activePage, setActivePage] = useState(0);
  const pageWidth = Math.min(width, layout.contentMaxWidth);

  const [containerSize, setContainerSize] = useState({
    width: pageWidth,
    height: screenHeight || 844,
  });

  // Animated values for the signature thread entrance and ambient living effects
  const artworkFade = useSharedValue(0.9);
  const drawProgress = useSharedValue(0);
  const sparkOpacity = useSharedValue(0);
  const sparkScale = useSharedValue(1);
  const wordmarkBloom = useSharedValue(0);
  const shimmerProgress = useSharedValue(0);
  const buttonOpacity = useSharedValue(0);
  const buttonScale = useSharedValue(0.8);
  const rippleScale = useSharedValue(1);
  const rippleOpacity = useSharedValue(0);

  useEffect(() => {
    artworkFade.value = withTiming(1, { duration: 600 });

    // 1. Thread tracing spark animation passing through "j"
    sparkOpacity.value = withTiming(1, { duration: 180 });
    sparkScale.value = withRepeat(
      withSequence(withTiming(1.3, { duration: 280 }), withTiming(0.85, { duration: 280 })),
      -1,
      true
    );

    drawProgress.value = withTiming(
      1,
      {
        duration: 2200,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      },
      (finished) => {
        if (finished) {
          sparkOpacity.value = withTiming(0, { duration: 300 });
          // Start ambient light bead gliding through "j" periodically
          shimmerProgress.value = withRepeat(
            withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.quad) }),
            -1,
            false
          );
        }
      }
    );

    // 2. Wordmark bloom as spark weaves directly through the "j"
    wordmarkBloom.value = withDelay(
      850,
      withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) })
    );

    // 3. Action button emergence
    buttonOpacity.value = withDelay(1600, withTiming(1, { duration: 400 }));
    buttonScale.value = withDelay(1600, withSpring(1, { damping: 14, stiffness: 120 }));

    // 4. Subtle pulsating guidance ripple ring
    rippleScale.value = withDelay(
      2000,
      withRepeat(withTiming(1.5, { duration: 2000, easing: Easing.out(Easing.ease) }), -1, false)
    );
    rippleOpacity.value = withDelay(
      2000,
      withRepeat(
        withSequence(
          withTiming(0.45, { duration: 250 }),
          withTiming(0, { duration: 1750, easing: Easing.out(Easing.ease) })
        ),
        -1,
        false
      )
    );
  }, [
    artworkFade,
    buttonOpacity,
    buttonScale,
    drawProgress,
    rippleOpacity,
    rippleScale,
    shimmerProgress,
    sparkOpacity,
    sparkScale,
    wordmarkBloom,
  ]);

  const onSplashLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w > 0 && h > 0) {
      setContainerSize({ width: w, height: h });
    }
  };

  // Compute exact displayed dimensions of the artwork (cover mode)
  const containerW = containerSize.width;
  const containerH = containerSize.height;
  const scale = Math.max(containerW / 575, containerH / 1024);
  const displayedW = 575 * scale;
  const displayedH = 1024 * scale;
  const offsetX = (containerW - displayedW) / 2;
  const offsetY = (containerH - displayedH) / 2;

  const artworkAnimatedStyle = useAnimatedStyle(() => ({
    opacity: artworkFade.value,
  }));

  // Leading glowing spark bead tracking the line directly through "j"
  const sparkStyle = useAnimatedStyle(() => {
    const t = drawProgress.value;
    const normX = interpolate(t, POINT_PROGRESS, POINT_X);
    const normY = interpolate(t, POINT_PROGRESS, POINT_Y);
    const posX = offsetX + normX * displayedW;
    const posY = offsetY + normY * displayedH;
    return {
      transform: [
        { translateX: posX - 16 },
        { translateY: posY - 16 },
        { scale: sparkScale.value },
      ],
      opacity: sparkOpacity.value,
    };
  });

  // Ambient gentle light pulse gliding down the thread and through "j" periodically
  const ambientShimmerStyle = useAnimatedStyle(() => {
    const t = shimmerProgress.value;
    const normX = interpolate(t, POINT_PROGRESS, POINT_X);
    const normY = interpolate(t, POINT_PROGRESS, POINT_Y);
    const posX = offsetX + normX * displayedW;
    const posY = offsetY + normY * displayedH;
    const op = interpolate(t, [0, 0.08, 0.88, 1.0], [0, 0.7, 0.7, 0]);
    return {
      transform: [
        { translateX: posX - 18 },
        { translateY: posY - 18 },
      ],
      opacity: op,
    };
  });

  // Luminous soft bloom behind the wordmark as identity comes into focus
  const bloomStyle = useAnimatedStyle(() => ({
    opacity: wordmarkBloom.value * 0.28,
    transform: [
      { scale: interpolate(wordmarkBloom.value, [0, 1], [0.85, 1.08]) },
    ],
  }));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ scale: buttonScale.value }],
  }));

  const rippleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: rippleOpacity.value,
    transform: [{ scale: rippleScale.value }],
  }));

  const showIntroduction = () => {
    drawProgress.set(1);
    sparkOpacity.set(0);
    scrollRef.current?.scrollTo({ x: pageWidth, animated: true });
    setActivePage(1);
  };

  const handleGetStarted = () => {
    if (status === 'authenticated') {
      const target =
        session?.role === 'professional'
          ? '/pro'
          : session?.role === 'admin'
            ? '/admin'
            : '/client';
      router.push(target as Href);
    } else {
      router.push('/role-select');
    }
  };

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActivePage(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.viewport, { width: pageWidth }]}>
        <HorizontalScrollView
          ref={scrollRef}
          accessibilityLabel={t('konjoIntroduction')}
          bounces={false}
          decelerationRate="fast"
          onMomentumScrollEnd={handleScrollEnd}
          pagingEnabled
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}>
          <Pressable
            accessibilityHint={t('showIntroduction')}
            accessibilityLabel={t('continueKonjo')}
            accessibilityRole="button"
            onLayout={onSplashLayout}
            onPress={showIntroduction}
            style={({ pressed }) => [
              styles.splashPage,
              { width: pageWidth },
              pressed && styles.pressed,
            ]}>
            {/* The Brand Artwork - Exact design where line passes through "j" */}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, artworkAnimatedStyle]}>
              <Image
                contentFit="cover"
                contentPosition="center"
                priority="high"
                source={welcomeSplash}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>

            {/* Wordmark luminous bloom layer */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.wordmarkBloom,
                {
                  top: containerH * 0.44 - 60,
                  left: containerW / 2 - 120,
                },
                bloomStyle,
              ]}
            />

            {/* Leading drawing spark bead passing directly through "j" */}
            <Animated.View pointerEvents="none" style={[styles.sparkContainer, sparkStyle]}>
              <View style={styles.sparkHalo} />
              <View style={styles.sparkCore} />
            </Animated.View>

            {/* Ambient living light bead gliding down the thread and through "j" */}
            <Animated.View pointerEvents="none" style={[styles.shimmerContainer, ambientShimmerStyle]}>
              <View style={styles.shimmerHalo} />
              <View style={styles.shimmerCore} />
            </Animated.View>

            {/* Forward Action Button with pulsating guidance ring */}
            <Animated.View
              style={[
                styles.nextButtonContainer,
                buttonAnimatedStyle,
                { bottom: Math.max(28, insets.bottom + 12) },
              ]}>
              <Animated.View style={[styles.nextButtonRipple, rippleAnimatedStyle]} />
              <View style={styles.nextButton}>
                <Text style={styles.nextArrow}>→</Text>
              </View>
            </Animated.View>
          </Pressable>

          <View style={[styles.heroPage, { width: pageWidth }]}>
            <Image
              accessibilityLabel={t('beautyHeroImage')}
              contentFit="cover"
              contentPosition="center"
              source={welcomingHero}
              style={StyleSheet.absoluteFill}
            />
            <Image contentFit="fill" source={welcomeOverlay} style={styles.visualOverlay} />
            <View style={[styles.heroContent, { paddingBottom: Math.max(44, insets.bottom + 24) }]}>
              <Text accessibilityRole="header" style={[styles.heroTitle, isAmharic && styles.ethiopicSemibold]}>
                {t('welcomeTitle')}
              </Text>
              <Text style={[styles.heroDescription, isAmharic && styles.ethiopicRegular]}>
                {t('welcomeDescription')}
              </Text>
              <Text style={[styles.locationTypes, isAmharic && styles.ethiopicSemibold]}>{t('locationTypes')}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={handleGetStarted}
                style={({ pressed }) => [styles.getStartedButton, pressed && styles.buttonPressed]}>
                <Text style={[styles.getStartedLabel, isAmharic && styles.ethiopicSemibold]}>{t('getStarted')}</Text>
              </Pressable>
            </View>
          </View>
        </HorizontalScrollView>

        <View style={[styles.languageToggle, { top: Math.max(18, insets.top + 8) }]}>
          <ClientLanguageToggle light />
        </View>

        <View
          accessibilityLabel={t('introductionPage').replace('{page}', String(activePage + 1))}
          accessibilityRole="text"
          style={styles.pageIndicator}>
          <View style={[styles.pageDot, activePage === 0 && styles.pageDotActive]} />
          <View style={[styles.pageDot, activePage === 1 && styles.pageDotActive]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    backgroundColor: onboardingPalette.splash,
  },
  viewport: {
    flex: 1,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    height: '100%',
  },
  visualOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    pointerEvents: 'none',
  },
  splashPage: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: onboardingPalette.splash,
    overflow: 'hidden',
    position: 'relative',
  },
  sparkContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkHalo: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
  },
  sparkCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 5,
  },
  shimmerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shimmerHalo: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
  },
  shimmerCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  wordmarkBloom: {
    position: 'absolute',
    width: 240,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 36,
  },
  nextButtonContainer: {
    position: 'absolute',
    right: 24,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonRipple: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(250, 249, 245, 0.65)',
  },
  nextButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(250, 249, 245, 0.60)',
    backgroundColor: 'rgba(250, 249, 245, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextArrow: {
    color: onboardingPalette.canvas,
    fontFamily: fontFamilies.body.regular,
    fontSize: 24,
    lineHeight: 26,
  },
  heroPage: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  heroContent: {
    paddingHorizontal: 26,
  },
  heroTitle: {
    color: onboardingPalette.canvas,
    fontFamily: fontFamilies.display.medium,
    fontSize: 34,
    lineHeight: 39,
  },
  heroDescription: {
    maxWidth: 320,
    color: 'rgba(250, 249, 245, 0.88)',
    fontFamily: fontFamilies.body.regular,
    fontSize: 14.5,
    lineHeight: 22.5,
    marginTop: 12,
  },
  locationTypes: {
    color: onboardingPalette.sage,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 11.5,
    letterSpacing: 0.92,
    lineHeight: 18,
    marginTop: 16,
  },
  getStartedButton: {
    minHeight: 52,
    marginTop: 24,
    borderRadius: 6,
    backgroundColor: onboardingPalette.sage,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  getStartedLabel: {
    color: onboardingPalette.forest,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 15,
  },
  pageIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  languageToggle: { position: 'absolute', right: 20, zIndex: 2 },
  ethiopicRegular: { fontFamily: fontFamilies.ethiopic.regular },
  ethiopicSemibold: { fontFamily: fontFamilies.ethiopic.semibold },
  pageDot: {
    width: 1,
    height: 1,
  },
  pageDotActive: {
    opacity: 1,
  },
  pressed: {
    opacity: 0.96,
  },
  buttonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
});
