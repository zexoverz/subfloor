import { DAILY_QUALITY_QUERY, DEFAULT_ENDPOINT, REFERENCE_QUERY, query, type DailyQuality } from "./subgraph.ts";

/// The daily execution-quality report, generated from the index with the query attached.
///
/// Generated from the subgraph and never from operator logs. That is the whole point of the leg: the
/// party that trades cannot also be the auditor of its own fills, so the record a depositor reads is
/// computed by something other than the thing that produced it. The query travels with the report so
/// anyone can re-run it and get the same numbers.

export interface Report {
  generatedAt: string;
  windowDays: number;
  totals: { fills: number; refusals: number; scoredFills: number };
  worstDay: DailyQuality | null;
  days: DailyQuality[];
  reference: { aggregator: string; answer: string; updatedAt: string; roundId: string } | null;
  indexedBlock: number;
  hasIndexingErrors: boolean;
  provenance: { endpoint: string; queries: string[] };
  /// Stated on every report, because the fills are ours and pretending otherwise is the one thing
  /// that would make the rest of the numbers worthless.
  disclosure: string;
}

export const TAKER_DISCLOSURE =
  "The taker is ours: a self-operated bot from a separate funded EOA takes the vault's quotes when they cross CEX mid. The fills are real on-chain transfers with real gas and real adverse selection, and this is a measurement of execution quality, not of organic demand.";

export function renderMarkdown(r: Report): string {
  const lines: string[] = [];
  lines.push(`# SUBFLOOR execution quality`);
  lines.push("");
  lines.push(`Generated ${r.generatedAt} from the public index at block ${r.indexedBlock}.`);
  if (r.hasIndexingErrors) lines.push("");
  if (r.hasIndexingErrors) lines.push("**The index reported indexing errors. Treat every number below as suspect.**");
  lines.push("");

  if (r.totals.fills === 0) {
    lines.push("No fills in the window. Nothing to report, which is reported rather than omitted.");
  } else {
    lines.push(`${r.totals.fills} fills, ${r.totals.refusals} refused, over ${r.windowDays} days.`);
    if (r.totals.scoredFills < r.totals.fills) {
      lines.push("");
      lines.push(
        `${r.totals.fills - r.totals.scoredFills} of those fills had no reference indexed at their block and are excluded from every percentile below rather than counted as zero deviation.`,
      );
    }
    lines.push("");
    lines.push("| day | fills | refused | p50 bps | p99 bps | median ref age |");
    lines.push("|---:|---:|---:|---:|---:|---:|");
    for (const d of r.days) {
      lines.push(
        `| ${d.day} | ${d.fills} | ${d.refusals} | ${d.adverseDeviationP50Bps} | ${d.adverseDeviationP99Bps} | ${d.medianReferenceAgeSeconds}s |`,
      );
    }
    if (r.worstDay) {
      lines.push("");
      lines.push(`Worst day by p99: day ${r.worstDay.day} at ${r.worstDay.adverseDeviationP99Bps} bps.`);
    }
  }

  if (r.reference) {
    lines.push("");
    lines.push(
      `Reference: aggregator \`${r.reference.aggregator}\`, round ${r.reference.roundId}, answer ${r.reference.answer}, feed-reported update ${r.reference.updatedAt}.`,
    );
  }

  lines.push("");
  lines.push(`## Disclosure`);
  lines.push("");
  lines.push(r.disclosure);
  lines.push("");
  lines.push(`## Run it yourself`);
  lines.push("");
  lines.push(`Endpoint: \`${r.provenance.endpoint}\``);
  for (const q of r.provenance.queries) {
    lines.push("");
    lines.push("```graphql");
    lines.push(q);
    lines.push("```");
  }
  return lines.join("\n");
}

export async function generate(
  windowDays = 7,
  endpoint: string = DEFAULT_ENDPOINT,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<Report> {
  const since = Math.floor(now.getTime() / 1000 / 86400) - windowDays;
  const quality = await query<{ executionQualityDailySnapshots: DailyQuality[] }>(
    DAILY_QUALITY_QUERY,
    { since },
    endpoint,
    fetchImpl,
  );
  const meta = await query<{
    referenceAnswer: Report["reference"];
    _meta: { block: { number: number }; hasIndexingErrors: boolean };
  }>(REFERENCE_QUERY, {}, endpoint, fetchImpl);

  const days = quality.executionQualityDailySnapshots;
  const fills = days.reduce((n, d) => n + d.fills, 0);
  const refusals = days.reduce((n, d) => n + d.refusals, 0);
  // A day contributes to the percentiles only through its scored fills; the snapshot's percentiles
  // are zero when it has none, which is how a fully unscored day is told apart from a clean one.
  const scoredFills = days.reduce((n, d) => n + (d.adverseDeviationP99Bps === 0 && d.medianReferenceAgeSeconds === 0 ? 0 : d.fills), 0);

  const worstDay = days.length
    ? days.reduce((a, b) => (b.adverseDeviationP99Bps > a.adverseDeviationP99Bps ? b : a))
    : null;

  return {
    generatedAt: now.toISOString(),
    windowDays,
    totals: { fills, refusals, scoredFills },
    worstDay,
    days,
    reference: meta.referenceAnswer,
    indexedBlock: meta._meta.block.number,
    hasIndexingErrors: meta._meta.hasIndexingErrors,
    provenance: { endpoint, queries: [DAILY_QUALITY_QUERY, REFERENCE_QUERY] },
    disclosure: TAKER_DISCLOSURE,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await generate();
  console.log(renderMarkdown(r));
}
