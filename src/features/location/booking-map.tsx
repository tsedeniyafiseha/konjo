import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  Marker,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, type NativeSyntheticEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import { fontFamilies, palette } from '@/theme/tokens';
import { BookingMapFrame, type MapStatus } from './booking-map-frame';
import { distanceMeters, type GeoPoint } from './geo';
import { journeyFeature, journeyPoints } from './journey';
import { ADDIS_ABABA, type MapMarker } from './map-markers';
import { MAP_ATTRIBUTION, MAP_ATTRIBUTION_URL, mapStyleUrl } from './map-style';

export type { MapMarker } from './map-markers';

interface BookingMapProps {
  markers: readonly MapMarker[];
  height?: number;
  /** Fallback centre when there are no markers. Defaults to Addis Ababa. */
  fallbackCenter?: GeoPoint;
  attributionColor?: string;
}

const FIT_PADDING = { top: 56, right: 56, bottom: 56, left: 56 };
const STYLE_TIMEOUT_MS = 25_000;
const MARKER_TWEEN_MS = 900;
/** Re-fit the camera in follow mode once a marker has moved this far. */
const REFIT_DISTANCE_METERS = 60;

/**
 * Live-tracking map: MapLibre rendering the CARTO Voyager vector basemap
 * (OpenStreetMap data) on Android and iOS. The web build resolves
 * booking-map.web.tsx, which renders the same style with MapLibre GL JS.
 *
 * Markers move in place (no map re-creation) and the professional's pin is
 * tweened between GPS reports so movement reads as continuous. The camera
 * fits every marker when tracking starts and follows them until the person
 * pans or zooms; a recenter button hands control back.
 */
export function BookingMap({ markers, height = 220, fallbackCenter = ADDIS_ABABA }: BookingMapProps) {
  const styleUrl = mapStyleUrl();
  const [status, setStatus] = useState<MapStatus>(styleUrl ? 'loading' : 'unconfigured');
  return (
    <BookingMapFrame
      height={height}
      renderMap={(fullScreen) => (
        styleUrl
          ? <TrackingMap fallbackCenter={fallbackCenter} key={fullScreen ? 'full' : 'preview'} markers={markers} onStatus={fullScreen ? undefined : setStatus} styleUrl={styleUrl} />
          : null
      )}
      status={status}
    />
  );
}

interface TrackingMapProps {
  markers: readonly MapMarker[];
  styleUrl: string;
  fallbackCenter: GeoPoint;
  onStatus?: (status: MapStatus) => void;
}

