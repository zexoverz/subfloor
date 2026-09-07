import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The walkthrough from the README, run as separate processes, because that is
 * the claim: two machines, one of which never touches a device.
 *
 * `--software-owner` stands in for the Ledger on the two device-rooted steps.
 * Everything else in this file is the real path, unmodified: the relay is a
 * real WebSocket server, the enrollment is the real handshake between two
 * processes, and the sealed secret is opened by the process that was enrolled.
 */
const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const NODE_ARGS = ["--experimental-strip-types", "--no-warnings", CLI];
// Not a key; see the note in secret.test.ts.
const DELEGATE = "not-a-real-key:subfloor-delegate-fixture";

describe("the two-machine walkthrough, end to end", () => {
  let dir: string;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "subfloor-keyring-"));
  });
  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("takes a host with no device from nothing to a decrypted delegate key, then kills it", async () => {
    const laptopMember = join(dir, "laptop.member.json");
    const laptopRing = join(dir, "laptop.ring.json");
    const vpsMember = join(dir, "vps.member.json");
    const vpsRing = join(dir, "vps.ring.json");
    const sealedPath = join(dir, "delegate.sealed.json");

    // --- the machine with the device -----------------------------------
    const laptopKeygen = await cli(["keygen", "--member", laptopMember, "--name", "owner-laptop"]);
    assert.match(laptopKeygen.id as string, /^[0-9a-f]{66}$/);

    const created = await cli([
      "create-ring",
      "--member",
      laptopMember,
      "--ring",
      laptopRing,
      "--name",
      "owner-laptop",
      "--software-owner",
    ]);
    assert.equal((created.members as unknown[]).length, 1);

    // --- the machine with no device, before enrollment ------------------
    const vpsKeygen = await cli(["keygen", "--member", vpsMember, "--name", "vps-1"]);
    const vpsId = vpsKeygen.id as string;

    // --- the relay ------------------------------------------------------
    const relay = spawnCli(["relay", "--port", "0"]);
    const relayUrl = await relay.waitForMatch(/"relay":\s*"(ws:\/\/[^"]+)"/);

    // --- enrollment, both halves as separate processes -------------------
    const host = spawnCli([
      "enroll-host",
      "--member",
      laptopMember,
      "--ring",
      laptopRing,
      "--relay",
      relayUrl,
    ]);
    const url = await host.waitForMatch(/"give_this_url_to_the_agent_host":\s*"([^"]+)"/);

    // The digits only exist once the candidate has opened the channel, which is
    // the whole point of them: they bind the two ends that are actually talking.
    // So the candidate starts first and waits at its prompt, exactly as an
    // operator on an SSH session would.
    const candidate = spawnCli([
      "enroll",
      "--member",
      vpsMember,
      "--ring",
      vpsRing,
      "--url",
      url,
      "--name",
      "vps-1",
    ]);
    const digits = await host.waitForMatch(/"read_these_digits_across":\s*"(\d+)"/);
    candidate.write(`${digits}\n`);

    assert.equal(await candidate.exit(), 0, candidate.output());
    assert.equal(await host.exit(), 0, host.output());
    await relay.kill();

    const enrolled = lastJson(candidate.output());
    assert.equal(enrolled.device_used, "none");
    assert.equal(enrolled.member, vpsId);

    // --- the secret -----------------------------------------------------
    await cli(
      ["seal", "--member", laptopMember, "--ring", laptopRing, "--key", "subfloor-delegate", "--out", sealedPath],
      DELEGATE,
    );
    const envelope = await readFile(sealedPath, "utf8");
    assert.ok(!envelope.includes(DELEGATE), "the delegate key is sitting in the envelope");

    const opened = await run(["open", "--member", vpsMember, "--ring", vpsRing, "--in", sealedPath]);
    assert.equal(opened.code, 0, opened.stderr);
    assert.equal(opened.stdout.trim(), DELEGATE, "the no-USB host could not open its secret");

    // --- the kill switch -------------------------------------------------
    const revoked = await cli([
      "revoke",
      "--member",
      laptopMember,
      "--ring",
      laptopRing,
      "--member-id",
      vpsId,
      "--reseal",
      sealedPath,
      "--software-owner",
    ]);
    assert.equal(revoked.revoked, vpsId);
    assert.deepEqual((revoked.members as { name: string }[]).map((m) => m.name), ["owner-laptop"]);

    const afterRevocation = await run([
      "open",
      "--member",
      vpsMember,
      "--ring",
      vpsRing,
      "--in",
      sealedPath,
    ]);
    assert.equal(afterRevocation.code, 1, "the revoked host still opened the secret");
    assert.ok(
      /re-sealed|cannot derive/.test(afterRevocation.stderr),
      `unexpected failure: ${afterRevocation.stderr}`,
    );

    // The owner is unaffected, which is the other half of a kill switch being
    // useful rather than just destructive.
    const ownerStillWorks = await run([
      "open",
      "--member",
      laptopMember,
      "--ring",
      laptopRing,
      "--in",
      sealedPath,
    ]);
    assert.equal(ownerStillWorks.code, 0, ownerStillWorks.stderr);
    assert.equal(ownerStillWorks.stdout.trim(), DELEGATE);
  });

  it("refuses a device-rooted command when there is no device and no Speculos", async () => {
    const member = join(dir, "nodevice.member.json");
    await cli(["keygen", "--member", member]);
    const result = await run(["create-ring", "--member", member, "--ring", join(dir, "x.ring.json")]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /rooted in the device/);
    assert.match(result.stderr, /SUBFLOOR_SPECULOS_COINAPPS/);
  });
});

