import { deviceFactories, KEY_RING_APP_NAME } from "./lkrp.ts";
import type { Device } from "./lkrp.ts";

/**
 * A Key Ring device backed by Speculos, for the operations the protocol roots
 * in hardware: creating the ring, and ring revocation.
 *
 * Read the caveat before planning around this. Speculos emulates the device but
 * does not ship the applications that run on it. `createSpeculosDevice` takes a
 * `coinapps` directory and loads `<model>/<firmware>/LedgerSync/app_<v>.elf`
 * from it — see `conventionalAppSubpath` in
 * `@ledgerhq/speculos-transport/lib/index.js:147`. That ELF is the Ledger Sync
 * application build. It is not on npm, not in the Speculos image, and not in
 * any public artifact we could find, and Ledger's own test helper says as much
 * in a comment: `coinapps` is "completed by e2e script"
 * (`ledger-key-ring-protocol/tests/test-helpers/recordTrustchainSdkTests.ts`).
 *
 * So this path is wired and it is real, and it needs one file we cannot
 * distribute. Point SUBFLOOR_SPECULOS_COINAPPS at a directory holding it and
 * everything here runs with no physical device. Without it, the hardware-gated
 * operations need a physical device, and the tests that would use this are
 * skipped rather than faked.
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

export async function openSpeculosDevice(options: SpeculosOptions): Promise<SpeculosSession> {
  // The websocket transport keeps us off the Device Management Kit branch of
  // createSpeculosDevice, which reaches for @ledgerhq/live-dmk-speculos — a
  // package Ledger has never published. See agent/vendor/live-dmk-speculos.
  process.env.SPECULOS_USE_WEBSOCKET = process.env.SPECULOS_USE_WEBSOCKET ?? "1";

  const speculos = await import("@ledgerhq/speculos-transport");
  const created = await speculos.createSpeculosDevice({
    model: (options.model ?? "nanoSP") as never,
    firmware: options.firmware ?? "1.1.2",
    appName: KEY_RING_APP_NAME,
    appVersion: options.appVersion ?? "1.0.1",
    seed: options.seed,
    coinapps: options.coinapps,
  });

  // Speculos has no buttons to press by itself. Approve the prompts the Key Ring
  // flow raises, the same list Ledger drives in its own Key Ring e2e tests.
  const subscription = created.transport.automationEvents.subscribe((event: { text?: unknown }) => {
    const text = String(event.text ?? "").trim();
    if (APPROVE_ON.includes(text)) void created.transport.button("both");
    else if (NEXT_ON.includes(text)) void created.transport.button("right");
  });

  return {
    device: deviceFactories.apdu(created.transport) as Device,
    async close() {
      subscription.unsubscribe();
      await speculos.releaseSpeculosDevice(created.id);
    },
  };
}

const NEXT_ON = ["Log in to", "Ledger Sync", "Identify with", "Review", "Confirm"];
const APPROVE_ON = ["Approve", "Yes", "Confirm", "Log in", "Allow"];
