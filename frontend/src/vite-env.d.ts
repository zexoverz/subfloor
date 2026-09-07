/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'simulated' runs the dev feed in a deployed build. Anything else leaves the page on fixtures. */
  readonly VITE_DATA_SOURCE?: 'simulated' | 'fixtures';
  /** Reown AppKit project id. Public by design — it identifies the app, it authorises nothing. */
  readonly VITE_REOWN_PROJECT_ID?: string;
  /** 'mock' walks the whole owner flow with nothing deployed. Says so on screen. */
  readonly VITE_CHAIN_SOURCE?: 'mock' | 'chain';
  /** 'base' for mainnet; anything else means Base Sepolia, where the integration deployment lives. */
  readonly VITE_CHAIN?: 'base' | 'baseSepolia';
  /** The Graph endpoint. Absent, the app stays on fixtures and says so. */
  readonly VITE_SUBGRAPH_URL?: string;
  /** Deployment. Empty until the contracts are broadcast; every screen renders without them. */
  readonly VITE_FLOOR_REGISTRY?: `0x${string}`;
  readonly VITE_FLOOR_ROUTER?: `0x${string}`;
  readonly VITE_VAULT?: `0x${string}`;
  /** VaultFactory (#132). Absent, the board reads our vault only and offers no way to deploy one. */
  readonly VITE_VAULT_FACTORY?: `0x${string}`;
  readonly VITE_AQUA?: `0x${string}`;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
