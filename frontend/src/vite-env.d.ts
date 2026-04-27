/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LEGACY_APP_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
