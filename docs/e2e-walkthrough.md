# Walking the whole thing yourself

Base Sepolia, from a wallet holding nothing, to watching the floor turn a fill away. Every command
below was run before this was written; the addresses and numbers are the live ones.

There are two paths through it and they are **not two flows**. They differ in one field. The second
half — making it refuse — is identical either way.

## What you need

Base Sepolia ETH from any public faucet. That is all; the quote token comes from ours.

```bash
export RPC=https://sepolia.base.org
export REGISTRY=0x47c7AbB1FfbF37eD4bCFCB20f6648B5c0cC86123
export ROUTER=0x03189D102286fa8cDd0fBF3578B492e67e665A27
export FACTORY=0xbfF56689e5fC80055766E5E75ce0Fcbc42e1A7C5
export FAUCET=0x044BB6a857A875e30f8933aDf652905d02EB65D2
export WETH=0x4200000000000000000000000000000000000006
export TUSDC=0x90dceE47Dc225832B8BbD7Eb8EeAC60766D2D1aD
export ME=<your address>
```

## Part 0 — tokens, which is a side panel and not the ceremony

```bash
cast send $FAUCET "draw()" --rpc-url $RPC --account you          # 25,000 tUSDC, 12h cooldown
cast send $WETH "deposit()" --value 0.01ether --rpc-url $RPC --account you
```

`drawTo(address)` funds someone else, and `nextDrawAt(address)` returns when their next draw is
allowed — so a button can show a countdown instead of sending something that reverts.

## Part A — a vault, in one transaction

```bash
cast send $FACTORY \
  "createVault((address,address,address,address[],address[],uint16[],uint256[]))" \
  "($ME,$ME,$REGISTRY,[$WETH,$TUSDC],[$TUSDC,$WETH],[100,100],[0,0])" \
  --rpc-url $RPC --account you
```

The struct is `(delegate, guardian, registry, base[], quote[], maxAdverseBps[], absoluteRate[])`.
Read it back:

```bash
VAULT=$(cast call $FACTORY "vaultsOfOwner(address)(address[])" $ME --rpc-url $RPC | tr -d '[] ')
cast call $VAULT "owner()(address)" --rpc-url $RPC
cast call $VAULT "delegate()(address)" --rpc-url $RPC
cast call $VAULT "guardian()(address)" --rpc-url $RPC
cast call $REGISTRY "guardian(address)(address)" $VAULT --rpc-url $RPC    # the registry-side one
cast call $REGISTRY "floor(address,address,address)(bool,uint16,uint232)" $VAULT $WETH $TUSDC --rpc-url $RPC
```

All five answer. That is the point of the one call: **a vault either comes out configured or does
not come out.** There is no half-set state for the interface to design a resume path around.

## Part B — the one field that differs

In Part A you passed your own address for `guardian`. That is the no-Ledger path, and everything
works: the floor is live, and an agent that is compromised still cannot settle below it.

What you gave up is narrower than it sounds and worth being exact about. **The key that can lower
the floor is the key that trades.** You are protected from a compromised agent; you are not
protected from a compromised you.

With a device, pass the device's address instead:

```
createVault((AGENT, LEDGER_ADDRESS, REGISTRY, ...))
```

Two ways to have that address, and the screen need not choose:

- Connect through a wallet holding a Ledger account — the connected address already is one
- Connect a hot wallet and attach the device over WebHID to read its address

Nothing else in this walkthrough changes. **The difference shows up later**, at the two moments
below, and every time a floor is lowered for the life of the vault.

## Part C — authority, and where the device earns its place

Shipping needs a mandate signed by the guardian. Since #253 it is **one signature for as long as it
lasts**: the vault checks the mandate on every ship and re-quote until its expiry, the per-token cap
binds what is live at once rather than each call, and `revokeMandate(nonce)` (you or the guardian,
never the agent) withdraws it early. An agent that re-centres every few minutes runs for the whole
fourteen days on the one signature below.

