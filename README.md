# Konjo

Konjo is an Expo SDK 57 marketplace for booking verified at-home beauty and wellness professionals. This workspace contains the client, professional, and administrator surfaces, a local Node/SQLite development API, and the production Supabase Edge Functions/Postgres/Storage backend.

## Local development

1. Install the locked dependencies.

   ```bash
   npm ci
   ```

2. Copy `.env.example` to `.env` and supply the values needed for the mode you are running.

3. Start the API and Expo app in separate terminals.

   ```bash
   npm run backend:dev
   npm start
   ```

Expo can open the project in a development build, Android emulator, iOS simulator, or web browser. Provider mode requires the server-only Supabase secret described in [SUPABASE_SETUP.md](./SUPABASE_SETUP.md); never place that secret in an `EXPO_PUBLIC_` variable.

The local API also serves the public Konjo website at `http://127.0.0.1:4000`. In provider mode, website contact messages and professional applications are stored in Supabase Postgres and attachments are stored in the private `website-professional-applications` bucket. Optional email delivery still uses the server-only Resend settings in `.env.example`.

## Quality gates

Run the same gates used by CI:

```bash
npx expo install --check
npm run lint
npm run typecheck
npm run backend:check
npm run backend:architecture
npm run test:contracts
npm run backend:test
npm run web:export
```

The contract runner discovers every package script ending in `-contracts`, so new contract suites enter CI automatically. The web export is written to the ignored `dist/` directory and uploaded as a short-lived CI artifact.

## Project references

- [Implementation roadmap](./PROJECT_ROADMAP.md)
- [Product-brief audit](./PRODUCT_BRIEF_AUDIT.md)
- [Supabase setup](./SUPABASE_SETUP.md)
- [Backend/API guide](./backend/README.md)
- [Architecture decision](./docs/architecture/ADR-001-modular-event-driven-architecture.md)
- [Account deletion runbook](./docs/operations/ACCOUNT_DELETION.md)
- [Incident response runbook](./docs/operations/INCIDENT_RESPONSE.md)
- [Production launch checklist](./docs/operations/PRODUCTION_LAUNCH_CHECKLIST.md)
- [Supabase production backend](./docs/operations/SUPABASE_PRODUCTION_BACKEND.md)
