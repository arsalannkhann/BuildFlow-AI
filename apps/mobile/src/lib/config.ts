// Public app configuration. EXPO_PUBLIC_* variables are statically inlined by
// Expo's bundler, so the literal `process.env.EXPO_PUBLIC_API_URL` expression
// below must stay as-is.

declare const process: {
  env: { EXPO_PUBLIC_API_URL?: string };
};

/**
 * Base URL of the BuildFlow web API. Default targets the Android emulator's
 * host loopback (`pnpm dev` on the workstation → http://10.0.2.2:3000).
 * Physical devices set EXPO_PUBLIC_API_URL to the workstation's LAN address.
 */
export const API_BASE_URL: string = (
  process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3000"
).replace(/\/+$/, "");

export const SESSION_TOKEN_KEY = "buildflow.session.token";
export const ME_CACHE_SETTING_KEY = "session.me";
export const SELECTED_PROJECT_SETTING_KEY = "session.selectedProject";
