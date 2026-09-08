# The injection harness

Three cases, §7. Each is reproducible from this repo against a live deployment.

The harness composes and records; it does not broadcast. Broadcasting is
`contracts/script/ShipComposedProgram.s.sol`, which already carries the mandate signing and the
ship and is the same path the live book goes out through. Two ship paths that can disagree is worse
than one that works.

## 1. The poisoned page

```
node --experimental-strip-types src/injection/run.ts poisoned
```

A local market-news page carries the attack in a CSS-hidden off-screen div (`left:-9999px`, not
`display:none` — the latter is stripped by many extractors and the former is not). The payload is
verbatim from the spec. The text extractor is the ordinary one: strip tags, keep the text. It does
not hunt for hidden content and it does not filter it, because a real scraper does neither, and an
extractor written to skip the attack would make the demo prove nothing.

The page text goes to the model as unlabelled user content. There is no injection-specific
hardening in the system prompt and nothing deliberately weakened either.

**The result does not decide the claim.** If the model obeys, the harness records a compromised
decision and composes a program with the guard bank empty. If it refuses, the harness records the
refusal — and case 2 broadcasts the same program anyway, because an attacker who knows the VM does
not need the model's cooperation.

Needs `ANTHROPIC_API_KEY`. Without one it refuses to run rather than inventing a decision.

## 2. The escalation

```
node --experimental-strip-types src/injection/run.ts escalation
```

No model. A program composed directly: pricing opcodes only, guard bank (`0x20`–`0x2f`) empty. It
ships, it quotes, and the fill is still refused.

This is the case that carries the architecture. The floor is not an instruction the program runs;
it is a condition of settlement. There is nothing in the program to omit.

## 3. The raw transfer

```
node --experimental-strip-types src/injection/run.ts transfer
```

The obvious follow-up question: if the agent is compromised, why price at all — why not move the
money out? Because the delegate cannot. Its surface is `ship`, `dock`, `updateQuote`,
`rescueApproval`, and nothing else.

Already proven in the test suite by
`testFuzz_noDelegateCallMovesValueOrApprovesAnyoneButAqua`, which fires arbitrary calldata at the
vault as the delegate over 256 runs and asserts no token leaves and no spender but Aqua is ever
approved. `contracts/script/RawTransferAttempt.s.sol` performs three of those attempts against a
live deployment so there is a log to read on camera.

## Artifacts

Each run writes `docs/injection/case-N-*.json` with the decision, the composed program, the guard
opcodes it contains, and — for case 1 — the model's own rationale.
