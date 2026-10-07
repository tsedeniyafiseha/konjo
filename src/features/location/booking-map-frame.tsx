import { type ReactNode, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import { fontFamilies, palette } from '@/theme/tokens';

export type MapStatus = 'loading' | 'ready' | 'error' | 'unconfigured';

interface BookingMapFrameProps {
  height: number;
  /** Renders the map; called once for the preview and once more for the full-screen view. */
  renderMap: (fullScreen: boolean) => ReactNode;
  status: MapStatus;
}

/**
 * Chrome shared by the native and web maps: rounded preview, loading and
 * error states, and an expand button that opens the same map full screen so
 * pinch-zoom and panning are not fighting the page scroll.
 */
export function BookingMapFrame({ height, renderMap, status }: BookingMapFrameProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={[styles.frame, { height }]}>
      {renderMap(false)}
      <MapStatusOverlay status={status} />
      {status === 'ready' ? (
        <Pressable accessibilityLabel="Expand map" accessibilityRole="button" hitSlop={8} onPress={() => setExpanded(true)} style={styles.expandButton}>
          <KonjoIcon color={palette.text} name={{ ios: 'arrow.up.left.and.arrow.down.right', android: 'open_in_full', web: 'open_in_full' }} size={18} />
        </Pressable>
      ) : null}
      <Modal animationType="slide" onRequestClose={() => setExpanded(false)} visible={expanded}>
        <SafeAreaView edges={['top', 'bottom']} style={styles.fullScreen}>
          <View style={styles.fullScreenMap}>
            {expanded ? renderMap(true) : null}
            <MapStatusOverlay status={status} />
          </View>
          <Pressable accessibilityLabel="Close map" accessibilityRole="button" hitSlop={8} onPress={() => setExpanded(false)} style={styles.closeButton}>
            <KonjoIcon color={palette.text} name={{ ios: 'xmark', android: 'close', web: 'close' }} size={20} />
          </Pressable>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function MapStatusOverlay({ status }: { status: BookingMapFrameProps['status'] }) {
  if (status === 'ready') return null;
  return (
    <View pointerEvents="none" style={styles.statusOverlay}>
      <Text style={styles.statusText}>{status === 'error' ? 'The map could not load. Check your connection and try again.' : status === 'unconfigured' ? 'The map is not configured for this build.' : 'Loading map…'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', borderRadius: 14, overflow: 'hidden', backgroundColor: '#E3EAE0' },
  expandButton: { position: 'absolute', zIndex: 2, top: 8, right: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3 },
  statusOverlay: { position: 'absolute', zIndex: 1, top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  statusText: { color: palette.textSecondary, fontFamily: fontFamilies.body.medium, fontSize: 13, textAlign: 'center' },
  fullScreen: { flex: 1, backgroundColor: '#E3EAE0' },
  fullScreenMap: { flex: 1 },
  closeButton: { position: 'absolute', zIndex: 2, top: 56, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
});
