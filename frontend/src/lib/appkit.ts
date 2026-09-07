import { createAppKit } from '@reown/appkit';
import { base } from '@reown/appkit/networks';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import type { Config } from '@wagmi/core';

/**
 * Reown AppKit, behind a dynamic import. Nothing in this module runs until someone presses
 * connect: AppKit and its connectors are ~450 kB gzipped, and the public page has no wallet on it
 * at all — a stranger reading the tape should not download a wallet modal to do it.
 *
 * One network. This vault trades one pair on Base, and a chain switcher is a decision the owner
 * should never be asked to make here.
 */
export const projectId = import.meta.env.VITE_REOWN_PROJECT_ID ?? '';

let started: { modal: ReturnType<typeof createAppKit>; config: Config } | undefined;

/** Idempotent: AppKit is a singleton, and connect can be pressed more than once. */
export function startAppKit() {
  if (started) return started;

  const adapter = new WagmiAdapter({ networks: [base], projectId, ssr: false });

  const modal = createAppKit({
    adapters: [adapter],
    networks: [base],
    projectId,
    metadata: {
      name: 'SUBFLOOR',
      description: 'An agent trades your whole portfolio. The worst price is the one you set.',
      url: globalThis.location?.origin ?? 'https://subfloor.vercel.app',
      icons: [],
    },
    // No analytics, no email or social sign-in: the owner of this vault arrives with a wallet.
    features: { analytics: false, email: false, socials: false },
  });

  started = { modal, config: adapter.wagmiConfig };
  return started;
}
