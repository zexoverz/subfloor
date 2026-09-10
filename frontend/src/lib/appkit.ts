import { createAppKit } from '@reown/appkit';
import { base, baseSepolia } from '@reown/appkit/networks';
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

  /*
   * Fail closed, and say which build is at fault.
   *
   * Vite bakes this in, so an id missing here is missing from a file the browser already
   * downloaded — there is no runtime to recover in. AppKit accepts the empty string and builds a
   * modal that can never reach the relay, so the button opened nothing and reported nothing, which
   * is exactly what shipped: the Docker build passed no VITE_ vars at all and nobody found out
   * until someone pressed connect in production.
   *
   * A thrown error reaches the connect handler's catch and puts a sentence on screen. A wrong build
   * that says so is a five-minute fix; a wrong build that stays quiet is the afternoon this cost.
   */
  if (!projectId) {
    throw new Error('this build has no wallet project id — VITE_REOWN_PROJECT_ID was not set when it was built');
  }

  // One network, and it is the one the contracts are on. Offering a switcher here would invite an
  // owner to connect to a chain where their vault does not exist.
  const network = import.meta.env.VITE_CHAIN === 'base' ? base : baseSepolia;
  const adapter = new WagmiAdapter({ networks: [network], projectId, ssr: false });

  const modal = createAppKit({
    adapters: [adapter],
    networks: [network],
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
