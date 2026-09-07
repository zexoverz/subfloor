import { DAILY_QUALITY_QUERY, DEFAULT_ENDPOINT, query, type DailyQuality } from "./subgraph.ts";

/// The floor screen's number, derived rather than configured.
///
/// §10's rule, implemented exactly: the default floor is the p99 of realized adverse deviation over
/// the trailing seven days, rounded up to the next 25 bps. The stated reason, which the screen shows
/// in one sentence, is that it is a floor the venue's history would almost never have hit — fewer
/// than 1 in 100 past fills — so the guarantee is real but the vault still trades freely.

/// Below this many scored fills a percentile is not statistics, it is a rumour with a decimal point.
export const MIN_SAMPLES = 100;

/// The §8 run band, used when there is not enough history to calibrate. Labelled as a house number
/// wherever it is shown, never rendered as if it came off the venue.
export const HOUSE_DEFAULT_BPS = 100;

export const DETENT_BPS = 25;

export function roundUpToDetent(bps: number): number {
  return Math.ceil(bps / DETENT_BPS) * DETENT_BPS;
}

export interface Calibration {
  /// What the screen should put on the handle.
  floorBps: number;
  /// True when `floorBps` came from venue history; false when it is the house number.
  calibrated: boolean;
  /// Scored fills behind the percentiles. Always rendered next to them.
  samples: number;
  p50Bps: number | null;
  p99Bps: number | null;
  windowDays: number;
  /// Verbatim string for the cold-start case. Empty when calibrated.
  notice: string;
  /// What the screen's [run query] affordance hands a stranger.
  provenance: { endpoint: string; query: string; variables: Record<string, unknown> };
}

/// Combines the trailing window's daily rows into one calibration.
///
/// The p99 across days is the max of the daily p99s rather than a mean of them. A mean would be a
/// percentile of percentiles, which is not a percentile of anything, and it would sit below the
/// worst day — precisely the day a floor exists for.
export function calibrateFrom(days: DailyQuality[], windowDays: number, provenance: Calibration["provenance"]): Calibration {
  const samples = days.reduce((n, d) => n + d.fills, 0);

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

  const p99 = Math.max(...days.map((d) => d.adverseDeviationP99Bps));
  // Weighted by the fills behind each day, so a quiet day with two fills does not move the median
  // as far as a busy one. Only shown, never signed.
  const weighted = days.reduce((sum, d) => sum + d.adverseDeviationP50Bps * d.fills, 0);
  const p50 = Math.round(weighted / samples);

  return {
    floorBps: roundUpToDetent(p99),
    calibrated: true,
    samples,
    p50Bps: p50,
    p99Bps: p99,
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
  const since = Math.floor(now.getTime() / 1000 / 86400) - windowDays;
  const variables = { since };
  const data = await query<{ executionQualityDailySnapshots: DailyQuality[] }>(
    DAILY_QUALITY_QUERY,
    variables,
    endpoint,
    fetchImpl,
  );
  return calibrateFrom(data.executionQualityDailySnapshots, windowDays, {
    endpoint,
    query: DAILY_QUALITY_QUERY,
    variables,
  });
}
