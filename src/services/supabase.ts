import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from '@/services/supabase-database.types';
import { supabaseAuthStorage } from '@/services/supabase-auth-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '') ?? '';
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

/**
 * The browser already supplies localStorage. On native, Expo SQLite's install
 * module supplies the same API so Supabase can safely persist and refresh its
 * own session without placing a refresh token in application state.
 */
export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabasePublishableKey, {
      auth: {
        storage: supabaseAuthStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  : null;

if (supabase && Platform.OS !== 'web') {
  if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
