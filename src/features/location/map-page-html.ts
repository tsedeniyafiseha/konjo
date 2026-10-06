import type { GeoPoint } from './geo';

import { MAP_ATTRIBUTION, mapStyleKey, mapStyleUrl } from './map-style';

/**
 * The map page used by the web build (booking-map.web.tsx renders it in a
 * same-origin iframe): MapLibre GL JS rendering the CARTO Voyager vector
 * style (OpenStreetMap data) with the Konjo CARTO key. MapLibre is fetched
 * from cdnjs with subresource-integrity hashes, so a tampered file is refused
 * and the host shows its "map unavailable" state. Requests to the style's own
 * host carry the provider key; nothing else sees it.
 *
 * Host → page: `window.konjoSetMarkers(list)` with the JSON from
 * serializeMarkers(). Page → host: JSON messages {type: 'ready' | 'error' |
 * 'link', url?} through parent.postMessage.
 *
 * The page keeps the viewport still while markers move inside it and re-fits
 * only when the set of markers changes or one drifts near the edge, and never
 * within eight seconds of the user panning or zooming.
 */
const MAPLIBRE_VERSION = '5.6.1';
const MAPLIBRE_JS_SRI = 'sha512-36ZAxaz7d+BkgrTlV/Au2lklXwzkmGh2RuJpI0JE4bYA8NKq+634D9g6aDxbLDBebJV9otCO1Fl/D8v7IIq3/g==';
const MAPLIBRE_CSS_SRI = 'sha512-DBNed2oEjOrfIRj8Czuzs7padWawLWbA64OoDekn8gs2a3J6WOaR5xXfnFgaxKGpxIuSn/rAo/PsgOgO6PZ/vA==';

