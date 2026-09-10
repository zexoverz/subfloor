import test from 'node:test';
import assert from 'node:assert/strict';
import { fillsInWindow } from './window.ts';

// `as const` so `kind` stays a literal: the helper narrows on it, and a widened `string`
// makes the narrowed return type `never` — which is the test failing to describe the real call.
const fill = (ts: number) => ({ kind: 'fill' as const, ts });
const refusal = (ts: number) => ({ kind: 'refusal' as const, ts });

test('a refusal newer than every fill does not empty the window', () => {
  // The bug: refusals come from transaction history and fills from the index, so a refusal is
  // routinely the newest row. Anchoring on it pushed every fill outside 15m, 1h, 6h and 24h alike.
  const tape = [fill(1000), fill(1200), refusal(99_000)];
  assert.equal(fillsInWindow(tape, 900).length, 2);
});

test('the window is measured back from the newest fill, not from now', () => {
  // A venue that stopped trading an hour ago is quiet, not broken.
  const tape = [fill(1000), fill(1200), fill(5000)];
  assert.deepEqual(
    fillsInWindow(tape, 900).map((f) => f.ts),
    [5000],
  );
});

test('no window means every fill, and never a refusal', () => {
  const tape = [fill(1), refusal(2), fill(3)];
  assert.deepEqual(
    fillsInWindow(tape, null).map((f) => f.ts),
    [1, 3],
  );
});

test('an empty tape is empty rather than a crash', () => {
  assert.deepEqual(fillsInWindow([], 900), []);
});
