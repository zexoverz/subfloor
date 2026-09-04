# SUBFLOOR — ETHOnline 2026

**Read `docs/SPEC.md` before anything else.** It opens with a build-handoff section carrying what
is settled, the verified addresses, the measured facts and the traps that already cost time. Do not
re-derive what it records, and do not soften anything it marks unverified.

**Submission: 13 Sep 2026, 16:00 UTC.**

## Working rules

**Commit incrementally and sign them.** Sponsors read the history; a single dump on the final day
reads as one. Small commits with real messages, from the first hour.

**Never commit a key.** This repo is private now and public at submission, and the whole history
goes with it. `.env` stays out; `.env.example` is the only committed shape.

**Measurements over assertions.** Where the spec gives a number it gives its provenance. Anything
new that goes in the same way, or it goes in marked unverified.

**Fail closed.** Where a guard cannot prove its input is fresh, it stops rather than guesses. That
rule is in the mechanism and it belongs in the code too.
