import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

// Keep old bookmarks working. Professionals authenticate with phone + password
// and clients with email + password; neither flow lives on this route anymore.
export default function PhoneRoute() {
  const params = useLocalSearchParams<{ role?: string; language?: string; intent?: string }>();
  if (params.role === 'professional') {
    const language = params.language === 'am' || params.language === 'om' ? params.language : 'en';
    const intent = params.intent === 'signup' ? 'signup' : params.intent === 'recovery' ? 'recovery' : 'signin';
    return <Redirect href={`/professional-auth?language=${language}&intent=${intent}` as Href} />;
  }
  if (params.intent === 'recovery') return <Redirect href={'/client-email?mode=forgot' as Href} />;
  return <Redirect href={'/client-auth' as Href} />;
}
