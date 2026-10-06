import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { CalendarSystem } from './ethiopian-calendar';

const KEY = 'konjo.calendar-system.v1';

/** The calendar the client prefers for picking dates; Amharic users default to the Ethiopian calendar. */
export async function loadCalendarPreference(fallback: CalendarSystem): Promise<CalendarSystem> {
  try {
    const stored = Platform.OS === 'web'
      ? (typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null)
      : await SecureStore.getItemAsync(KEY);
    return stored === 'ethiopian' || stored === 'gregorian' ? stored : fallback;
  } catch {
    return fallback;
  }
}

export async function saveCalendarPreference(calendar: CalendarSystem): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, calendar);
    } else {
      await SecureStore.setItemAsync(KEY, calendar);
    }
  } catch {
    // A preference that cannot be stored is simply asked again next time.
  }
}
