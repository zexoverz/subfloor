import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

/// The house agent has to get as far as saying who it is.
///
/// The first time a delegate key was set in production it never did: `policy/loop.ts` awaited
/// `run()` at the top level, `run()` imported `house/run.ts`, and that imported `configFromEnv` back
/// from `loop.ts`, whose evaluation was the thing waiting. Node exits that with "unsettled top-level
/// await" and nothing else. Every other test called `plan()` directly, so none of them started the
/// process the way Railway does, and none of them could see it.
///
/// A throwaway key, dry run, and every endpoint pointed at a closed local port: nothing leaves this
/// machine, and the line it waits for is printed before the first network call.
test("the policy loop starts the house agent when a delegate key is set", async () => {
  const loop = fileURLToPath(new URL("../src/policy/loop.ts", import.meta.url));
  const child = spawn(process.execPath, ["--experimental-strip-types", loop], {
    env: {
      ...process.env,
      SUBFLOOR_DELEGATE_KEY: `0x${randomBytes(32).toString("hex")}`,
      SUBFLOOR_DRY_RUN: "1",
      SUBFLOOR_SUBGRAPH: "http://127.0.0.1:9/unreachable",
      SUBFLOOR_API: "http://127.0.0.1:9",
      SUBFLOOR_RPC: "http://127.0.0.1:9",
      POLICY_INTERVAL_MS: "60000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let out = "";
  const started = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 15_000);
    const seen = (chunk: Buffer) => {
      out += chunk.toString();
      if (out.includes("[house] delegate")) {
        clearTimeout(timer);
        resolve(true);
      }
    };
    child.stdout.on("data", seen);
    child.stderr.on("data", seen);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve(out.includes("[house] delegate"));
    });
  });
  child.kill();

  assert.doesNotMatch(out, /unsettled top-level await/);
  assert.ok(started, `the house agent never said who it is:\n${out}`);
});
