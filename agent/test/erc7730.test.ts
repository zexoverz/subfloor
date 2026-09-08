import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { keccak256, toHex } from "viem";

/// The clear-signing descriptors, checked against the contracts they describe.
///
/// ERC-7730 keys each format by the **exact** EIP-712 type string. A struct that gains a field, or
/// renames one, produces a different type hash and the descriptor silently stops matching — the
/// device falls back to showing a blob, which is precisely the state the descriptors exist to
/// prevent. Nothing else in the build would notice.
///
/// So this reads the descriptor and the Solidity, and asserts they hash to the same thing.

const REGISTRY = JSON.parse(readFileSync("../contracts/erc7730/eip712-FloorRegistry.json", "utf8"));
const VAULT = JSON.parse(readFileSync("../contracts/erc7730/eip712-AquaGuardVault.json", "utf8"));

const REGISTRY_SOL = readFileSync("../contracts/src/subfloor/FloorRegistry.sol", "utf8");
const VAULT_SOL = readFileSync("../contracts/src/subfloor/AquaGuardVault.sol", "utf8");

/// Every `keccak256("...")` in a Solidity file, which is where typehashes live.
function typeStringsIn(sol: string): string[] {
  return [...sol.matchAll(/keccak256\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]);
}

function formatsOf(descriptor: { display: { formats: Record<string, unknown> } }): string[] {
  return Object.keys(descriptor.display.formats);
}

describe("the descriptors describe the contracts that exist", () => {
  test("every FloorRegistry format matches a typehash in the source", () => {
    const declared = typeStringsIn(REGISTRY_SOL);
    for (const f of formatsOf(REGISTRY)) {
      assert.ok(
        declared.includes(f),
        `descriptor has a format the contract does not declare:\n  ${f}\ncontract declares:\n  ${declared.join("\n  ")}`,
      );
    }
  });

  test("every AquaGuardVault format matches a typehash in the source", () => {
    const declared = typeStringsIn(VAULT_SOL);
    for (const f of formatsOf(VAULT)) {
      assert.ok(declared.includes(f), `descriptor has a format the contract does not declare: ${f}`);
    }
  });

  test("the dangerous action is covered, because it is the only one the device exists for", () => {
    const formats = formatsOf(REGISTRY);
    assert.ok(formats.some((f) => f.startsWith("FloorLowering(")), "no descriptor for lowering a floor");
    assert.ok(formats.some((f) => f.startsWith("GuardianRotation(")), "no descriptor for rotating the guardian");
  });

  test("the mandate is covered, since it is the other thing the device signs", () => {
    assert.ok(formatsOf(VAULT).some((f) => f.startsWith("Mandate(")), "no descriptor for the mandate");
  });

  test("the type hashes agree, not just the strings", () => {
    // The string comparison above is the real check; this one states why it is sufficient.
    const f = formatsOf(REGISTRY).find((x) => x.startsWith("FloorLowering("))!;
    assert.equal(
      keccak256(toHex(f)),
      keccak256(toHex("FloorLowering(address recipient,address base,address quote,uint16 maxAdverseBps,uint256 absoluteRate,uint256 nonce,uint256 deadline)")),
    );
  });
});

describe("the descriptors say what a signer needs to decide", () => {
  test("a floor lowering shows who it protects, which pair, and both components", () => {
    const fields = (REGISTRY.display.formats as any)[
      formatsOf(REGISTRY).find((f) => f.startsWith("FloorLowering("))!
    ].fields.map((x: { path: string }) => x.path);

    // Without the pair, "weaken a floor" on a device is unanswerable: the holder cannot tell which
    // of their positions is being exposed.
    for (const p of ["recipient", "base", "quote", "maxAdverseBps", "absoluteRate", "deadline"]) {
      assert.ok(fields.includes(p), `a signer cannot decide without ${p}`);
    }
  });

  test("a mandate shows the agent, the caps and the expiry", () => {
    const fields = (VAULT.display.formats as any)[
      formatsOf(VAULT).find((f) => f.startsWith("Mandate("))!
    ].fields.map((x: { path: string }) => x.path);

    for (const p of ["delegate", "app", "tokens.[]", "maxAmounts.[]", "expiry"]) {
      assert.ok(fields.includes(p), `a signer cannot decide without ${p}`);
    }
  });

  test("the deployment addresses are the ones on chain", () => {
    assert.equal(
      REGISTRY.context.eip712.deployments[0].address.toLowerCase(),
      "0x47c7abb1ffbf37ed4bcfcb20f6648b5c0cc86123",
    );
    assert.equal(
      VAULT.context.eip712.deployments[0].address.toLowerCase(),
      "0xaf6b337440ffea63c47f077eee2663987aeec33f",
    );
    assert.equal(REGISTRY.context.eip712.domain.name, "SUBFLOOR FloorRegistry");
    assert.equal(VAULT.context.eip712.domain.name, "SUBFLOOR AquaGuardVault");
  });
});