function TrackingMap({ markers, styleUrl, fallbackCenter, onStatus }: TrackingMapProps) {
  const cameraRef = useRef<CameraRef>(null);
  const [loaded, setLoaded] = useState(false);
  const [following, setFollowing] = useState(true);
  const lastFit = useRef<{ key: string; points: readonly GeoPoint[] } | null>(null);

  useEffect(() => {
    if (loaded) return;
    const timer = setTimeout(() => onStatus?.('error'), STYLE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loaded, onStatus]);

  const fit = useCallback((points: readonly GeoPoint[], animated: boolean) => {
    const camera = cameraRef.current;
    if (!camera) return;
    if (points.length >= 2) {
      const lngs = points.map((point) => point.longitude);
      const lats = points.map((point) => point.latitude);
      camera.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], { padding: FIT_PADDING, duration: animated ? 600 : 0 });
    } else if (points.length === 1) {
      camera.flyTo({ center: [points[0].longitude, points[0].latitude], zoom: 15, duration: animated ? 600 : 0 });
    }
  }, []);

  // Follow mode: fit when the set of markers changes or one has moved a real distance.
  const markerIds = markers.map((marker) => marker.id).sort().join('|');
  useEffect(() => {
    if (!loaded || !following) return;
    const points = markers.map((marker) => marker.point);
    const previous = lastFit.current;
    const moved = !previous || previous.key !== markerIds
      || points.some((point, index) => !previous.points[index] || distanceMeters(point, previous.points[index]) > REFIT_DISTANCE_METERS);
    if (!moved) return;
    lastFit.current = { key: markerIds, points };
    fit(points, Boolean(previous));
    // markers is represented by markerIds plus the distance check above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, following, loaded, markerIds]);

  const onRegionWillChange = useCallback((event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    if (event.nativeEvent.userInteraction) setFollowing(false);
  }, []);

  const recenter = () => {
    setFollowing(true);
    lastFit.current = null;
  };

  const journey = useMemo(() => journeyFeature(journeyPoints(markers)), [markers]);
  const initialCenter: [number, number] = markers[0]
    ? [markers[0].point.longitude, markers[0].point.latitude]
    : [fallbackCenter.longitude, fallbackCenter.latitude];

  return (
    <View style={styles.fill}>
      <MapLibreMap
        attribution={false}
        compass={false}
        logo={false}
        mapStyle={styleUrl}
        onDidFailLoadingMap={() => onStatus?.('error')}
        onDidFinishLoadingStyle={() => { setLoaded(true); onStatus?.('ready'); }}
        onRegionWillChange={onRegionWillChange}
        style={StyleSheet.absoluteFill}
        touchPitch={false}
        touchRotate={false}
      >
        <Camera initialViewState={{ center: initialCenter, zoom: markers.length ? 14 : 11 }} ref={cameraRef} />
        {journey ? (
          <GeoJSONSource data={journey} id="konjo-journey">
            <Layer id="konjo-journey-line" layout={{ 'line-cap': 'round' }} paint={{ 'line-color': palette.olive, 'line-width': 3, 'line-dasharray': [2, 1.5] }} type="line" />
          </GeoJSONSource>
        ) : null}
        {markers.map((marker) => <TrackingMarker key={marker.id} marker={marker} />)}
      </MapLibreMap>
      {!following ? (
        <Pressable accessibilityLabel="Recenter map" accessibilityRole="button" hitSlop={8} onPress={recenter} style={styles.followButton}>
          <KonjoIcon color={palette.text} name={{ ios: 'location.fill', android: 'my_location', web: 'my_location' }} size={18} />
        </Pressable>
      ) : null}
      <Pressable accessibilityLabel={`Map data ${MAP_ATTRIBUTION}`} accessibilityRole="link" onPress={() => { void Linking.openURL(MAP_ATTRIBUTION_URL); }} style={styles.attribution}>
        <Text numberOfLines={1} style={styles.attributionText}>{MAP_ATTRIBUTION}</Text>
      </Pressable>
    </View>
  );
}

/** A marker whose pin glides between GPS reports instead of jumping. */
function TrackingMarker({ marker }: { marker: MapMarker }) {
  const point = useTweenedPoint(marker.point, marker.kind !== 'destination');
  return (
    <Marker anchor={marker.kind === 'destination' ? 'bottom' : 'center'} id={marker.id} lngLat={[point.longitude, point.latitude]}>
      <View style={styles.markerWrap}>
        {marker.kind === 'destination'
          ? <View style={styles.destinationPin}><View style={styles.destinationPinCore} /></View>
          : <View style={[styles.movingPin, marker.kind === 'self' && styles.selfPin]}><View style={styles.movingPinDot} /></View>}
        {marker.label ? <Text numberOfLines={1} style={styles.markerLabel}>{marker.label}</Text> : null}
      </View>
    </Marker>
  );
}

/** Interpolates from the previous point to the new one over MARKER_TWEEN_MS. */
function useTweenedPoint(target: GeoPoint, enabled: boolean): GeoPoint {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  useEffect(() => {
    const from = shownRef.current;
    if (!enabled || distanceMeters(from, target) < 1 || distanceMeters(from, target) > 2_000) {
      shownRef.current = target;
      const settle = requestAnimationFrame(() => setShown(target));
      return () => cancelAnimationFrame(settle);
    }
    const startedAt = Date.now();
    let frame = 0;
    const step = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / MARKER_TWEEN_MS);
      const eased = 1 - (1 - progress) * (1 - progress);
      const next = {
        latitude: from.latitude + (target.latitude - from.latitude) * eased,
        longitude: from.longitude + (target.longitude - from.longitude) * eased,
      };
      shownRef.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [enabled, target]);
  return shown;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#E3EAE0' },
  followButton: { position: 'absolute', zIndex: 2, right: 8, bottom: 30, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3 },
  attribution: { position: 'absolute', zIndex: 2, left: 0, bottom: 0, maxWidth: '85%', backgroundColor: 'rgba(255,255,255,0.82)', borderTopRightRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  attributionText: { color: '#333', fontFamily: fontFamilies.body.regular, fontSize: 9 },
  markerWrap: { alignItems: 'center' },
  destinationPin: { width: 30, height: 30, borderRadius: 15, borderBottomLeftRadius: 2, transform: [{ rotate: '-45deg' }], backgroundColor: palette.olive, borderWidth: 3, borderColor: palette.white, alignItems: 'center', justifyContent: 'center' },
  destinationPinCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.white },
  movingPin: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(212, 160, 23, 0.35)', alignItems: 'center', justifyContent: 'center' },
  selfPin: { backgroundColor: 'rgba(37, 99, 235, 0.3)' },
  movingPinDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: palette.gold, borderWidth: 2, borderColor: palette.white },
  markerLabel: { marginTop: 3, maxWidth: 140, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 11 },
});