type Json = Record<string, unknown>;

async function cli(args: string[], stdin?: string): Promise<Json> {
  const result = await run(args, stdin);
  assert.equal(result.code, 0, `${args[0]} failed: ${result.stderr}`);
  return lastJson(result.stdout);
}

function run(
  args: string[],
  stdin?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [...NODE_ARGS, ...args], { stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    if (stdin !== undefined) child.stdin.end(stdin);
    else child.stdin.end();
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

function spawnCli(args: string[]) {
  const child = spawn(process.execPath, [...NODE_ARGS, ...args], { stdio: "pipe" });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
  child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
  // Record the exit eagerly. A `child.on("close")` registered later never fires
  // for a process that has already gone, which is a hang, not a failure.
  let exitCode: number | null = null;
  const closed = new Promise<number>((resolve) => {
    child.on("close", (code) => {
      exitCode = code ?? -1;
      resolve(exitCode);
    });
  });

  return {
    output: () => stdout + stderr,
    write(text: string) {
      child.stdin.write(text);
    },
    async waitForMatch(pattern: RegExp, timeoutMs = 15_000): Promise<string> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const m = pattern.exec(stdout);
        if (m?.[1]) return m[1];
        if (Date.now() > deadline) {
          throw new Error(`never matched ${String(pattern)} in:\n${stdout}\n${stderr}`);
        }
        await new Promise((r) => setTimeout(r, 20));
      }
    },
    exit(): Promise<number> {
      return exitCode === null ? closed : Promise.resolve(exitCode);
    },
    async kill(): Promise<void> {
      if (exitCode !== null) return;
      child.kill("SIGTERM");
      await closed;
    },
  };
}

/**
 * The CLI pretty-prints one JSON object per event and may print a prompt in
 * front of them, so "the result" is the last object, not the first, and not the
 * whole of stdout.
 */
function lastJson(output: string): Json {
  const lines = output.split("\n");
  const opens = lines.flatMap((line, i) => (line === "{" ? [i] : []));
  const closes = lines.flatMap((line, i) => (line === "}" ? [i] : []));
  const open = opens.at(-1);
  const close = closes.at(-1);
  if (open === undefined || close === undefined || close < open) {
    throw new Error(`no complete JSON object in output:\n${output}`);
  }
  return JSON.parse(lines.slice(open, close + 1).join("\n")) as Json;
}
