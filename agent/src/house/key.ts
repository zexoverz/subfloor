import type { Hex } from "viem";

/// Where the house agent's key comes from.
///
/// The Ledger track pays for one property: the agent host holds ciphertext, not the delegate key.
/// So when the ring is configured the key arrives sealed. `SUBFLOOR_DELEGATE_SEALED` is a Key Ring
/// envelope, `SUBFLOOR_RING_BLOCKS` the ring it was sealed on, and the only thing that opens it is
/// this host's own member credential, generated here on first start at `SUBFLOOR_RING_MEMBER_PATH`
/// and never sent anywhere. The owner adds that identity to the ring from their own machine, with no
/// device, and seals the key against it (docs/key-ring.md).
///
/// Revocation is the reason for all of it. The owner revokes this host on the Ledger and re-seals;
/// after the next deploy this host holds an envelope it cannot open, and the agent watches instead of
/// trading. It fails closed: once a sealed key is configured, a plain key next to it is ignored,
/// because falling back to it would turn a ring revocation into a suggestion.
///
/// `SUBFLOOR_DELEGATE_KEY` alone still works, since it is how the agent ran before, and the log says
/// plainly that it is the key in the clear.

export interface FoundKey {
  key: Hex;
  source: "ring" | "plain";
}

const KEY_RE = /^0x[0-9a-fA-F]{64}$/;
const DEFAULT_MEMBER_PATH = "/data/ring-member.json";

export async function delegateKeyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  log: (line: string) => void = console.log,
): Promise<FoundKey | null> {
  const plain = env.SUBFLOOR_DELEGATE_KEY?.trim();
  const sealedRaw = env.SUBFLOOR_DELEGATE_SEALED?.trim();
  const memberPath = env.SUBFLOOR_RING_MEMBER_PATH?.trim();

  if (!sealedRaw && !memberPath) {
    if (!plain) return null;
    log("[key] SUBFLOOR_DELEGATE_KEY: the delegate key is in this host's environment in the clear; seal it with the Key Ring (docs/key-ring.md)");
    return checked(plain, "plain", log);
  }

  // Loaded only on this path, so an agent that never uses the ring never loads the Ledger packages.
  const { initMemberCredentials } = await import("../keyring/credentials.ts");
  const { readMemberCredentials, writeMemberCredentials } = await import("../keyring/store.ts");

  const path = memberPath || DEFAULT_MEMBER_PATH;
  let credentials: Awaited<ReturnType<typeof readMemberCredentials>>;
  try {
    credentials = await readMemberCredentials(path);
  } catch (e) {
    if (!/no member credentials/.test((e as Error).message)) {
      log(`[ring] the member credential at ${path} is unreadable: ${(e as Error).message}. Not trading.`);
      return null;
    }
    credentials = initMemberCredentials();
    await writeMemberCredentials(path, credentials);
    log(`[ring] generated this host's ring member identity at ${path}; the private half stays there`);
  }
  log(`[ring] this host is ring member ${credentials.pubkey}`);

  if (!sealedRaw) {
    log(
      `[ring] no sealed key yet. From the owner's machine: npm run keyring -- add-member --member <owner> --ring <ring> ` +
        `--id ${credentials.pubkey} --name agent-host, then seal the key and set SUBFLOOR_DELEGATE_SEALED and SUBFLOOR_RING_BLOCKS`,
    );
    if (!plain) return null;
    log("[key] until then, SUBFLOOR_DELEGATE_KEY: the delegate key in the clear");
    return checked(plain, "plain", log);
  }

  if (plain) {
    log("[key] ignoring SUBFLOOR_DELEGATE_KEY: a sealed key is configured, and falling back to a plain one would make a revocation a suggestion");
  }
  const blocksRaw = env.SUBFLOOR_RING_BLOCKS?.trim();
  if (!blocksRaw) {
    log("[ring] SUBFLOOR_DELEGATE_SEALED is set but SUBFLOOR_RING_BLOCKS is not, and the envelope cannot be opened without its ring. Not trading.");
    return null;
  }

  const { Ring } = await import("../keyring/ring.ts");
  // Typed as the module so the assertion below narrows: TypeScript will not narrow through a name
  // destructured out of a dynamic import.
  const secret: typeof import("../keyring/secret.ts") = await import("../keyring/secret.ts");
  try {
    const sealed: unknown = JSON.parse(sealedRaw);
    secret.assertSealedSecret(sealed);
    const ring = Ring.fromBlocks(JSON.parse(blocksRaw) as Record<string, string>);
    const key = (await secret.openSecretAsString(ring, credentials, sealed)).trim();
    log(`[ring] opened the delegate key from the Key Ring: "${sealed.key}", sealed ${sealed.sealedAt} on ${sealed.ring.applicationPath}`);
    return checked(key, "ring", log);
  } catch (e) {
    log(`[ring] cannot open the delegate key: ${(e as Error).message}. If the owner revoked this host, that is the kill switch working. Not trading.`);
    return null;
  }
}

function checked(key: string, source: FoundKey["source"], log: (line: string) => void): FoundKey | null {
  if (!KEY_RE.test(key)) {
    log(`[key] the ${source} delegate key is not a 0x-prefixed 32-byte hex key. Not trading.`);
    return null;
  }
  return { key: key as Hex, source };
}
