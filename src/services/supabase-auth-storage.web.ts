// Browser adapter: use the platform-provided storage and avoid loading the
// Expo SQLite worker into static web routes.
export const supabaseAuthStorage = globalThis.localStorage;
