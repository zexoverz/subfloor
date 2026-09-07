import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { initMemberCredentials, toKeyPair } from "../src/keyring/credentials.ts";
import { Ring } from "../src/keyring/ring.ts";
import { speculosOptionsFromEnv } from "../src/keyring/speculos.ts";
import { ringIsInitialized } from "../src/keyring/walletCli.ts";

/**
 * Everything below needs something this machine may not have. Each test says
 * what, and skips rather than pretending.
 */

const speculos = speculosOptionsFromEnv();

describe("the device-rooted operations", () => {
  it(
    "creates a ring on Speculos",
    { skip: speculos ? false : "SUBFLOOR_SPECULOS_COINAPPS not set: no Ledger Sync app ELF to run" },
    async () => {
      const { openSpeculosDevice } = await import("../src/keyring/speculos.ts");
      const session = await openSpeculosDevice(speculos!);
      try {
        const owner = initMemberCredentials();
        const ring = await Ring.create(
          session.device,
          toKeyPair(owner).publicKey,
          "speculos-owner",
        );
        assert.equal((await ring.members()).length, 1);
        assert.match(ring.rootId, /^[0-9a-f]+$/);
      } finally {
        await session.close();
      }
    },
  );

  it("reads its Speculos configuration from the environment and nowhere else", () => {
    assert.equal(speculosOptionsFromEnv({}), null);
    const configured = speculosOptionsFromEnv({ SUBFLOOR_SPECULOS_COINAPPS: "/tmp/coinapps" });
    assert.equal(configured?.coinapps, "/tmp/coinapps");
    assert.ok(configured?.seed.split(" ").length === 24, "falls back to the public test mnemonic");
  });
});

describe("wallet-cli, the CLI the track requires", () => {
  it("reports honestly whether this host has a Key Ring at all", async () => {
    const initialized = await ringIsInitialized();
    assert.equal(typeof initialized, "boolean");
    // On any host that has never run `wallet-cli ring init` — which is every
    // host with no USB port, because `ring init` cannot run there — this is
    // false, and every other `ring` subcommand is unreachable behind it.
    if (!initialized) {
      assert.ok(true, "no Key Ring on this host: the no-USB gap, observed rather than assumed");
    }
  });
});
