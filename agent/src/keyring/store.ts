import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RingBlocks, RingStore } from "./ring.ts";
import type { MemberCredentials, SealedSecret } from "./types.ts";
import { assertMemberCredentials } from "./credentials.ts";
import { assertSealedSecret } from "./secret.ts";

/** Ring blocks on disk. They carry no plaintext key material. */
export class FileRingStore implements RingStore {
  #path: string;
  constructor(path: string) {
    this.#path = path;
  }
  get path(): string {
    return this.#path;
  }
  async read(): Promise<RingBlocks | null> {
    const raw = await readJson(this.#path);
    return raw === null ? null : (raw as RingBlocks);
  }
  async write(blocks: RingBlocks): Promise<void> {
    await writeJson(this.#path, blocks, 0o600);
  }
}

/**
 * The member private key on disk, mode 0600.
 *
 * `wallet-cli ring init` puts this in the OS keychain behind WALLET_PASS, which
 * is the right home for it on a laptop. A VPS or a CI runner has no keychain, so
 * on those hosts this file is the equivalent, and the deployment note in the
 * README says to back it with whatever the host does have (a tmpfs mount, the
 * platform's secret store, a systemd credential). It is the member identity, not
 * the delegate key: on its own it decrypts nothing.
 */
export async function readMemberCredentials(path: string): Promise<MemberCredentials> {
  const raw = await readJson(path);
  if (raw === null) throw new Error(`no member credentials at ${path}; run \`keygen\` first`);
  assertMemberCredentials(raw);
  return raw;
}

export async function writeMemberCredentials(
  path: string,
  credentials: MemberCredentials,
): Promise<void> {
  await writeJson(path, credentials, 0o600);
}

export async function readSealedSecret(path: string): Promise<SealedSecret> {
  const raw = await readJson(path);
  if (raw === null) throw new Error(`no sealed secret at ${path}`);
  assertSealedSecret(raw);
  return raw;
}

export async function writeSealedSecret(path: string, sealed: SealedSecret): Promise<void> {
  await writeJson(path, sealed, 0o600);
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

async function writeJson(path: string, value: unknown, mode: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode });
}
