/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'simulated' runs the dev feed in a deployed build. Anything else leaves the page on fixtures. */
  readonly VITE_DATA_SOURCE?: 'simulated' | 'fixtures';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
