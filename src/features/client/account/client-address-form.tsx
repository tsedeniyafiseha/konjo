import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KonjoIcon } from '@/components/ui/konjo-icon';

import { KonjoButton } from '@/components/ui/konjo-button';
import { useAuthSession } from '@/features/auth/session-context';
import type { BookingAddress } from '@/features/booking/types';
import { useClientCopy } from '@/localization/use-client-copy';
import { fontFamilies, palette, radii, spacing } from '@/theme/tokens';
import { addressSearchAvailable, reverseGeocode, searchAddresses } from './address-search-service';
import { loadServiceZones } from './service-zone-service';
import type { ApiAddressCandidate, ApiServiceZone } from '../../../../shared/api-contracts';

const SEARCH_MIN_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 400;

type NewClientAddress = Omit<BookingAddress, 'id' | 'fee'>;

interface ClientAddressFormProps {
  initialAddress?: NewClientAddress;
  onCancel?: () => void;
  onSave: (address: NewClientAddress) => Promise<void>;
  submitLabel?: string;
}

export function ClientAddressForm({
  initialAddress,
  onCancel,
  onSave,
  submitLabel,
}: ClientAddressFormProps) {
  const { t } = useClientCopy();
  const { session } = useAuthSession();
  const token = session?.source === 'api' ? session.accessToken ?? null : null;
  const [label, setLabel] = useState(initialAddress?.label ?? 'Home');
  const [zone, setZone] = useState(initialAddress?.zone ?? '');
  const [detail, setDetail] = useState(initialAddress?.detail ?? '');
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(
    typeof initialAddress?.latitude === 'number' && typeof initialAddress?.longitude === 'number'
      ? { latitude: initialAddress.latitude, longitude: initialAddress.longitude }
      : null,
  );
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zones, setZones] = useState<readonly ApiServiceZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<readonly ApiAddressCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [searchUnavailable, setSearchUnavailable] = useState(false);
  const searchEnabled = addressSearchAvailable && Boolean(token) && !searchUnavailable;

  // Pick the sub-city whose name appears in the candidate, so the fee zone
  // follows the address instead of asking the client to guess.
  const applyZoneFor = useCallback((candidate: ApiAddressCandidate) => {
    const haystack = `${candidate.area ?? ''} ${candidate.label}`.toLowerCase();
    const match = zones.find((item) => haystack.includes(item.label.toLowerCase()));
    if (match) setZone(match.label);
  }, [zones]);

  const query = search.trim();
  const canSearch = searchEnabled && query.length >= SEARCH_MIN_LENGTH;
  const searchRequest = useRef(0);

  useEffect(() => {
    if (!canSearch || !token) return;
    const requestId = ++searchRequest.current;
    const isLatest = () => requestId === searchRequest.current;
    const timer = setTimeout(async () => {
      if (!isLatest()) return;
      setSearching(true);
      try {
        const result = await searchAddresses(query, token);
        if (!isLatest()) return;
        if (!result.available) { setSearchUnavailable(true); return; }
        setCandidates(result.candidates);
        setSearchedQuery(query);
      } catch (searchError) {
        if (__DEV__) console.warn('Address search failed.', searchError);
        if (isLatest()) { setCandidates([]); setSearchedQuery(query); }
      } finally {
        if (isLatest()) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => { clearTimeout(timer); };
  }, [canSearch, query, token]);
  const visibleCandidates = canSearch ? candidates : [];

  const chooseCandidate = (candidate: ApiAddressCandidate) => {
    setPin({ latitude: candidate.latitude, longitude: candidate.longitude });
    setSearch(candidate.label);
    setCandidates([]);
    setSearchedQuery('');
    applyZoneFor(candidate);
    setDetail((current) => (current.trim() ? current : candidate.label));
    setLocationNote(t('addressFound'));
  };

  const refreshZones = useCallback(async () => {
    setZonesLoading(true);
    setError(null);
    try {
      const activeZones = await loadServiceZones();
      setZones(activeZones);
      setZone((current) => current && !activeZones.some((item) => item.label === current) ? '' : current);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('serviceZonesLoadError'));
    } finally {
      setZonesLoading(false);
    }
  }, [t]);

  useEffect(() => {
    Promise.resolve().then(refreshZones);
  }, [refreshZones]);

  const captureLocation = async () => {
    if (locating) return;
    setLocating(true);
    setLocationNote(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationNote(t('locationDenied'));
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setPin(point);
      setLocationNote(t('locationCaptured'));
      // Name the pinned spot so the sub-city and directions start filled in.
      if (searchEnabled && token) {
        const candidate = await reverseGeocode(point, token);
        if (candidate) {
          applyZoneFor(candidate);
          setDetail((current) => (current.trim() ? current : candidate.label));
          setSearch(candidate.label);
        }
      }
    } catch (captureError) {
      if (__DEV__) console.warn('Unable to capture the address location.', captureError);
      setLocationNote(t('locationDenied'));
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    if (!zone || label.trim().length < 2 || detail.trim().length < 8) {
      setError(t('addressValidationError'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({ label: label.trim(), zone, detail: detail.trim(), latitude: pin?.latitude ?? null, longitude: pin?.longitude ?? null });
    } catch (saveError) {
      if (__DEV__) console.error('Unable to save client address.', saveError);
      setError(saveError instanceof Error ? saveError.message : t('addressSaveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      <View style={styles.field}>
        <Text style={styles.label}>{t('addressLabel')}</Text>
        <TextInput
          accessibilityLabel={t('addressLabel')}
          autoComplete="off"
          onChangeText={setLabel}
          placeholder={t('addressPlaceholder')}
          placeholderTextColor={palette.textMuted}
          style={styles.input}
          value={label}
        />
      </View>

      {searchEnabled ? (
        <View style={styles.field}>
          <Text style={styles.label}>{t('searchAddress')}</Text>
          <TextInput
            accessibilityLabel={t('searchAddress')}
            autoCorrect={false}
            onChangeText={setSearch}
            placeholder={t('searchAddressPlaceholder')}
            placeholderTextColor={palette.textMuted}
            style={styles.input}
            value={search}
          />
          {canSearch && searching ? <Text style={styles.fieldHint}>{t('searchingAddresses')}</Text> : null}
          {visibleCandidates.length ? (
            <View style={styles.candidates}>
              {visibleCandidates.map((candidate) => (
                <Pressable
                  accessibilityRole="button"
                  key={candidate.id}
                  onPress={() => chooseCandidate(candidate)}
                  style={({ pressed }) => [styles.candidate, pressed && styles.pressed]}>
                  <KonjoIcon color={palette.olive} name={{ ios: 'mappin', android: 'location_on', web: 'location_on' }} size={16} />
                  <View style={styles.candidateCopy}>
                    <Text numberOfLines={2} style={styles.candidateLabel}>{candidate.label}</Text>
                    {candidate.area ? <Text style={styles.candidateArea}>{candidate.area}</Text> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
          {canSearch && !searching && searchedQuery === query && !candidates.length ? (
            <Text style={styles.fieldHint}>{t('noAddressesFound')}</Text>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.label}>{t('subCity')}</Text>
      <View accessibilityRole="radiogroup" style={styles.zones}>
        {zones.map((item) => {
          const selected = item.label === zone;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={item.id}
              onPress={() => setZone(item.label)}
              style={({ pressed }) => [
                styles.zone,
                selected && styles.zoneSelected,
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.zoneLabel, selected && styles.zoneLabelSelected]}>
                {selected ? '✓  ' : ''}{item.label} · {item.travelFee === 0 ? t('free') : `ETB ${item.travelFee}`}
              </Text>
            </Pressable>
          );
        })}
        {zonesLoading ? <Text style={styles.zoneStatus}>{t('loadingServiceZones')}</Text> : null}
        {!zonesLoading && zones.length === 0 ? (
          <Pressable accessibilityRole="button" onPress={refreshZones} style={styles.retryZones}>
            <Text style={styles.zoneLabel}>{t('retryServiceZones')}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('buildingDirections')}</Text>
        <TextInput
          accessibilityLabel={t('buildingDirections')}
          multiline
          onChangeText={setDetail}
          placeholder={t('directionsPlaceholder')}
          placeholderTextColor={palette.textMuted}
          style={[styles.input, styles.textArea, detail.trim().length > 0 && detail.trim().length < 8 && styles.inputWarning]}
          textAlignVertical="top"
          value={detail}
        />
        {detail.trim().length > 0 && detail.trim().length < 8 ? (
          <Text style={styles.fieldHint}>{t('addressDetailMinLength')}</Text>
        ) : null}
      </View>

      <View style={styles.field}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: locating }}
          disabled={locating}
          onPress={captureLocation}
          style={({ pressed }) => [styles.locationButton, pin && styles.locationButtonDone, pressed && styles.pressed]}>
          <KonjoIcon color={pin ? palette.white : palette.olive} name={{ ios: 'location.fill', android: 'my_location', web: 'my_location' }} size={16} />
          <Text style={[styles.locationLabel, pin && styles.locationLabelDone]}>{locating ? t('locatingYou') : pin ? t('locationCaptured') : t('useMyLocation')}</Text>
        </Pressable>
        {pin ? (
          <Pressable accessibilityRole="button" onPress={() => { setPin(null); setLocationNote(null); }} style={styles.removePin}>
            <Text style={styles.removePinLabel}>{t('removePin')}</Text>
          </Pressable>
        ) : null}
        {locationNote && !pin ? <Text style={styles.locationNote}>{locationNote}</Text> : null}
      </View>

      {error ? (
        <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <KonjoButton
        disabled={!zone || label.trim().length < 2 || detail.trim().length < 8}
        label={submitLabel ?? t('saveAddress')}
        loading={saving}
        onPress={save}
        variant="dark"
      />
      {onCancel ? (
        <Pressable accessibilityRole="button" disabled={saving} onPress={onCancel} style={styles.cancel}>
          <Text style={styles.cancelLabel}>{t('cancel')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  field: { gap: 7 },
  candidates: { borderWidth: 1, borderColor: palette.border, borderRadius: radii.md, backgroundColor: palette.surface, overflow: 'hidden' },
  candidate: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  candidateCopy: { flex: 1 },
  candidateLabel: { color: palette.text, fontFamily: fontFamilies.body.medium, fontSize: 13.5, lineHeight: 19 },
  candidateArea: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12, marginTop: 2 },
  label: { color: palette.text, fontFamily: fontFamilies.body.medium, fontSize: 12.5 },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
    color: palette.text,
    fontFamily: fontFamilies.body.regular,
    fontSize: 14.5,
    paddingHorizontal: 15,
  },
  inputWarning: { borderColor: palette.error },
  fieldHint: { color: palette.error, fontFamily: fontFamilies.body.regular, fontSize: 11.5, lineHeight: 16 },
  textArea: { minHeight: 104, paddingTop: 13 },
  zones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  zoneStatus: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 12, paddingVertical: 12 },
  retryZones: { minHeight: 42, justifyContent: 'center', borderWidth: 1, borderColor: palette.border, borderRadius: radii.pill, paddingHorizontal: 14 },
  zone: {
    minHeight: 42,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.pill,
    backgroundColor: palette.surface,
    paddingHorizontal: 14,
  },
  zoneSelected: { borderColor: palette.olive, backgroundColor: palette.olive },
  zoneLabel: { color: palette.textSecondary, fontFamily: fontFamilies.body.medium, fontSize: 12 },
  zoneLabelSelected: { color: palette.white, fontFamily: fontFamilies.body.semibold },
  error: { color: palette.error, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 18 },
  locationButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: palette.olive, borderRadius: radii.md, backgroundColor: palette.surface, paddingHorizontal: 14 },
  locationButtonDone: { backgroundColor: palette.olive },
  locationLabel: { flex: 1, color: palette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  locationLabelDone: { color: palette.white },
  removePin: { minHeight: 36, justifyContent: 'center' },
  removePinLabel: { color: palette.textSecondary, fontFamily: fontFamilies.body.medium, fontSize: 12 },
  locationNote: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12, lineHeight: 17 },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelLabel: { color: palette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  pressed: { opacity: 0.72 },
});
