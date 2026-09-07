/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'simulated' runs the dev feed in a deployed build. Anything else leaves the page on fixtures. */
  readonly VITE_DATA_SOURCE?: 'simulated' | 'fixtures';
  /** Reown AppKit project id. Public by design — it identifies the app, it authorises nothing. */
  readonly VITE_REOWN_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
