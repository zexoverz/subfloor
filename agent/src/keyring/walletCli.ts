import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * A thin bridge to `wallet-cli ring`, the CLI the Ledger track requires a
 * submission to be built on.
 *
 * The division of labour, and it is the whole finding of this package:
 *
 *   wallet-cli ring init            device required, USB only, no remote path
 *   wallet-cli ring encrypt/decrypt no device, needs the network
 *   wallet-cli ring keys/destroy    local cache / tear the whole ring down
 *
 * That is the entire `ring` surface, read from `wallet-cli ring --help` at
 * 2.1.0. There is no `add-member`, no `enroll`, no `revoke`. So on a host with
 * no USB port every one of these commands is unreachable, because they all sit
 * behind an `init` that cannot run:
 *
 *   $ WALLET_PASS=… wallet-cli ring init --output json
 *   {"ok":false,"error":{"command":"ring init","code":"unknown",
 *    "message":"No Ledger device found. Unlock the device and try again."}}
 *
 * Where the CLI can do the job, use it — `encrypt`/`decrypt` below shell out to
 * it, so a laptop that has run `ring init` uses Ledger's own implementation and
 * Ledger's own key derivation. Where it has no command at all, this package
 * supplies one on the same protocol underneath. Enrollment and revocation are
 * that second category.
 */
export type WalletCliOptions = {
  /** path to the wallet-cli binary; defaults to `wallet-cli` on PATH */
  bin?: string;
  /** WALLET_PASS is read from the environment and never taken as an argument */
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
};

export type WalletCliResult<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

export async function walletCli<T>(
  args: string[],
  options: WalletCliOptions = {},
  stdin?: string,
): Promise<WalletCliResult<T>> {
  const bin = options.bin ?? process.env.SUBFLOOR_WALLET_CLI ?? "wallet-cli";
  try {
    const child = run(bin, [...args, "--output", "json"], {
      env: options.env ?? process.env,
      timeout: options.timeoutMs ?? 120_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (stdin !== undefined) {
      child.child.stdin?.end(stdin);
    }
    const { stdout } = await child;
    return JSON.parse(lastJsonLine(stdout)) as WalletCliResult<T>;
  } catch (e) {
    const err = e as { stdout?: string; message?: string };
    if (err.stdout) {
      try {
        return JSON.parse(lastJsonLine(err.stdout)) as WalletCliResult<T>;
      } catch {
        // fall through to the generic error below
      }
    }
    return { ok: false, error: { message: err.message ?? String(e) } };
  }
}

export async function ringKeys(options?: WalletCliOptions) {
  return walletCli<{ keys: unknown }>(["ring", "keys"], options);
}

export async function ringEncrypt(key: string, plaintext: string, options?: WalletCliOptions) {
  return walletCli<{ output: string }>(["ring", "encrypt", "--key", key], options, plaintext);
}

export async function ringDecrypt(key: string, ciphertext: string, options?: WalletCliOptions) {
  return walletCli<{ output: string }>(["ring", "decrypt", "--key", key], options, ciphertext);
}

/** Is a usable Key Ring present on this host? Cheap, no device, no network. */
export async function ringIsInitialized(options?: WalletCliOptions): Promise<boolean> {
  const result = await ringKeys(options);
  return result.ok;
}

/**
 * The CLI prints a banner line before its JSON ("Tip: install the Ledger
 * wallet-cli skill…"), so the JSON is the last line, not the whole of stdout.
 */
function lastJsonLine(stdout: string): string {
  const lines = stdout.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i]!.trimStart().startsWith("{")) continue;
    // Compact output puts the whole object on this line; pretty output starts
    // it here and runs to the end. Joining to the end is right for both.
    return lines.slice(i).join("\n");
  }
  throw new Error(`no JSON in wallet-cli output: ${stdout.slice(0, 200)}`);
}