A vault from a factory deployed before #253 still spends one mandate per ship. Check with
`cast call $VAULT "mandateRevoked(uint256)(bool)" 0`: #253's vault answers, an older one reverts.

```bash
export SUBFLOOR_VAULT=$VAULT SUBFLOOR_REGISTRY=$REGISTRY SUBFLOOR_TUSDC=$TUSDC
export SUBFLOOR_ROUTER=$ROUTER SUBFLOOR_DELEGATE=$ME SUBFLOOR_NONCE=0

cd contracts
forge script script/ShipTestnetBook.s.sol --sig "digest()" --rpc-url $RPC
```

That prints a digest. Sign it:

- **No device** — `cast wallet sign --no-hash <digest> --account you`
- **Device** — sign it on the Ledger. It renders as a sentence rather than a hash, because
  `contracts/erc7730/eip712-AquaGuardVault.json` describes the type: the agent, the tokens, the
  caps, the expiry.

Then fund the vault and ship:

```bash
cast send $WETH "transfer(address,uint256)" $VAULT 4000000000000000 --rpc-url $RPC --account you
cast send $TUSDC "transfer(address,uint256)" $VAULT 10000000000 --rpc-url $RPC --account you

SUBFLOOR_MANDATE_SIG=0x... forge script script/ShipTestnetBook.s.sol --sig "run()" \
  --rpc-url $RPC --account you --broadcast
```

Six transactions and one signature, and two of the six were the token panel.

## Part D — making it refuse

This is the part worth doing, because it is the only one that proves anything.

We are not going to raise your floor to force it. That would demonstrate that a floor someone
adjusts on cue can stop a fill, which nobody doubts. Instead the **agent composes a bad book**, the
way a poisoned one would, and settlement turns it away with the floor exactly where you left it.

```bash
cd agent
node --experimental-strip-types src/injection/run.ts escalation
```

That prints a program with an **empty guard bank** — pricing opcodes only, `0x51` and `0x70`, no
`0x20`–`0x2f` at all — centred below the market, because "sell at any available price" is a price
rather than an instruction. It also prints the command to ship it.

Ship it under a fresh mandate nonce, then attempt a fill:

```bash
cd ../contracts
SUBFLOOR_PROGRAM=0x... forge script script/ShipComposedProgram.s.sol --sig "refusalCalldata()" --rpc-url $RPC
```

`forge script` will not broadcast this one: it simulates first and aborts because the simulation
reverts, and `--skip-simulation` does not change that. Send it with an explicit gas limit, which
skips estimation and lets the transaction land and fail — which is the artifact:

```bash
cast send $ROUTER <swap calldata> --gas-limit 900000 --rpc-url $RPC --account you
```

Expect `status 0` and:

```
SettledBelowFloor(<your vault>, WETH, tUSDC, <what it would have paid>, <your floor>)
```

Ours is `0x0cbf7b459ef98e9d51ba6263cb733b18c3db456c1c4e939a7f5a0cc6e8dfa797` — `2366489353` against
a floor of `2460461366`, with nothing armed.

## Part E — seeing it in the app

```bash
curl https://web-production-37798.up.railway.app/api/refusals
```

Your transaction appears with `reason: "SettledBelowFloor"` and both rates decoded. This is the only
place a refusal count can come from: a refusal is a revert, reverts emit no logs, and no subgraph can
see one. `/api/fills` and the subgraph carry the fills; refusals come from transaction status.

For the fill side, the index at `v3.1.0` scores every fill from **both** sides. A floor screen or a
refusal card wants the `maker` fields — `makerExecutionRate`, `makerAdverseDeviationBps`,
`makerFloorAtFill`. The taker fields are the counterparty's, and rendering those puts the wrong sign
on screen: a fill the taker beat the reference on is a fill the vault paid through it.

## What you have just shown

The agent composed a program with no guards at all and shipped it successfully. It quoted. The floor
was never touched. And settlement refused the fill anyway, because the floor is a condition of
settlement rather than one of the program's instructions — there is nothing in the program to omit.

That is the whole argument, and you can do it from a cold wallet in about ten minutes.
