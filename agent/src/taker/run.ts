#!/usr/bin/env node
import { clientsFromEnv, configFromEnv, pass, type Outcome , describeError } from "./bot.ts";

/// The taker loop.
///
/// It alternates which side it spends so the book gets taken both ways rather than drained one
/// direction, and it prints every outcome including the refusals. A refusal is not an error here:
/// `SettledBelowFloor` is the mechanism working, and the daily report counts them alongside fills.
///
/// Disclosed wherever these fills are published: this taker is ours. Organic takers will not find a
/// nine-day-old Aqua app. What is real about it is the execution — real transfers, real gas, real
/// adverse selection — which is what makes the execution-quality dataset a measurement rather than
/// a claim.

function line(o: Outcome): string {
  const at = new Date().toISOString().slice(11, 19);
  const side = `${o.tokenIn.slice(0, 8)}…`;
  switch (o.kind) {
    case "filled":
      return `${at}  filled   ${o.maker?.slice(0, 10)}… in=${o.amountIn} out=${o.amountOut} edge=${o.edgeBps}bps  ${o.hash}`;
    case "refused":
      return `${at}  REFUSED  ${o.maker?.slice(0, 10)}… in=${o.amountIn} rate=${o.floor?.executionRate} floor=${o.floor?.floorRate}  the floor held`;
    case "no-quote":
      return `${at}  no quote ${side} ${o.reason ?? ""}`;
    default:
      return `${at}  skipped  ${side} ${o.reason ?? ""}`;
  }
}

async function main() {
  const cfg = configFromEnv();
  const clients = clientsFromEnv(cfg);

  console.log(`taker ${clients.account.address}`);
  console.log(
    `router ${cfg.router}  makers ${cfg.vaults.length ? cfg.vaults.join(",") : "every one on the venue"}` +
      `  every ${cfg.intervalMs}ms  edge >= ${cfg.edgeBps}bps`,
  );

  const once = process.argv.includes("--once");
  let spendWeth = false;
  const tally = { filled: 0, refused: 0, other: 0 };

  for (;;) {
    try {
      const outcome = await pass(clients, cfg, spendWeth);
      console.log(line(outcome));
      if (outcome.kind === "filled") tally.filled++;
      else if (outcome.kind === "refused") tally.refused++;
      else tally.other++;
    } catch (err) {
      // Keep going. A dropped RPC or a nonce clash is not a reason to stop taking, and stopping
      // silently would look exactly like a venue nobody wants to trade with.
      console.error(`${new Date().toISOString().slice(11, 19)}  error    ${describeError(err)}`);
      tally.other++;
    }

    spendWeth = !spendWeth;
    if (once) break;
    await new Promise((r) => setTimeout(r, cfg.intervalMs));
  }

  console.log(`filled ${tally.filled}  refused ${tally.refused}  other ${tally.other}`);
}

await main();
