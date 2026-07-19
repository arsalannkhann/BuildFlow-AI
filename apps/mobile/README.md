# @buildflow/mobile

Android-first Expo (SDK 54) field app for BuildFlow AI: record a spoken site
update, attach photos, and submit — with a durable offline-first sync queue.
The capture path never requires connectivity; work is committed to SQLite
first and uploaded in the background through the idempotent `/v1` sync
protocol (`create_manifest` → `upload_attachment` × N → `finalize`).

## Running against the local web API

1. Start the web app (serves the `/api/v1` routes) from the repo root:

   ```sh
   pnpm install
   pnpm dev            # Next.js on http://localhost:3000
   ```

2. Start the mobile app from this directory:

   ```sh
   pnpm --filter @buildflow/mobile start      # or: cd apps/mobile && pnpm start
   pnpm --filter @buildflow/mobile android    # opens the Android emulator
   ```

3. Point the app at the API with `EXPO_PUBLIC_API_URL`:

   - **Android emulator** — no configuration needed. The default base URL is
     `http://10.0.2.2:3000`, the emulator's alias for the workstation's
     `localhost`.
   - **Physical device** (same Wi-Fi as the workstation):

     ```sh
     EXPO_PUBLIC_API_URL=http://<your-workstation-lan-ip>:3000 pnpm start
     ```

   - **iOS simulator**: `EXPO_PUBLIC_API_URL=http://localhost:3000 pnpm start`

   `EXPO_PUBLIC_*` variables are inlined at bundle time — restart `expo start`
   after changing them.

Sign in with a user seeded by the web app's dev boot (see the root README),
e.g. the demo engineer account.

## Project layout

- `app/` — expo-router screens: `sign-in`, `(tabs)/index` (Today),
  `(tabs)/reports`, `(tabs)/account`, `capture` (modal).
- `src/lib/sync/` — the offline sync engine. **Pure TypeScript**; every side
  effect (SQLite, files, HTTP, clock, crypto, session token) is injected via
  the adapter interfaces in `adapters.ts`. Expo-backed implementations live in
  `expo-adapters.ts` and are only imported by the app runtime.
- `src/lib/sync/*.test.ts` — node-based vitest suite run by the **root**
  `vitest` config (`pnpm vitest run apps/mobile/src/lib/sync` from the repo
  root). Tests use the in-memory fakes in `fakes.ts` and never import
  react-native or expo modules.
- `src/lib/i18n.ts` — English + Hindi dictionaries; language persists in the
  local SQLite settings table.
- `src/state/` — React context + reducers (services, sync, session). No
  state-management library.
- `src/ui/` — design tokens and primitives per `design.md` §10–§13.

## Type checking

```sh
pnpm --filter @buildflow/mobile typecheck
```

The tsconfig extends `expo/tsconfig.base` (not the repo's
`tsconfig.base.json`) because React Native needs its own lib/JSX settings;
`strict` is enabled.

## Notes

- Sync commands are drained strictly in insertion order; 5xx/network failures
  back off exponentially and resume at the same command, 4xx failures park the
  affected report until the user retries, and a 401 pauses the queue until
  re-authentication.
- "Clear synced local data" (Account) deletes only drafts whose finalize
  command completed, plus their on-device files. Server data is untouched.
- Running Metro in a pnpm monorepo may additionally require
  `node-linker=hoisted` in a root `.npmrc` depending on your setup; type
  checking and the sync test suite do not.
