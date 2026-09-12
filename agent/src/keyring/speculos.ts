import { createRequire } from "node:module";
import { deviceFactories, KEY_RING_APP_NAME } from "./lkrp.ts";
import type { Device } from "./lkrp.ts";

/**
 * A Key Ring device backed by Speculos, for the operations the protocol roots
 * in hardware: creating the ring, and ring revocation. Runs with no physical
 * device, so a headless host (a VPS, a CI runner, the agent box) can perform the
 * one device-gated step — the flagship "no USB" ask of the Ledger track.
 *
 * The ELF this loads is the Ledger Sync application. It ships in no public
 * artifact, but its source is public and current — `github.com/LedgerHQ/app-ledger-sync`
 * — and builds in one command with `ledger-app-builder-lite`:
 *
 *   git clone --depth 1 https://github.com/LedgerHQ/app-ledger-sync.git
 *   docker run --rm -v "$PWD/app-ledger-sync":/app \
 *     ghcr.io/ledgerhq/ledger-app-builder/ledger-app-builder-lite:latest \
 *     bash -c 'make -j BOLOS_SDK=$NANOSP_SDK'          # => build/nanos2/bin/app.elf
 *
 * Place it where `createSpeculosDevice`'s `conventionalAppSubpath` expects it —
 * `<coinapps>/nanos+/<firmware>/LedgerSync/app_<appVersion>.elf` — and point
 * SUBFLOOR_SPECULOS_COINAPPS at <coinapps>. `docs/key-ring.md` has the full
 * runbook. Without the ELF the hardware-gated operations need a physical device,
 * and the tests that would use this are skipped rather than faked.
 *
 * The transport wiring here is not the obvious one, and every deviation is load-
 * bearing (each was a dead end first — see `docs/key-ring.md` § DX feedback):
 *   - `SPECULOS_USE_WEBSOCKET` must be flipped through `@ledgerhq/live-env`'s
 *     `setEnv`, BEFORE the transport module loads. `getEnv` reads an internal
 *     store and ignores `process.env`, and the transport snapshots the websocket
 *     flag at module-load, so setting `process.env.SPECULOS_USE_WEBSOCKET` is a
 *     no-op and the code falls to the DMK branch → the unpublished
 *     `@ledgerhq/live-dmk-speculos`.
 *   - the package is loaded through its CommonJS `lib/` build via `createRequire`,
 *     not `await import(...)`: the ESM `import` condition resolves to `lib-es/`,
 *     whose files (and `@ledgerhq/live-env`) use extensionless imports Node's
 *     native ESM rejects — the same shim `lkrp.ts` and `usb.ts` already apply.
 *   - Speculos buttons take raw socket codes: `"LRlr"` (press+release both),
 *     `"Rr"` (right). The strings `"both"`/`"right"` are written straight to the
 *     socket and silently dropped, so no press ever registers.
 */
export type SpeculosOptions = {
  /** directory holding the Ledger Sync application ELF */
  coinapps: string;
  /** BIP39 mnemonic the emulator runs on */
  seed: string;
  model?: string;
  firmware?: string;
  appVersion?: string;
};

export type SpeculosSession = {
  device: Device;
  close(): Promise<void>;
};

export function speculosOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): SpeculosOptions | null {
  const coinapps = env.SUBFLOOR_SPECULOS_COINAPPS;
  if (!coinapps) return null;
  return {
    coinapps,
    seed: env.SUBFLOOR_SPECULOS_SEED ?? DEFAULT_SPECULOS_SEED,
    model: env.SUBFLOOR_SPECULOS_MODEL,
    firmware: env.SUBFLOOR_SPECULOS_FIRMWARE,
    appVersion: env.SUBFLOOR_SPECULOS_APP_VERSION,
  };
}

/**
 * Ledger's own published test mnemonic. It is public, it holds nothing, and it
 * is here so that nobody is tempted to put a real one in an env file.
 */
export const DEFAULT_SPECULOS_SEED =
  "glory promote mansion idle axis finger extra february uncover one trip resource lawn turtle enact monster seven myth punch hobby comfort wild raise skin";

const require = createRequire(import.meta.url);

