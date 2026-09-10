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

  /*
   * Move the modal inside whatever sheet asked for it.
   *
   * AppKit renders <w3m-modal> into the body. That is fine on the board and useless inside a sheet:
   * `showModal()` puts a <dialog> in the top layer *and* makes everything outside its subtree
   * inert, so the wallet modal was painted underneath the sheet and — once it had been raised over
   * it with the popover API — painted on top but unclickable, because hit-testing and focus were
   * still going to the dialog. Measured, not assumed: promoted into the top layer the button
   * reported `focusable: false` and `elementFromPoint` at the centre of the modal returned DIALOG.
   *
   * Inertness follows the tree, not the paint order, so the only fix is to be in the tree. Inside
   * the dialog its own `z-index` puts it over the sheet's content, and `position: fixed` still
   * resolves against the viewport because no sheet creates a containing block — no transform, no
   * filter, no `contain`. The dialog's `overflow: hidden` does not clip it for the same reason.
   */
  modal.subscribeState((state) => (state.open ? adopt() : release()));

  started = { modal, config: adapter.wagmiConfig };
  return started;
}

/** Where the modal lives when no sheet has taken it — AppKit's own parent, whatever that is. */
let home: HTMLElement | null = null;
/** Set while the modal is inside a sheet, so a sheet closing under it does not take it away. */
let letGo: (() => void) | null = null;

/** Created lazily, so the first open can be a frame or two ahead of the element existing. */
function findModal(): HTMLElement | null {
  return document.querySelector('w3m-modal');
}

function adopt(tries = 12) {
  const el = findModal();
  if (!el) {
    // Out of frames rather than out of luck: the modal still opens, it just opens in the body.
    if (tries > 0) requestAnimationFrame(() => adopt(tries - 1));
    return;
  }
  // The last open one is the innermost: a sheet can open a sheet, and the newest is on top.
  const host = [...document.querySelectorAll('dialog[open]')].pop();
  if (!(host instanceof HTMLElement) || host.contains(el)) return;

  home ??= el.parentElement;
  host.appendChild(el);

  /*
   * If the sheet closes while the modal is inside it, React takes the dialog out of the document
   * and the modal goes with it — AppKit would be left holding an element that is nowhere. Sent
   * home first, so the worst case is a modal in the body rather than a modal that has stopped
   * existing.
   */
  const back = () => release();
  host.addEventListener('close', back, { once: true });
  letGo = () => host.removeEventListener('close', back);
}

function release() {
  letGo?.();
  letGo = null;
  const el = findModal();
  if (el && home && el.parentElement !== home) home.appendChild(el);
}
