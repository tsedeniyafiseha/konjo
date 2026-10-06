import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BookingMapFrame } from './booking-map-frame';
import type { GeoPoint } from './geo';
import { mapPageHtml, parseMapPageMessage } from './map-page-html';
import { ADDIS_ABABA, type MapMarker, serializeMarkers } from './map-markers';

export type { MapMarker } from './map-markers';

interface BookingMapProps {
  markers: readonly MapMarker[];
  height?: number;
  fallbackCenter?: GeoPoint;
  attributionColor?: string;
}

interface MapFrameWindow extends Window {
  konjoSetMarkers?: (list: unknown[]) => void;
}

/** Web build: the same MapLibre page as the phone, in a same-origin iframe. */
export function BookingMap({ markers, height = 220, fallbackCenter = ADDIS_ABABA }: BookingMapProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const payload = serializeMarkers(markers);
  return (
    <BookingMapFrame
      height={height}
      renderMap={(fullScreen) => <MapFrame center={fallbackCenter} key={fullScreen ? 'full' : 'preview'} onStatus={fullScreen ? undefined : setStatus} payload={payload} />}
      status={status}
    />
  );
}

function MapFrame({ center, onStatus, payload }: { center: GeoPoint; onStatus?: (status: 'loading' | 'ready' | 'error') => void; payload: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const html = useMemo(() => mapPageHtml(center), [center]);

  const onWindowMessage = useCallback((event: MessageEvent) => {
    if (event.source !== frameRef.current?.contentWindow) return;
    const message = parseMapPageMessage((event.data as { konjoMap?: unknown } | null)?.konjoMap);
    if (!message) return;
    if (message.type === 'ready') { setReady(true); onStatus?.('ready'); }
    else if (message.type === 'error') onStatus?.('error');
    else window.open(message.url, '_blank', 'noopener');
  }, [onStatus]);

  useEffect(() => {
    window.addEventListener('message', onWindowMessage);
    return () => window.removeEventListener('message', onWindowMessage);
  }, [onWindowMessage]);

  useEffect(() => {
    if (!ready) return;
    const frameWindow = frameRef.current?.contentWindow as MapFrameWindow | null | undefined;
    frameWindow?.konjoSetMarkers?.(JSON.parse(payload) as unknown[]);
  }, [ready, payload]);

  return (
    <iframe
      ref={frameRef}
      sandbox="allow-scripts allow-same-origin"
      srcDoc={html}
      style={{ border: 0, width: '100%', height: '100%', display: 'block', background: '#E3EAE0' }}
      title="Map"
    />
  );
}
