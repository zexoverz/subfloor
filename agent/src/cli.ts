#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { SoftwareDevice } from "./keyring/lkrp.ts";
import { initMemberCredentials, toKeyPair } from "./keyring/credentials.ts";
import { Ring, SUBFLOOR_APPLICATION_ID } from "./keyring/ring.ts";
import { openSecretAsString, resealSecret, sealSecret } from "./keyring/secret.ts";
import {
  FileRingStore,
  readMemberCredentials,
  readSealedSecret,
  writeMemberCredentials,
  writeSealedSecret,
} from "./keyring/store.ts";
import { openSpeculosDevice, speculosOptionsFromEnv } from "./keyring/speculos.ts";
import { ringIsInitialized } from "./keyring/walletCli.ts";
import { enrollThisHost } from "./keyring/enroll/candidate.ts";
import { runEnrollmentHost } from "./keyring/enroll/host.ts";
import { startRelay } from "./keyring/enroll/relay.ts";
import type { Device } from "./keyring/lkrp.ts";

const USAGE = `subfloor keyring — Ledger Key Ring for a host with no USB port

  keygen        --member <file> [--name <name>]        no device
  relay         [--port <n>] [--bind <addr>]           no device
  create-ring   --member <file> --ring <file>          DEVICE (or Speculos)
  enroll-host   --member <file> --ring <file> --relay <url>
                                                       no device
  enroll        --member <file> --ring <file> --url <url> [--name <n>] [--digits <d>]
                                                       no device
  members       --ring <file>                          no device
  seal          --member <file> --ring <file> --key <name> [--in <file>] --out <file>
                                                       no device
  open          --member <file> --ring <file> --in <file>
                                                       no device
  revoke        --member <file> --ring <file> --member-id <pubkey> [--reseal <file>]
                                                       DEVICE (or Speculos)
  cli-status                                           no device

Speculos stands in for the device on the two DEVICE commands when
SUBFLOOR_SPECULOS_COINAPPS points at a directory holding the Ledger Sync
application ELF. Without it those two commands need a real Ledger.
`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);

  switch (command) {
    case "keygen": {
      const path = required(flags, "member");
      const credentials = initMemberCredentials();
      await writeMemberCredentials(path, credentials);
      print({
        wrote: path,
        id: credentials.pubkey,
        name: flags.name ?? hostName(),
        note: "public identity above; the private half stays in that file, mode 0600",
      });
      return 0;
    }

    case "relay": {
      const relay = await startRelay(Number(flags.port ?? 0), flags.bind ?? "127.0.0.1");
      print({ relay: relay.url });
      await new Promise(() => {});
      return 0;
    }

    case "create-ring": {
      const credentials = await readMemberCredentials(required(flags, "member"));
      const { device, close } = await ownerDevice(credentials, flags);
      try {
        const ring = await Ring.create(
          device,
          toKeyPair(credentials).publicKey,
          flags.name ?? hostName(),
          SUBFLOOR_APPLICATION_ID,
        );
        await ring.save(new FileRingStore(required(flags, "ring")));
        print({ ring: ring.descriptor(), members: await ring.members() });
      } finally {
        await close();
      }
      return 0;
    }

    case "enroll-host": {
      const credentials = await readMemberCredentials(required(flags, "member"));
      const store = new FileRingStore(required(flags, "ring"));
      const ring = await Ring.load(store);
      const result = await runEnrollmentHost({
        relayUrl: required(flags, "relay"),
        ring,
        credentials,
        onEnrollmentUrl: (url) => print({ give_this_url_to_the_agent_host: url }),
        onDisplayDigits: (digits) => print({ read_these_digits_across: digits }),
      });
      await result.ring.save(store);
      print({ enrolled: result.member, ring: result.ring.descriptor() });
      return 0;
    }

    case "enroll": {
      const credentials = await readMemberCredentials(required(flags, "member"));
      const result = await enrollThisHost({
        url: required(flags, "url"),
        credentials,
        name: flags.name ?? hostName(),
        provideDigits: async (config) =>
          flags.digits ?? (await ask(`digits shown on the other host (${config.digits}): `)),
      });
      await result.ring.save(new FileRingStore(required(flags, "ring")));
      print({
        enrolled: true,
        ring: result.descriptor,
        member: credentials.pubkey,
        device_used: "none",
      });
      return 0;
    }

    case "members": {
      const ring = await Ring.load(new FileRingStore(required(flags, "ring")));
      print({ ring: ring.descriptor(), members: await ring.members() });
      return 0;
    }

    case "seal": {
      const credentials = await readMemberCredentials(required(flags, "member"));
      const ring = await Ring.load(new FileRingStore(required(flags, "ring")));
      const plaintext = flags.in ? await readFile(flags.in, "utf8") : await readStdin();
      const sealed = await sealSecret(ring, credentials, required(flags, "key"), plaintext.trim());
      await writeSealedSecret(required(flags, "out"), sealed);
      print({ sealed: flags.out, key: sealed.key, ring: sealed.ring });
      return 0;
    }

    case "open": {
      const credentials = await readMemberCredentials(required(flags, "member"));
      const ring = await Ring.load(new FileRingStore(required(flags, "ring")));
      const sealed = await readSealedSecret(required(flags, "in"));
      process.stdout.write(`${await openSecretAsString(ring, credentials, sealed)}\n`);
      return 0;
    }

    case "revoke": {
      const credentials = await readMemberCredentials(required(flags, "member"));
      const store = new FileRingStore(required(flags, "ring"));
      const before = await Ring.load(store);
      const { device, close } = await ownerDevice(credentials, flags);
      try {
        const after = await before.revoke(device, required(flags, "member-id"));
        if (flags.reseal) {
          const sealed = await readSealedSecret(flags.reseal);
          await writeSealedSecret(flags.reseal, await resealSecret(before, after, credentials, sealed));
        }
        await after.save(store);
        print({
          revoked: flags["member-id"],
          ring: after.descriptor(),
          members: await after.members(),
          resealed: flags.reseal ?? null,
          note: flags.reseal
            ? "old ciphertext replaced; the revoked host holds a key that opens nothing it still has"
            : "nothing re-sealed: anything sealed on the closed branch stays readable to whoever cached that key",
        });
      } finally {
        await close();
      }
      return 0;
    }

    case "cli-status": {
      print({
        wallet_cli_ring_initialized: await ringIsInitialized(),
        note: "false on any host that has never run `wallet-cli ring init`, which is every host with no USB port",
      });
      return 0;
    }

    default:
      process.stdout.write(USAGE);
      return command ? 1 : 0;
  }
}