export async function openSpeculosDevice(options: SpeculosOptions): Promise<SpeculosSession> {
  // Flip the websocket flag through live-env's own store, BEFORE the transport is
  // required (it snapshots the flag at module load). This keeps us off the DMK
  // branch of createSpeculosDevice, which reaches for the unpublished
  // @ledgerhq/live-dmk-speculos (see agent/vendor/live-dmk-speculos).
  const liveEnv = require("@ledgerhq/live-env/lib/index") as { setEnv(k: string, v: boolean): void };
  liveEnv.setEnv("SPECULOS_USE_WEBSOCKET", true);

  // CommonJS lib/ build, not the ESM lib-es/ the bare specifier resolves to.
  const speculos = require("@ledgerhq/speculos-transport/lib/index") as {
    createSpeculosDevice(opts: Record<string, unknown>): Promise<{ transport: SpeculosTransport; id: string }>;
    releaseSpeculosDevice(id: string): Promise<void>;
  };

  const created = await speculos.createSpeculosDevice({
    model: (options.model ?? "nanoSP") as never,
    firmware: options.firmware ?? "1.1.2",
    appName: KEY_RING_APP_NAME,
    appVersion: options.appVersion ?? "1.2.2",
    seed: options.seed,
    coinapps: options.coinapps,
  });

  // Speculos has no buttons to press by itself, so we drive the NBGL consent flow
  // over the automation event stream. The approach is screen-state driven, not
  // event-reactive, because reacting to every streamed line races the device onto
  // the reject option and returns 0x6985 (user denied):
  //   - A single pager presses right on a FIXED cadence, one page per tick. An info
  //     page emits several text events; pressing right once per event over-pages
  //     straight onto the reject option. The cadence decouples navigation from the
  //     event count and also dismisses the "any button to continue" info screens.
  //   - Confirm fires ONLY on an exact-case button label. The wrapped titles read
  //     "Turn on sync .." / "Remove from .." while the confirm buttons are exactly
  //     "Turn On sync" / "Remove" — a case-insensitive match would fire on the title
  //     before the choice page exists. On a confirm label the pager pauses so it
  //     cannot advance onto reject, focus settles, one press-both fires, then paging
  //     resumes to reach the next prompt (revoke = branch close + re-share issues
  //     two sequential approvals: "Remove" then "Turn On sync").
  let pageTimer: ReturnType<typeof setInterval> | null = null;
  let paused = false;
  const startPaging = () => {
    if (pageTimer) return;
    pageTimer = setInterval(() => { if (!paused) void created.transport.button("Rr"); }, CONSENT_PAGE_MS);
  };
  const subscription = created.transport.automationEvents.subscribe((event: { text?: unknown }) => {
    const text = String(event.text ?? "").trim();
    if (!text) return;
    startPaging(); // the pager runs continuously once the app is drawing
    if (CONFIRM_LABELS.has(text) && !paused) {
      paused = true;
      setTimeout(() => {
        void created.transport.button("LRlr");
        setTimeout(() => { paused = false; }, CONSENT_REARM_MS);
      }, CONSENT_SETTLE_MS);
    }
  });

  return {
    device: deviceFactories.apdu(created.transport as never) as Device,
    async close() {
      if (pageTimer) clearInterval(pageTimer);
      subscription.unsubscribe();
      await speculos.releaseSpeculosDevice(created.id);
    },
  };
}

type SpeculosTransport = {
  automationEvents: { subscribe(fn: (event: { text?: unknown }) => void): { unsubscribe(): void } };
  button(code: string): Promise<void> | void;
};

// Exact-case confirm button labels app-ledger-sync 1.2.x renders on Nano. These are
// the button captions, not the wrapped titles ("Turn on sync .." / "Remove from ..").
const CONFIRM_LABELS = new Set(["Turn On sync", "Remove"]);
const CONSENT_PAGE_MS = 700; // one right-press per tick: pages review screens, dismisses info screens
const CONSENT_SETTLE_MS = 350; // let focus settle on the confirm page before pressing both
const CONSENT_REARM_MS = 900; // after a confirm, resume paging to reach the next prompt
