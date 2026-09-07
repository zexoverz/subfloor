# Substreams-powered subgraphs are retired

**Answered 7 Sep, by deploying one.** The spike (#7) asked whether a Studio SPS deploy works on
Base, because the networks registry's `sps` array is empty for Base and SPS is the highest-value
single line on The Graph's published judging rubric at 2.0 points.

The registry's empty array had been read as "possibly unpopulated". It is not. The feature is gone.

## What was run

`subgraph.sps.yaml` in this directory, a `kind: substreams` data source pointing at
`../substreams/subfloor-refusals-v0.1.0.spkg` with a trigger handler in `src/substreams.ts`.

- `graph codegen` — **passes.** graph-cli 0.98.1 still understands the manifest.
- `graph build` — **passes.** It produces a valid SPS artifact and uploads it to IPFS.
- `graph deploy` — **rejected by Studio**, verbatim:

> Substreams-powered Subgraphs, originally intended for non-EVM chains, are no longer supported.
> If you need help migrating to standalone Substreams, please reach out in the #substreams channel
> on Discord.

## What follows

**It is not a Base problem and there is no chain to fall back to.** The plan of record was to deploy
the SPS variant on whichever chain Studio SPS still worked. There is no such chain. That also
explains why `sps` is empty for *every* network in the registry rather than only for Base — the array
is not unpopulated, the feature is retired.

**The composition is unaffected.** The fallback was already specified and is what is built: the
Substreams module streams directly, the subgraph indexes through ABI handlers, and the Token API is
the third product. Three products, each load-bearing. The refusal argument is untouched — a refused
fill is a revert, reverted transactions emit no logs, so the refusal counter still provably cannot
come from a subgraph and still comes from Substreams reading transaction status.

**The tooling gap is worth reporting.** `graph codegen` and `graph build` both accept an SPS manifest
and produce artifacts, and the package is uploaded to IPFS before anything objects. The failure
arrives only at the deploy step, from the server. A retired feature that still type-checks, compiles
and uploads is a slow way to find out, and this is the honest version of that feedback.

The files are kept rather than deleted, because a finding whose evidence has been removed is an
assertion.
