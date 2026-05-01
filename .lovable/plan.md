## Goal

Remove the Puter sign-in popup that appears before image/video generation. Users should be auto-signed-in to Puter silently the first time, and stay signed in afterwards.

## How (per Puter docs)

`puter.auth.signIn({ attempt_temp_user_creation: true })` silently provisions a temporary Puter user without opening a popup. Puter caches the session in localStorage, so on subsequent visits `isSignedIn()` is already true and no popup or auth call is needed. The temp account can later be upgraded by the user if they ever want to — but for our use case it just works invisibly.

This is the standard "user-pays model" onboarding shortcut Puter recommends for frictionless apps.

## Changes

### 1. `src/lib/externalModels.ts` — `ensurePuterSignedIn`
- Always call `auth.signIn({ attempt_temp_user_creation: true })` when not already signed in (drop the `interactive` flag — temp-user creation does not require a popup or a user gesture).
- Keep the 60s timeout as a safety net.
- Remove the "tap send again" error message; failures now mean a real network/provider problem.

### 2. `src/hooks/useChat.ts` — pre-flight auth block
- Remove the `await ensurePuterSignedIn({ interactive: true })` block that runs before sending. Auth now happens lazily inside `generatePuterImage` / `generateCrossiVideo` with no popup, so we no longer need a user-gesture-bound pre-flight.
- Keep `removeLastAssistantIfCreated` cleanup for the (rare) case where silent auth still fails.

### 3. `src/pages/Index.tsx`
- No structural change needed; the `selectedModelId` plumbing stays. Just verify nothing references the removed `interactive` flow.

### 4. Optional: warm Puter on app load
- In `src/main.tsx` or `src/App.tsx`, fire-and-forget `ensurePuterSignedIn()` once after Puter.js loads, so the first generation has zero latency. Wrap in a try/catch and ignore failures (will retry lazily on first use).

## Result

- First-ever visit: Puter silently creates a temp account in the background — no popup, no redirect to `puter.com/?request_auth=true`.
- Repeat visits: `isSignedIn()` returns true immediately from localStorage; generation starts instantly.
- Mobile: same behaviour, no popup blocker issues.
- If the user ever clears storage, a new silent temp account is created next time.

## Notes

- This is fully within Puter's intended usage; quotas/billing still apply per temp user under the user-pays model.
- No DB or edge-function changes required.
