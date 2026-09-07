# @subfloor/sdk

Compose SwapVM programs and reason about floors, from TypeScript.

```bash
npm run check
```

```ts
import { Program, deadline, requireFreshReference, xycConcentrateSwap, feeFlatIn } from "@subfloor/sdk";

const program = new Program()
  .push(deadline(Math.floor(Date.now() / 1000) + 3600))
  .push(requireFreshReference(2464))
  .push(xycConcentrateSwap(sqrtPriceMin, sqrtPriceMax))
  .push(feeFlatIn(30));

await vault.ship(program.hex(), mandate, signature);
```

## The wire format

One byte of opcode, one byte of args length, then that many bytes of args, repeated to the end of the
program. Arguments are packed big-endian at the widths each instruction declares — no ABI padding
anywhere. This is the run loop's own format, read off `src/libs/VM.sol::runLoop`, and the one-byte
length is why no instruction can carry more than 255 bytes of arguments.

## Why the encoders are tested the way they are

An off-chain encoder checked against hand-written expectations proves only that it agrees with
whoever wrote the expectations. These are asserted byte-for-byte against output from the instruction
libraries the VM actually runs, printed by `contracts/test/subfloor/EncodingVectors.t.sol`. Change an
encoding on either side and the test fails on the other.

Regenerate the vectors with `forge test --match-contract EncodingVectors -vv`.

## Two conventions worth reading before using this

**A rate is `received * 1e18 / given`, in raw token units, from one party's point of view.** Higher is
better for that party. The two sides of a fill hold reciprocal rates and each looks up its own floor,
which is why the settlement check is symmetric.

**A value too wide for its field throws rather than truncating.** A silently narrowed deadline or fee
is still a valid program the VM will happily run — it just does something other than what you asked.
