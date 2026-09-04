# SUBFLOOR, ETHOnline 2026

**Read `docs/SPEC.md` before anything else.** It opens with a build-handoff section carrying what
is settled, the verified addresses, the measured facts and the traps that already cost time. Do not
re-derive what it records, and do not soften anything it marks unverified.

**Submission: 13 Sep 2026, 16:00 UTC.**

## Working rules

**Commit at short stages, with short messages.** One working change per commit, a contract that
compiles, a test that passes, a screen that renders, not a day's work in one push. Sponsors read
the history and a single dump on the final day reads as one. Keep the subject to a line that says
what changed; the reasoning belongs in the code or the spec, not in a paragraph nobody reads twice.
Sign them.

**Never commit a key.** This repo is private now and public at submission, and the whole history
goes with it. `.env` stays out; `.env.example` is the only committed shape.

**Measurements over assertions.** Where the spec gives a number it gives its provenance. Anything
new that goes in the same way, or it goes in marked unverified.

**Fail closed.** Where a guard cannot prove its input is fresh, it stops rather than guesses. That
rule is in the mechanism and it belongs in the code too.

## Tools

**Research goes through Agent Reach.** Exa semantic search is configured and is the path for
anything the spec does not already answer:

```bash
export PATH="$HOME/.local/bin:$HOME/.nvm/versions/node/v23.10.0/bin:$PATH"
mcporter call exa.web_search_exa query="<describe the ideal page, not keywords>" numResults=6
```

Jina Reader reads any URL: `curl https://r.jina.ai/<URL>`. There is no `timeout` binary here, so wrap
long calls as `perl -e 'alarm 150; exec @ARGV' <cmd>`.

On-chain history goes through Envio HyperSync, not an RPC loop. Public RPCs cap `eth_getLogs`
and rate-limit under a walk; HyperSync does neither. Query
`https://<chain|chainid>.hypersync.xyz/query` with a bearer token, paginate on `next_block` until it
stops advancing, and remember the response returns `blocks` and `logs` as sibling arrays with log
fields flat (`topic0`…`topic3`, `data`).

**Prove a venue is alive from event recency before reading it.** A contract answers every call and
returns a well-formed book whether or not anyone is trading against it. That has already cost time
on this work twice.
