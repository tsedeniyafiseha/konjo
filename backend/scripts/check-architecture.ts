import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const projectRoot = process.cwd();
const backendRoot = join(projectRoot, 'backend', 'src');
const clientRoot = join(projectRoot, 'src');
const violations: string[] = [];

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return ['.ts', '.tsx'].includes(extname(entry.name)) ? [path] : [];
  });
}

function importsFor(path: string): string[] {
  const source = readFileSync(path, 'utf8');
  const imports: string[] = [];
  const pattern = /(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) imports.push(match[1]);
  return imports;
}

function reject(path: string, specifier: string, reason: string) {
  violations.push(`${relative(projectRoot, path)} imports ${specifier}: ${reason}`);
}

for (const path of sourceFiles(backendRoot)) {
  const localPath = relative(backendRoot, path);
  const source = readFileSync(path, 'utf8');
  if (
    localPath === 'database.ts' &&
    /CREATE TABLE|ALTER TABLE|seededProfessionals/.test(source)
  ) {
    violations.push(
      `${relative(projectRoot, path)} owns schema or seed details: SQLite bootstrap belongs in dedicated adapter modules`,
    );
  }
  if (
    localPath === 'database.ts' &&
    /\b(?:enqueueNotification|claimDomainEvents|markDomainEventProcessed|recordDomainEventFailure|listFailedDomainEvents|replayFailedDomainEvent|findBookingByRequest|quoteBooking|commitBooking)\s*\(/.test(source)
  ) {
    violations.push(
      `${relative(projectRoot, path)} delegates application-port operations: expose explicit stores from the composition root instead`,
    );
  }
  if (
    localPath.startsWith('adapters/sqlite/') &&
    localPath !== 'adapters/sqlite/unit-of-work.ts' &&
    /BEGIN IMMEDIATE|\bCOMMIT\b|\bROLLBACK\b/.test(source)
  ) {
    violations.push(
      `${relative(projectRoot, path)} controls transactions directly: SQLite transactions must use the shared unit of work`,
    );
  }
  for (const specifier of importsFor(path)) {
    if (localPath.startsWith('application/')) {
      if (
        specifier.startsWith('node:') ||
        /(?:^|\/)adapters(?:\/|$)/.test(specifier) ||
        /(?:^|\/)bootstrap(?:\/|$)/.test(specifier) ||
        /(?:^|\/)(?:config|database|server)(?:\.ts)?$/.test(specifier)
      ) {
        reject(path, specifier, 'application code may depend only on contracts, ports, domain code, and shared data types');
      }
    }

    if (localPath.startsWith('domain/') && (
      specifier.startsWith('node:') ||
      /(?:^|\/)(?:adapters|application|bootstrap)(?:\/|$)/.test(specifier) ||
      /(?:^|\/)(?:config|database|server)(?:\.ts)?$/.test(specifier)
    )) {
      reject(path, specifier, 'domain code may depend only on other domain modules and shared data types');
    }

    if (localPath.startsWith('adapters/')) {
      if (/(?:^|\/)(?:bootstrap|config|database|server)(?:\.ts)?$/.test(specifier)) {
        reject(path, specifier, 'adapters receive configuration and contracts through their constructors or factories');
      }
    }

    if (
      localPath === 'database.ts' &&
      /(?:^|\/)(?:adapters|bootstrap|config|server)(?:\/|\.ts|$)/.test(specifier) &&
      !specifier.startsWith('./adapters/sqlite/')
    ) {
      reject(path, specifier, 'the persistence adapter may not construct or import other infrastructure adapters');
    }

    if (localPath === 'server.ts' && /(?:^|\/)(?:adapters|config|database)(?:\/|\.ts|$)/.test(specifier)) {
      reject(path, specifier, 'the HTTP adapter must receive concrete dependencies from the composition root');
    }
  }
}

for (const path of sourceFiles(clientRoot)) {
  const localPath = relative(clientRoot, path);
  for (const specifier of importsFor(path)) {
    if (
      localPath.startsWith('application/') &&
      (
        specifier === 'react' ||
        specifier === 'react-native' ||
        specifier.startsWith('expo') ||
        specifier.includes('/features/') ||
        specifier.includes('/services/') ||
        specifier.includes('/bootstrap/')
      )
    ) {
      reject(path, specifier, 'client application controllers may depend only on contracts and shared data types');
    }

    if (
      (localPath.startsWith('app/') || localPath.startsWith('features/')) &&
      (specifier === '@supabase/supabase-js' || specifier.includes('/services/supabase'))
    ) {
      reject(path, specifier, 'screens and feature state must use an application gateway instead of the Supabase SDK directly');
    }

    if (
      specifier === '@supabase/supabase-js' &&
      localPath !== 'services/supabase.ts' &&
      !localPath.startsWith('adapters/supabase/')
    ) {
      reject(path, specifier, 'the Supabase SDK belongs only in the Supabase infrastructure adapter');
    }

    if (
      localPath === 'features/auth/client-auth-screens.tsx' &&
      specifier.includes('client-auth-service')
    ) {
      reject(path, specifier, 'authentication screens must use the injected application gateway');
    }

    if (
      localPath === 'features/auth/session-context.tsx' &&
      (specifier.includes('session-store') || specifier.includes('/services/api-client'))
    ) {
      reject(path, specifier, 'the React session adapter must delegate orchestration to the session controller');
    }

    if (
      localPath === 'features/booking/booking-context.tsx' &&
      (specifier.includes('booking-draft-store') || specifier.includes('booking-request-id-generator'))
    ) {
      reject(path, specifier, 'the React booking adapter must delegate orchestration to the booking-draft controller');
    }

    if (
      localPath === 'features/client/account/client-account-context.tsx' &&
      (
        specifier.includes('client-account-store') ||
        specifier.includes('client-data-service') ||
        specifier.includes('/services/api-client') ||
        specifier.includes('/features/booking/data')
      )
    ) {
      reject(path, specifier, 'the React account adapter must delegate orchestration to the client-account controller');
    }

    if (
      localPath === 'features/discovery/discovery-context.tsx' &&
      (
        specifier.includes('discovery-service') ||
        specifier.includes('/services/api-client') ||
        specifier.includes('/features/discovery/data') ||
        specifier.includes('/features/booking/data')
      )
    ) {
      reject(path, specifier, 'the React discovery adapter must delegate orchestration to the discovery controller');
    }

    if (
      localPath === 'features/client/client-data-context.tsx' &&
      (
        specifier.includes('booking-service') ||
        specifier.includes('client-data-service') ||
        specifier.includes('/services/api-client')
      )
    ) {
      reject(path, specifier, 'the React client-data adapter must delegate orchestration to the client-data controller');
    }

    if (
      localPath === 'features/professional/professional-data-context.tsx' &&
      (
        specifier.includes('professional-dashboard-service') ||
        specifier.includes('/services/api-client')
      )
    ) {
      reject(path, specifier, 'the React professional-data adapter must delegate orchestration to the professional-data controller');
    }

    if (
      localPath === 'features/professional/registration/professional-registration-context.tsx' &&
      (
        specifier.includes('professional-registration-store') ||
        specifier.includes('professional-registration-service') ||
        specifier.includes('/services/api-client')
      )
    ) {
      reject(path, specifier, 'the React registration adapter must delegate orchestration to the professional-registration controller');
    }

    if (
      localPath === 'features/professional/documents/professional-document-context.tsx' &&
      (
        specifier.startsWith('expo') ||
        specifier.includes('/services/supabase') ||
        specifier.includes('/adapters/supabase')
      )
    ) {
      reject(path, specifier, 'the React document adapter must delegate picker, storage, and repository policy to the professional-document controller');
    }

    if (
      localPath === 'features/admin/documents/admin-document-context.tsx' &&
      (
        specifier.startsWith('expo') ||
        specifier.includes('/services/supabase') ||
        specifier.includes('/adapters/supabase')
      )
    ) {
      reject(path, specifier, 'the administrator document context must delegate preview and review policy to its controller');
    }

    if (
      localPath === 'localization/client-language-context.tsx' &&
      (
        specifier === 'expo-localization' ||
        specifier === 'expo-secure-store' ||
        specifier === 'react-native'
      )
    ) {
      reject(path, specifier, 'the React language adapter must delegate device and storage policy to the language controller');
    }
  }

  if (
    localPath === 'features/booking/booking-context.tsx' &&
    /Date\.now|Math\.random|(?:read|write|delete)BookingDraft/.test(readFileSync(path, 'utf8'))
  ) {
    violations.push(
      `${relative(projectRoot, path)} owns booking persistence or ID generation: delegate to the booking-draft controller`,
    );
  }
  if (
    localPath === 'features/client/account/client-account-context.tsx' &&
    /Date\.now|apiRequest|(?:read|write|delete)ClientAccount/.test(readFileSync(path, 'utf8'))
  ) {
    violations.push(
      `${relative(projectRoot, path)} owns account persistence or infrastructure policy: delegate to the client-account controller`,
    );
  }
  if (
    localPath === 'features/discovery/discovery-context.tsx' &&
    /ApiProfessionalSummary|durationLabel|apiBaseUrl|bookingTimeSlots/.test(readFileSync(path, 'utf8'))
  ) {
    violations.push(
      `${relative(projectRoot, path)} owns catalog mapping or fallback policy: delegate to the discovery controller`,
    );
  }
  if (
    localPath === 'features/client/client-data-context.tsx' &&
    /setInterval|ApiBooking|bookingFromApi|toLocaleDateString/.test(readFileSync(path, 'utf8'))
  ) {
    violations.push(
      `${relative(projectRoot, path)} owns client-data polling or projection policy: delegate to the client-data controller`,
    );
  }
  if (
    localPath === 'features/professional/professional-data-context.tsx' &&
    /setInterval|setTimeout|ApiProfessional|jobFromApi|toLocaleDateString/.test(readFileSync(path, 'utf8'))
  ) {
    violations.push(
      `${relative(projectRoot, path)} owns professional-data polling or projection policy: delegate to the professional-data controller`,
    );
  }
  if (
    localPath === 'features/professional/registration/professional-registration-context.tsx' &&
    /Date\.now|(?:read|write)ProfessionalRegistration|draftFromApplication|faydaFin:\s*''/.test(readFileSync(path, 'utf8'))
  ) {
    violations.push(
      `${relative(projectRoot, path)} owns registration persistence, identity sanitization, or ID policy: delegate to the professional-registration controller`,
    );
  }
  if (
    localPath === 'features/professional/documents/professional-document-context.tsx' &&
    /DocumentPicker|FileSystem|\.storage\.|\.from\(['"]professional_documents/.test(readFileSync(path, 'utf8'))
  ) {
    violations.push(
      `${relative(projectRoot, path)} owns picker or Supabase policy: delegate to the professional-document controller`,
    );
  }
  if (
    localPath === 'features/admin/documents/admin-document-context.tsx' &&
    /createSignedUrl|\.rpc\(|WebBrowser|window\.open/.test(readFileSync(path, 'utf8'))
  ) {
    violations.push(
      `${relative(projectRoot, path)} owns private-preview or review infrastructure: delegate to the administrator document controller`,
    );
  }
  if (
    localPath === 'localization/client-language-context.tsx' &&
    /getLocales|SecureStore|localStorage|Platform\.OS|STORAGE_KEY/.test(readFileSync(path, 'utf8'))
  ) {
    violations.push(
      `${relative(projectRoot, path)} owns language detection or persistence policy: delegate to the language controller`,
    );
  }
}

if (violations.length > 0) {
  console.error('Architecture boundary violations:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log('Architecture dependency boundaries passed.');
}
