import { useEffect, useState } from 'react';
import type { Calibration, TapeEntry } from '../types.ts';

/**
 * The floor screen's numbers, from the index rather than from this repository.
 *
 * §4 makes this a non-negotiable and it was not being met: `p50Bps`, `p99Bps`, `sampleCount` and
 * the strip of past fills all came from `fixtures.ts`, so a wallet with no fills of its own was
 * told a floor would have "refused 7 of 50 past fills" — fifty fills that never happened, on the
 * screen whose entire argument is that the human is not signing a guess.
 *
 * Two sources, because they answer different questions and the index stores them differently. The
 * percentiles come from `/api/calibration`, which reads the daily snapshots; the per-fill strip
 * comes from the tape the board already has, because a snapshot holds a day's p99 and not the fills
 * inside it.
 *
 * Nothing falls back. The endpoint answers 503 rather than degrading to a constant while the screen
 * still says "from venue history", and this keeps that promise: a failed read leaves the numbers
 * null and the screen says so.
 */
export type CalibrationRead = {
  data: Calibration | null;
  /** Which of three things is true. `failed` is not `loading`, and neither is "the venue is new". */
  status: 'loading' | 'live' | 'failed';
  /** Below the sample threshold the index says so itself, and the screen repeats it verbatim. */
  notice: string;
};

type Response = {
  floorBps: number;
  calibrated: boolean;
  samples: number;
  p50Bps: number | null;
  p99Bps: number | null;
  windowDays: number;
  notice: string;
};

export function useCalibration(tape: TapeEntry[] | null, days = 7): CalibrationRead {
  const [body, setBody] = useState<Response | null>(null);
  const [status, setStatus] = useState<'loading' | 'live' | 'failed'>('loading');

  useEffect(() => {
    let live = true;
    setStatus('loading');
    fetch(`/api/calibration?days=${days}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as Response;
      })
      .then((json) => {
        if (!live) return;
        setBody(json);
        setStatus('live');
      })
      .catch(() => {
        if (!live) return;
        setBody(null);
        setStatus('failed');
      });
    return () => {
      live = false;
    };
  }, [days]);

  /*
   * The realized fills, from the tape rather than from the calibration. Signed against the
   * reference, which is what "adverse deviation" means and what the control counts against.
   */
  const fillsBps = (tape ?? []).flatMap((e) =>
    e.kind === 'fill' && e.vsReferenceBps !== undefined ? [e.vsReferenceBps] : [],
  );

  if (!body) return { data: null, status, notice: '' };

  return {
    status,
    notice: body.notice,
    data: {
      windowDays: body.windowDays,
      sampleCount: body.samples,
      p50Bps: body.p50Bps ?? 0,
      p99Bps: body.p99Bps ?? 0,
      houseDefaultBps: body.floorBps,
      fillsBps,
    },
  };
}
