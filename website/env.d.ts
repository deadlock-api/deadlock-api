/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_ASSETS_BASE_URL: string;
  readonly VITE_AI_ASSISTANT_API_URL: string;
  readonly VITE_TURNSTILE_SITE_KEY: string;
  readonly VITE_PUBLIC_POSTHOG_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
