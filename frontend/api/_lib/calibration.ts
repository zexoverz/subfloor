import { DEFAULT_ENDPOINT, MAKER_FILLS_QUERY, query } from "./subgraph.ts";

/// The floor screen's number, derived rather than configured.
///
/// §10's rule: the default floor is the p99 of realized adverse deviation over the trailing seven
/// days, rounded up to the next 25 bps. The stated reason, which the screen shows in one sentence, is
/// that it is a floor the venue's history would almost never have hit — fewer than 1 in 100 past
/// fills — so the guarantee is real but the vault still trades freely.
///
/// **"Adverse" is the part that went wrong, and it is worth saying how.** Until 10 Sep this read the
/// daily snapshot's `adverseDeviationP99Bps`, which the subgraph computes as the 99th percentile of
/// the maker's signed deviation sorted ascending. Negative is worse for the maker, so that is the
/// maker's *best* 1%, not its worst. Live, it read `p50 -51, p99 +44, floor 50`: a default floor
/// sitting inside the median fill, which would have refused half of the vault's own history. The
/// number is now taken from the fills themselves, from the other end.

/// Below this many scored fills a percentile is not statistics, it is a rumour with a decimal point.
export const MIN_SAMPLES = 100;

/// The §8 run band, used when there is not enough history to calibrate. Labelled as a house number
/// wherever it is shown, never rendered as if it came off the venue.
export const HOUSE_DEFAULT_BPS = 100;

export const DETENT_BPS = 25;

/// One page of fills. The window is a week of a testnet book, a few hundred fills; the loop stops at
/// the index's own `skip` ceiling rather than pretend it can page forever.
const PAGE = 1000;
const MAX_SKIP = 5000;

export function roundUpToDetent(bps: number): number {
  return Math.ceil(bps / DETENT_BPS) * DETENT_BPS;
}

export interface Calibration {
  /// What the screen should put on the handle. Positive: how far below the reference the floor sits.
  floorBps: number;
  /// True when `floorBps` came from venue history; false when it is the house number.
  calibrated: boolean;
  /// Scored fills behind the percentiles. Always rendered next to them.
  samples: number;
  /// The maker's median deviation from the reference, signed. Negative is worse than the reference.
  p50Bps: number | null;
  /// The deviation 99 in 100 of the maker's fills did better than, signed. The adverse tail.
  p99Bps: number | null;
  windowDays: number;
  /// Verbatim string for the cold-start case. Empty when calibrated.
  notice: string;
  /// What the screen's [run query] affordance hands a stranger.
  provenance: { endpoint: string; query: string; variables: Record<string, unknown> };
}

/// Nearest-rank, like the subgraph's own percentile: the value a real fill had, never an
/// interpolation between two that nobody traded at.
function nearestRank(sorted: number[], p: number): number {
  const rank = Math.min(sorted.length - 1, Math.floor((p * sorted.length) / 100));
  return sorted[rank];
}

/// From the maker's signed deviations, in bps, one per scored fill.
///
/// The adverse tail is the mirror of nearest-rank p99: sorted ascending, as many values in from the
/// bottom as nearest-rank p99 sits in from the top. On a hundred fills that is the single worst one.
export function calibrateFrom(makerDeviationsBps: number[], windowDays: number, provenance: Calibration["provenance"]): Calibration {
  const samples = makerDeviationsBps.length;

  if (samples < MIN_SAMPLES) {
    return {
      floorBps: HOUSE_DEFAULT_BPS,
      calibrated: false,
      samples,
      p50Bps: null,
      p99Bps: null,
      windowDays,
      notice: "venue history too short to calibrate — house default shown",
      provenance,
    };
  }

  const sorted = [...makerDeviationsBps].sort((a, b) => a - b);
  const fromTop = Math.min(samples - 1, Math.floor((99 * samples) / 100));
  const adverse = sorted[samples - 1 - fromTop];

  return {
    // A maker that did better than the reference even at its worst still gets a floor of zero below
    // it, never a floor above the reference: that would refuse fills history says were fine.
    floorBps: roundUpToDetent(Math.max(0, -adverse)),
    calibrated: true,
    samples,
    p50Bps: nearestRank(sorted, 50),
    p99Bps: adverse,
    windowDays,
    notice: "",
    provenance,
  };
}

export async function calibrate(
  windowDays = 7,
  endpoint: string = DEFAULT_ENDPOINT,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<Calibration> {
  const since = String(Math.floor(now.getTime() / 1000) - windowDays * 86_400);
  const deviations: number[] = [];

  for (let skip = 0; skip <= MAX_SKIP; skip += PAGE) {
    const page = await query<{ fillQualities: { makerAdverseDeviationBps: number }[] }>(
      MAKER_FILLS_QUERY,
      { since, first: PAGE, skip },
      endpoint,
      fetchImpl,
    );
    deviations.push(...page.fillQualities.map((f) => Number(f.makerAdverseDeviationBps)));
    if (page.fillQualities.length < PAGE) break;
  }

  return calibrateFrom(deviations, windowDays, {
    endpoint,
    query: MAKER_FILLS_QUERY,
    variables: { since, first: PAGE, skip: 0 },
  });
}
