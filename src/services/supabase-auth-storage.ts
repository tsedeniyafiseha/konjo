import 'expo-sqlite/localStorage/install';

// Native adapter: install Expo SQLite's persistent localStorage implementation.
export const supabaseAuthStorage = globalThis.localStorage;