/**
 * The device for the two hardware-gated operations.
 *
 * `--software-owner` exists for tests and for the offline walkthrough in the
 * README. It is refused unless it is asked for explicitly, because a device
 * check that quietly degrades to a software key is the exact thing this package
 * is arguing against.
 */
async function ownerDevice(
  credentials: { pubkey: string; privatekey: string },
  flags: Record<string, string | undefined>,
): Promise<{ device: Device; close: () => Promise<void> }> {
  if (flags["software-owner"] !== undefined) {
    return { device: new SoftwareDevice(toKeyPair(credentials)), close: async () => {} };
  }
  const speculos = speculosOptionsFromEnv();
  if (!speculos) {
    throw new Error(
      "this operation is rooted in the device. Attach a Ledger, or set " +
        "SUBFLOOR_SPECULOS_COINAPPS to a directory holding the Ledger Sync application ELF, " +
        "or pass --software-owner if you are running the offline walkthrough.",
    );
  }
  const session = await openSpeculosDevice(speculos);
  return { device: session.device, close: () => session.close() };
}

function parseFlags(argv: string[]): Record<string, string | undefined> {
  const flags: Record<string, string | undefined> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) continue;
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) flags[name] = "";
    else {
      flags[name] = next;
      i++;
    }
  }
  return flags;
}

function required(flags: Record<string, string | undefined>, name: string): string {
  const value = flags[name];
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function hostName(): string {
  return `${process.env.HOSTNAME ?? "agent-host"}-${process.platform}`.slice(0, 64);
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  },
);
