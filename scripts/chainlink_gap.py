#!/usr/bin/env python3
"""Measure how often Chainlink ETH/USD actually updates, per chain.

Every protocol with an oracle staleness check has to pick a bound, and almost nobody publishes
measurements behind theirs. Most pick a round number. This produces the distribution so ours can be
defended: SUBFLOOR's registry uses a bound derived from the observed maximum rather than a guess.

Rounds are read backwards from `latestRound` through `getRoundData`, so the history is genuine and
available immediately rather than accumulated by polling. That matters: a sampler that has run for
six hours can only honestly report six hours, and a bound argued from six hours is not an argument.

The caveat that does not go away, and which is stated in the output rather than buried here: the
long gaps are the **heartbeat** — the maximum interval the feed allows when the price is flat. An
active market never exercises it, so the tail of this distribution describes quiet periods. A
staleness bound has to survive the quiet, which is exactly why the heartbeat is the number that
matters.

    python3 scripts/chainlink_gap.py --rounds 300
"""

import argparse
import json
import statistics
import time
import urllib.request
import sys
from pathlib import Path

FEEDS = {
    # `mainnet.base.org` answers five of eight batched calls and reports no error for the three it
    # drops, which walks a handful of rounds and looks like a quiet feed. `publicnode` answers all
    # eight. Measured, not preferred.
    "base": ("0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70", "https://base-rpc.publicnode.com"),
    "optimism": ("0x13e3Ee699D1909E989722E753853AE30b17e08c5", "https://mainnet.optimism.io"),
    "arbitrum": ("0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612", "https://arb1.arbitrum.io/rpc"),
}

# Selectors, from `cast sig`. Called over plain JSON-RPC in batches rather than through `cast`:
# a subprocess and a round trip per round is minutes of wall clock for a few hundred reads, and the
# whole point of walking history is that it is fast enough to run before publishing.
GET_ROUND_DATA = "0x9a6fc8f5"
LATEST_ROUND_DATA = "0xfeaf968c"


def _rpc(rpc: str, calls: list[dict]) -> list[dict]:
    body = json.dumps(calls).encode()
    # A User-Agent is not optional: several public RPCs answer 403 without one, and the error says
    # Forbidden rather than anything about headers.
    req = urllib.request.Request(
        rpc, body, {"content-type": "application/json", "user-agent": "subfloor-chainlink-gap/1.0"}
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        out = json.load(r)
    return out if isinstance(out, list) else [out]


def _eth_call(to: str, data: str, ident: int) -> dict:
    return {"jsonrpc": "2.0", "id": ident, "method": "eth_call", "params": [{"to": to, "data": data}, "latest"]}


def _words(result: str) -> list[int]:
    """The five return values of a round, as unsigned words."""
    h = result[2:]
    return [int(h[i : i + 64], 16) for i in range(0, len(h), 64)]


def sample(chain: str, rounds: int) -> dict | None:
    addr, rpc = FEEDS[chain]

    try:
        latest = _rpc(rpc, [_eth_call(addr, LATEST_ROUND_DATA, 0)])[0]
    except Exception as e:  # noqa: BLE001 - any transport failure is the same answer here
        print(f"  {chain}: feed did not answer ({e}), skipping", file=sys.stderr)
        return None
    if "result" not in latest:
        print(f"  {chain}: feed did not answer, skipping", file=sys.stderr)
        return None

    w = _words(latest["result"])
    round_id, latest_updated = w[0], w[3]
    observations: list[tuple[int, int]] = [(round_id, latest_updated)]

    # Backwards, in small batches, retrying anything a batch drops.
    #
    # Public RPCs cap batch size and two of them do it badly. Optimism answers 413 for twenty calls,
    # which is at least loud. Base answers **five of ten with no error at all** — so treating a
    # missing id as the end of history stops the walk after a handful of rounds and reports nothing,
    # which is exactly what this script did until the partial responses were noticed. A dropped call
    # is retried once on its own; only a revert or a zero timestamp ends the walk, because those mean
    # the aggregator boundary rather than a tired endpoint.
    BATCH = 8
    stop = False
    for base in range(1, rounds, BATCH):
        if stop:
            break
        ids = [round_id - i for i in range(base, min(base + BATCH, rounds))]
        calls = [_eth_call(addr, GET_ROUND_DATA + f"{i:064x}", n) for n, i in enumerate(ids)]
        try:
            got = {r.get("id"): r for r in _rpc(rpc, calls)}
        except Exception:  # noqa: BLE001
            got = {}

        for n, rid in enumerate(ids):
            r = got.get(n)
            # Base drops roughly half of a batch of ten and returns no error for the ones it drops,
            # so one retry is not enough. Three, with a pause, gets a full walk; without them the
            # chain this project actually deploys on contributes five rounds and looks like the
            # quietest feed of the three.
            for attempt in range(3):
                if r and "result" in r and len(r["result"]) >= 66:
                    break
                time.sleep(0.15 * (attempt + 1))
                try:
                    r = _rpc(rpc, [_eth_call(addr, GET_ROUND_DATA + f"{rid:064x}", 0)])[0]
                except Exception:  # noqa: BLE001
                    r = None
            if not r or "result" not in r or len(r["result"]) < 66:
                stop = True
                break
            updated_at = _words(r["result"])[3]
            if updated_at == 0:
                stop = True
                break
            observations.append((rid, updated_at))

    observations.sort(key=lambda o: o[1])
    gaps = [b[1] - a[1] for a, b in zip(observations, observations[1:]) if b[1] > a[1]]
    if not gaps:
        # Said out loud. A sampler that returns nothing quietly is how a chain silently drops out of
        # a published dataset, and the reader has no way to tell an empty chain from an absent one.
        print(f"  {chain}: only {len(observations)} round(s) readable, no gaps to report", file=sys.stderr)
        return None

    span = observations[-1][1] - observations[0][1]
    ordered = sorted(gaps)
    return {
        "chain": chain,
        "feed": addr,
        "rounds": len(observations),
        "window_hours": round(span / 3600, 1),
        "first_updated_at": observations[0][1],
        "last_updated_at": observations[-1][1],
        "gap_seconds": {
            "min": ordered[0],
            "p50": statistics.median(ordered),
            "p90": ordered[int(len(ordered) * 0.9) - 1] if len(ordered) >= 10 else ordered[-1],
            "max": ordered[-1],
            "mean": round(statistics.fmean(ordered), 1),
        },
        "gaps": ordered,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rounds", type=int, default=200, help="how many rounds to walk back per chain")
    ap.add_argument("--out", default="docs/chainlink-gap.json")
    args = ap.parse_args()

    results = []
    for chain in FEEDS:
        print(f"sampling {chain}...", file=sys.stderr)
        r = sample(chain, args.rounds)
        if r:
            results.append(r)
            g = r["gap_seconds"]
            print(
                f"  {r['rounds']} rounds over {r['window_hours']}h — "
                f"p50 {g['p50']:.0f}s, p90 {g['p90']}s, max {g['max']}s",
                file=sys.stderr,
            )

    if not results:
        print("no chain answered", file=sys.stderr)
        return 1

    payload = {
        "what": "Chainlink ETH/USD update intervals, read backwards from latestRound via getRoundData",
        "caveat": (
            "The long gaps are the heartbeat: the maximum interval the feed allows when the price is "
            "flat. An active market never exercises it, so the tail describes quiet periods. That is "
            "the tail a staleness bound has to survive, which is why it is the number worth having."
        ),
        "chains": results,
    }
    Path(args.out).write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
