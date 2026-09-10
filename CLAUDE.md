# SUBFLOOR, ETHOnline 2026

**Read `docs/SPEC.md` in full, before anything else, every session.** Not the sections that look
relevant — all 2,500+ lines of it. Reading it in parts is how a session ends up confidently wrong
about something the spec already settled.

That is not hypothetical. On 7 Sep a session had read §0, §1, §2, §3, §5, §11, §12 and §13 and
skipped §7, §8, §10 and §15 entirely. It then told the builder the product was one vault per
relationship — because it had read §4's first sentence and stopped — when §4 names vault depositors
and agent products as the coming wave. It wrote every frontend ticket without ever opening §10, the
section that *is* the screen drawing, so tickets three lines long stood in for pages of settled
design. Both were caught by the builder, not by the session.

The cost of reading it all is minutes. The cost of not reading it is work built on a guess and a
builder who has to catch it.

**Read `docs/SPEC.md` before anything else.** It opens with a build-handoff section carrying what
is settled, the verified addresses, the measured facts and the traps that already cost time. Do not
re-derive what it records, and do not soften anything it marks unverified.

**Then read `docs/handoff.md`.** The spec records intent and design; the handoff records *state* —
what is deployed, what the numbers are and how to re-check them, what is unfinished, and which trap
was last walked into. It is short enough to read in full and it is the fastest way to stop being
wrong about the present. When it disagrees with the spec about a fact on chain, verify rather than
pick; when it disagrees about intent, the spec wins.

**Submission: 13 Sep 2026, 16:00 UTC.**

`docs/SPEC.md` **is published with this repository**, because ETHOnline's rules require a project
using a spec-driven workflow to include its spec files and planning artifacts so judges can see how
the AI was directed. Two things are redacted in place and marked: our own win estimates, and
assessments of other teams read from their public repositories. Keep it that way — when adding a
number or a rival read, put it behind the same marker rather than in the open. Everything
the code asserts is reproducible from the repo itself: `docs/gas.md`, `docs/proof.md` and
`docs/counterexamples.md` carry the measurements and the proofs.


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

**Log history goes through Envio HyperSync. `eth_getLogs` is forbidden — not discouraged.** Not as
a fallback, not as a simpler first version, not "just for a narrow range". Public RPCs cap the range
and rate-limit under a walk, so the RPC version passes every local test, ships, works for an hour,
and then fails on every call as the chain moves past it. Chunking does not fix it: the cap and the
rate limit are two problems and chunking trades one for the other.

This rule was already here on 7 Sep and was violated twice in one night anyway — in the frontend's
`/api/fills` endpoint and in the taker bot — with the same failure both times, the second written
while fixing the first. If you are reaching for `getLogs`, you are about to repeat it.

Query `https://<chain|chainid>.hypersync.xyz/query` with a bearer token from
`SUBFLOOR_HYPERSYNC_TOKEN`, paginate on `next_block` until it stops advancing, and remember the
response returns `blocks` and `logs` as sibling arrays with log fields flat (`topic0`…`topic3`,
`data`). Code that cannot find the token should throw and say why, never fall back to an RPC.

`eth_call` against current state is fine. This is about log *history*.

**Prove a venue is alive from event recency before reading it.** A contract answers every call and
returns a well-formed book whether or not anyone is trading against it. That has already cost time
on this work twice.

## Issues are the working board, and this is not optional

Open an issue before starting a piece of work, and close it with the commit that finishes it. A
repo whose history shows ten days of real work and a board that tracked it reads very differently
from one that shows neither.

```bash
gh issue create --title "FloorRegistry: guardian-signed lowering" \
  --label contracts --body "what done looks like, in one or two lines"

gh issue close 7 --comment "done in abc1234"
```

Labels: `contracts`, `frontend`, `indexer`, `agent`, `proofs`, `ops`, `spike`, `blocked`, `demo`.

Three rules that keep it useful rather than decorative:

**One issue per thing that can be finished.** If it cannot be closed in a day, it is two issues.

**`spike` means answer it before building on it.** A spike that stays open while code is written on
top of its assumption is how a wrong assumption reaches the demo.

**`blocked` names who you are waiting on and since when.** Anything blocked for more than a day
either gets chased or gets a different plan, and neither happens if the board does not say so.

Anything in `frontend` is Zikri's, so write those so someone who has not read the spec can pick
them up: what the screen shows, what the user does, what it reads from.

**Assign it, branch it, PR it, close it.** Taking an issue means assigning it to yourself first, so
the board says who is on what rather than only what exists. Work lands on a branch named for the
issue, goes up as a pull request, and the issue closes through that PR — not through a commit
pushed straight to `main`. The history a sponsor reads should show the work being proposed and
merged, not appearing.

```bash
gh issue edit 14 --add-assignee @me
git checkout -b floor-registry-storage
gh pr create --title "FloorRegistry storage, raise and read paths" --body "Closes #14"
```

