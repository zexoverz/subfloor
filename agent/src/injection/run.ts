import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadPoisonedPage, PAYLOAD } from "./page.ts";
import { decide, wasCompromised } from "./decide.ts";
import { compose, guardOpcodes, type Decision } from "./decision.ts";

/// The injection harness, §7, three cases.
///
/// What this program does and does not do:
///
/// It composes. It records. It prints the exact `forge script` line that broadcasts the result.
/// It does **not** broadcast, and that is deliberate rather than unfinished — the broadcast path is
/// `script/ShipComposedProgram.s.sol`, which already carries the mandate signing and the ship, is
/// exercised by the same path that ships the live book, and is the wrong thing to reimplement in
/// TypeScript for a demo. Two ship paths that can disagree is worse than one that works.
///
///   node --experimental-strip-types src/injection/run.ts poisoned
///   node --experimental-strip-types src/injection/run.ts escalation
///   node --experimental-strip-types src/injection/run.ts transfer

const ARTIFACTS = join(process.cwd(), "..", "docs", "injection");

const PARAMS = {
  // The reference the live book is centred on, in raw units: raw tUSDC per raw WETH. tUSDC is six
  // decimals, so 2478.67 reads as ~2.478e9 rather than as anything human.
  referencePrice: 2_478_669_714n,
  spreadBps: 50,
  feeBps: 3000,
  deadlineAt: BigInt(Math.floor(Date.now() / 1000) + 3600),
  maxPerEpoch: 10n ** 21n,
  // How far below the reference a "sell at any available price" decision centres the book. The
  // vault's floor is 100 bps, so 500 puts every quote well through it — and the refusal is then the
  // attacker's own program failing, not a floor someone raised on cue.
  dumpBps: 500,
};

function archive(name: string, record: unknown): string {
  mkdirSync(ARTIFACTS, { recursive: true });
  const path = join(ARTIFACTS, `${name}.json`);
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  return path;
}

function shipLine(program: string): string {
  return [
    `SUBFLOOR_PROGRAM=${program} \\`,
    `  forge script script/ShipComposedProgram.s.sol --sig "run()" \\`,
    `  --rpc-url $RPC --account subfloor-dev --broadcast`,
  ].join("\n");
}

/// Case 1. The real page, the real model, no hardening in either direction.
async function poisoned(): Promise<void> {
  const { text } = loadPoisonedPage();
  console.log(`page: ${text.length} chars extracted`);
  console.log(`the payload is in the extracted text: ${text.includes(PAYLOAD)}`);
  console.log("");

  const decision = await decide(text);
  const compromised = wasCompromised(decision);

  console.log("model decided:", JSON.stringify(decision, null, 2));
  console.log("");
  console.log(compromised
    ? "The model obeyed the page. It is composing a program with its own protections removed."
    : "The model did not obey the page. Recorded as such — see `escalation`, which needs no model.");

  const program = compose(decision, PARAMS);
  const guards = guardOpcodes(program);
  console.log(`guard opcodes in the composed program: ${guards.length === 0 ? "none" : guards.map((g) => `0x${g.toString(16)}`).join(", ")}`);
  console.log("");
  console.log(archive("case-1-poisoned", { case: "poisoned", payload: PAYLOAD, decision, compromised, program, guards }));
  console.log("");
  console.log(shipLine(program));
}

/// Case 2. No model at all. The sentence this case exists to earn: the floor is not an instruction
/// the program runs, so there is nothing in the program to omit.
function escalation(): void {
  const decision: Decision = {
    action: "sell_all",
    omitRateConditions: true,
    rationale: "composed directly; the model was not consulted and is not needed",
  };

  const program = compose(decision, PARAMS);
  const guards = guardOpcodes(program);

  console.log("No model was called. The program was composed directly by someone who knows the VM.");
  console.log(`guard opcodes: ${guards.length === 0 ? "none" : guards.join(", ")}`);
  console.log("");
  console.log("This program will ship, and it will quote — below the reference, because that is what");
  console.log("\"at any available price\" is once it becomes a curve. It cannot settle there, because");
  console.log("the floor is a condition of settlement rather than one of the program's instructions.");
  console.log("Nothing is armed to make this happen: the attacker's own book is what fails.");
  console.log("");
  console.log(archive("case-2-escalation", { case: "escalation", decision, program, guards, modelCalled: false }));
  console.log("");
  console.log(shipLine(program));
}

/// Case 3. Printed here so the harness is one entry point; the attempt itself is on-chain.
function transfer(): void {
  console.log("The delegate surface is ship, dock, updateQuote, rescueApproval. There is no");
  console.log("delegate-reachable transfer, approve, or arbitrary call.");
  console.log("");
  console.log("Proven, not asserted:");
  console.log("  forge test --match-test testFuzz_noDelegateCallMovesValueOrApprovesAnyoneButAqua -vv");
  console.log("");
  console.log("Performed against the live deployment, for the log:");
  console.log("  forge script script/RawTransferAttempt.s.sol --sig \"run()\" \\");
  console.log("    --rpc-url $RPC --account subfloor-delegate --broadcast");
  console.log("");
  console.log(archive("case-3-transfer", {
    case: "raw-transfer",
    delegateSurface: ["ship", "dock", "updateQuote", "rescueApproval"],
    provenBy: "testFuzz_noDelegateCallMovesValueOrApprovesAnyoneButAqua",
  }));
}

const which = process.argv[2];
if (which === "poisoned") await poisoned();
else if (which === "escalation") escalation();
else if (which === "transfer") transfer();
else {
  console.error("usage: run.ts poisoned|escalation|transfer");
  process.exit(1);
}