export function mapPageHtml(center: GeoPoint, styleUrl: string | null = mapStyleUrl()): string {
  const lat = Number(center.latitude.toFixed(6));
  const lng = Number(center.longitude.toFixed(6));
  const apiKey = styleUrl ? mapStyleKey(styleUrl) : null;
  const keyDomain = styleUrl ? new URL(styleUrl).hostname.split('.').slice(-2).join('.') : '';
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/${MAPLIBRE_VERSION}/maplibre-gl.css" integrity="${MAPLIBRE_CSS_SRI}" crossorigin="anonymous">
<style>
  html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #E3EAE0; overflow: hidden; }
  .konjo-marker { position: relative; width: 28px; height: 28px; }
  .konjo-pin { position: absolute; box-sizing: border-box; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
  .konjo-destination { left: 0; top: 0; width: 28px; height: 28px; border-radius: 14px 14px 14px 2px; transform: rotate(-45deg); background: #3F6B3A; }
  .konjo-professional { left: 3px; top: 3px; width: 22px; height: 22px; border-radius: 50%; background: #D4A017; }
  .konjo-self { left: 3px; top: 3px; width: 22px; height: 22px; border-radius: 50%; background: #2563EB; }
  .konjo-label { position: absolute; top: 31px; left: 50%; transform: translateX(-50%); white-space: nowrap; background: rgba(255,255,255,.92); border-radius: 6px; padding: 2px 6px; font: 600 11px/1.3 -apple-system, Roboto, sans-serif; color: #1F2A1E; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
  .maplibregl-ctrl-attrib { font-size: 10px; }
  .maplibregl-ctrl-attrib-button { display: none; }
</style>
</head><body>
<div id="map"></div>
<script>
  function konjoPost(message) {
    try {
      var text = JSON.stringify(message);
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text);
      else if (window.parent && window.parent !== window) window.parent.postMessage({ konjoMap: message }, '*');
    } catch (e) {}
  }
</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/${MAPLIBRE_VERSION}/maplibre-gl.js" integrity="${MAPLIBRE_JS_SRI}" crossorigin="anonymous" onerror="konjoPost({ type: 'error' })"></script>
<script>
(function () {
  if (!window.maplibregl || !${JSON.stringify(styleUrl)}) { konjoPost({ type: 'error' }); return; }
  var loaded = false;
  var apiKey = ${JSON.stringify(apiKey)};
  var keyDomain = ${JSON.stringify(keyDomain)};
  function withProviderKey(url) {
    if (!apiKey) return { url: url };
    try {
      var host = new URL(url).hostname;
      if (host === keyDomain || host.slice(-keyDomain.length - 1) === '.' + keyDomain) {
        if (url.indexOf('key=') >= 0) return { url: url };
        return { url: url + (url.indexOf('?') >= 0 ? '&' : '?') + 'key=' + encodeURIComponent(apiKey) };
      }
    } catch (e) {}
    return { url: url };
  }
  var map;
  try {
    map = new maplibregl.Map({
      container: 'map', style: ${JSON.stringify(styleUrl)}, center: [${lng}, ${lat}], zoom: 12, minZoom: 3, maxZoom: 19,
      attributionControl: { compact: false, customAttribution: ${JSON.stringify(MAP_ATTRIBUTION)} }, pitchWithRotate: false, dragRotate: false, transformRequest: withProviderKey
    });
  } catch (e) { konjoPost({ type: 'error' }); return; }
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
  var pendingJourney = null;
  function journeyFeature(list) {
    var destination = null, moving = null;
    list.forEach(function (item) {
      if (item.kind === 'destination') destination = item;
      else if (item.kind === 'professional' || (item.kind === 'self' && !moving)) moving = item;
    });
    var coordinates = destination && moving ? [[moving.longitude, moving.latitude], [destination.longitude, destination.latitude]] : [];
    return { type: 'Feature', geometry: { type: 'LineString', coordinates: coordinates }, properties: {} };
  }
  function setJourney(feature) {
    if (!loaded) { pendingJourney = feature; return; }
    var source = map.getSource('konjo-journey');
    if (source) { source.setData(feature); return; }
    map.addSource('konjo-journey', { type: 'geojson', data: feature });
    map.addLayer({ id: 'konjo-journey', type: 'line', source: 'konjo-journey', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#3F6B3A', 'line-width': 3, 'line-dasharray': [2, 1.5] } });
  }
  map.on('load', function () { loaded = true; if (pendingJourney) { setJourney(pendingJourney); pendingJourney = null; } konjoPost({ type: 'ready' }); });
  map.on('error', function () { if (!loaded) konjoPost({ type: 'error' }); });
  setTimeout(function () { if (!loaded) konjoPost({ type: 'error' }); }, 25000);
  // External links (attribution) are handed to the host app instead of navigating the map page.
  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (link && /^https?:/.test(link.href)) { event.preventDefault(); konjoPost({ type: 'link', url: link.href }); }
  });
  var markers = {};
  var lastIds = '';
  var lastInteraction = 0;
  map.on('dragstart', function () { lastInteraction = Date.now(); });
  map.on('zoomstart', function (event) { if (event.originalEvent) lastInteraction = Date.now(); });
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function createMarker(item, label) {
    var element = document.createElement('div');
    element.className = 'konjo-marker';
    element.innerHTML = '<div class="konjo-pin konjo-' + item.kind + '"></div>' + (label ? '<div class="konjo-label">' + label + '</div>' : '');
    return new maplibregl.Marker({ element: element, anchor: item.kind === 'destination' ? 'bottom-left' : 'center', offset: item.kind === 'destination' ? [-2, 2] : [0, 0] })
      .setLngLat([item.longitude, item.latitude]).addTo(map);
  }
  function insideInner(item) {
    var p = map.project([item.longitude, item.latitude]);
    var box = map.getContainer();
    var w = box.clientWidth, h = box.clientHeight;
    return p.x >= w * 0.15 && p.x <= w * 0.85 && p.y >= h * 0.15 && p.y <= h * 0.85;
  }
  window.konjoSetMarkers = function (list) {
    if (!Array.isArray(list)) return;
    var seen = {};
    list.forEach(function (item) {
      seen[item.id] = true;
      var label = item.label ? escapeHtml(item.label) : null;
      var existing = markers[item.id];
      if (existing && (existing.label !== label || existing.kind !== item.kind)) { existing.marker.remove(); existing = null; }
      if (!existing) markers[item.id] = { marker: createMarker(item, label), label: label, kind: item.kind };
      else existing.marker.setLngLat([item.longitude, item.latitude]);
    });
    Object.keys(markers).forEach(function (id) {
      if (!seen[id]) { markers[id].marker.remove(); delete markers[id]; }
    });
    setJourney(journeyFeature(list));
    if (!list.length) return;
    var ids = list.map(function (item) { return item.id; }).sort().join('|');
    var changed = ids !== lastIds;
    lastIds = ids;
    var outside = list.some(function (item) { return !insideInner(item); });
    var quiet = Date.now() - lastInteraction > 8000;
    if (!changed && !(outside && quiet)) return;
    if (list.length >= 2) {
      var bounds = new maplibregl.LngLatBounds();
      list.forEach(function (item) { bounds.extend([item.longitude, item.latitude]); });
      map.fitBounds(bounds, { padding: 56, maxZoom: 16, duration: changed ? 0 : 600 });
    } else {
      map.easeTo({ center: [list[0].longitude, list[0].latitude], zoom: Math.max(map.getZoom(), 15), duration: changed ? 0 : 600 });
    }
  };
})();
</script>
</body></html>`;
}

export type MapPageMessage = { type: 'ready' } | { type: 'error' } | { type: 'link'; url: string };

export function parseMapPageMessage(raw: unknown): MapPageMessage | null {
  const value = typeof raw === 'string' ? safeJson(raw) : raw;
  if (!value || typeof value !== 'object') return null;
  const message = value as { type?: unknown; url?: unknown };
  if (message.type === 'ready' || message.type === 'error') return { type: message.type };
  if (message.type === 'link' && typeof message.url === 'string' && /^https?:\/\//.test(message.url)) return { type: 'link', url: message.url };
  return null;
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}
