import { useCallback, useEffect, useState } from 'react';
import { formatUnits, type Address } from 'viem';
import { publicClient } from './client.ts';
import {
  addresses,
  erc20Abi,
  deployed,
  mandateDomain,
  mandateTypes,
  raiseFloorAsVault,
  registryAbi,
  setRegistryGuardianAsVault,
  vaultAbi,
} from './contracts.ts';
import { ACTIVE_TOKENS, USDC, WETH } from './tokens.ts';
import { loadMandate } from './mandateStore.ts';
import type { Floor, Holding } from '../types.ts';
import { mocked } from './mock.ts';

/**
 * The one-time setup, as state rather than a wizard.
 *
 * §10 collapses deposit, mandate and first floor into one ceremony ending in one device signature,
 * and that is exactly what this is: four ordinary owner transactions, then one signature. Only the
 * mandate needs the device, because only the mandate is the thing an attacker would want.
 *
 * Each step reads its own truth from the chain instead of tracking progress locally, so a half
 * finished setup resumes correctly and a step someone did from a script still shows as done.
 */
export type StepId = 'fund' | 'floor' | 'guardian' | 'delegate' | 'mandate';

export type Step = {
  id: StepId;
  title: string;
  detail: string;
  done: boolean;
  /** True only for the mandate: the one step the trading machine must never be able to perform. */
  device: boolean;
};


export type CeremonyState = {
  deployed: boolean;
  isOwner: boolean | null;
  /** vault.delegate(), for the screens that must show the address rather than a nickname. */
  delegate: Address | null;
  /**
   * The registered device — but only when *both* slots hold one, which is what the setup step
   * checks. For asking a key to sign, use the one the contract will actually check.
   */
  guardian: Address | null;
  /**
   * `AquaGuardVault.guardian()`. This is the key a **mandate** is verified against:
   * `_consumeMandate` recovers a signer and compares it to this, and to nothing else.
   */
  vaultGuardian: Address | null;
  /**
   * `FloorRegistry.guardian(vault)`. This is the key a **lowering** is verified against, and the
   * one whose slot is write-once. Conflating the two was a real bug: a vault with only one of them
   * set reported no guardian at all, so every ceremony led with the device even where the wallet
   * was the key that would be checked.
   */
  registryGuardian: Address | null;
  /**
   * Whether the *registry's* slot for this vault is already taken, which is a different question
   * from whether a device is set.
   *
   * `FloorRegistry.setGuardian` is write-once — it requires the current entry to be zero — so once
   * it holds anything the only way to change it is `rotateGuardian`, under an EIP-712 signature
   * from the guardian being replaced. A vault deployed through the factory's one-call setup comes
   * out with this already filled, so "register your device" is not an action that can succeed on
   * one, and offering it would write the vault's half and then revert on the registry's, leaving
   * the two naming different keys.
   */
  registryGuardianSet: boolean;
  /**
   * The floor as the registry has it, or null while nothing is deployed. Every screen reads this
   * rather than the fixture: a proposed number rendered where a configured one goes is the same
   * class of lie as a fixture labelled live.
   */
  floor: Floor | null;
  /** The reference feed the registry actually consults, so the link points at the real oracle. */
  feed: Address | null;
  /** What the vault itself holds. Null until read — never the owner's wallet, which is a different address. */
  inventory: Holding[] | null;
  /**
   * A mandate nonce that has not been spent.
   *
   * Mandates are single-use, so signing against a spent nonce produces a signature the vault will
   * reject — and it would look like a device fault rather than a stale number. Null until read,
   * because guessing zero is right exactly once.
   */
  nonce: bigint | null;
  steps: Step[];
  /**
   * Whether the read has come back at all — either way.
   *
   * `isOwner` being null cannot carry this: null means both "not asked yet" and "asked, and the
   * answer never arrived", and a screen that cannot tell them apart either hangs on a spinner or
   * calls the owner a stranger. Those were the same bug twice, in opposite directions.
   */
  settled: boolean;
  /** What stopped the read, so a failure can be shown rather than waited on forever. */
  error: string | null;
  refresh: () => void;
};

/**
 * How far to look for an unspent mandate nonce before giving up.
 *
 * Sixty-four re-quotes is a long day for one vault and a short loop for a page load. Beyond it the
 * answer is not a bigger number.
 */
const MANDATE_NONCE_SCAN = 64n;

/**
 * Is this nonce unusable — revoked on a vault that has #253's bytecode, spent on one that does not.
 *
 * Both are `mapping(uint256 => bool) public` and both answer the same question for the interface:
 * can a fresh mandate still be signed at this nonce. The older vaults on chain carry `mandateUsed`
 * and revert on `mandateRevoked`, and because reads are batched through Multicall3 that revert took
 * the whole tick with it — the factory read in the same batch failed too, and its error was
 * rendered under "could not reach the factory" (#266).
 *
 * Tried in that order because the new name is the one the migration moves vaults onto, so the
 * fallback costs a round trip only on a vault that has not been moved yet.
 */
async function nonceUnavailable(vault: Address, nonce: bigint): Promise<boolean> {
  try {
    return (await publicClient.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: 'mandateRevoked',
      args: [nonce],
    })) as boolean;
  } catch {
    return (await publicClient.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: 'mandateUsed',
      args: [nonce],
    })) as boolean;
  }
}

export function useCeremony(address: Address | null, vault: Address | null): CeremonyState {
  /** Mock mode advances one step per press, so the whole flow is walkable with nothing deployed. */
  const [mockDone, setMockDone] = useState(0);
  const [owner, setOwner] = useState<Address | null>(null);
  const [floorsSet, setFloorsSet] = useState(false);
  /** The vault's own inventory. The wallet's holdings are not the vault's, and only one settles. */
  const [inventory, setInventory] = useState<Holding[] | null>(null);
  const [nonce, setNonce] = useState<bigint | null>(null);
  const [floor, setFloor] = useState<Floor | null>(null);
  const [feed, setFeed] = useState<Address | null>(null);
  const [guardian, setGuardian] = useState<Address | null>(null);
  const [vaultGuardian, setVaultGuardian] = useState<Address | null>(null);
  const [registryGuardianAddr, setRegistryGuardianAddr] = useState<Address | null>(null);
  const [registryGuardianSet, setRegistryGuardianSet] = useState(false);
  const [delegate, setDelegate] = useState<Address | null>(null);
  const [tick, setTick] = useState(0);
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (mocked) setMockDone((n) => n + 1);
    else setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    /*
     * Gated on the vault being read, not on the demo vault in the build's env. `deployed` requires
     * VITE_VAULT, which has nothing to do with a vault the visitor deployed themselves — with it
     * absent, an owner's own vault was never read at all, and the board called them a stranger.
     */
    if (mocked) return;
    if (!addresses.registry || !vault) {
      // Nothing to read is a settled answer too: it is not the owner's vault, and not a pending one.
      setSettled(true);
      setError(addresses.registry ? null : 'no registry address in this build');
      return;
    }
    setSettled(false);
    setError(null);
    let live = true;

    (async () => {
      const registry = addresses.registry as Address;
      try {
        const [o, d, g, sell, buy, registryGuardian, configured, reference, held, zeroSpent] = await Promise.all([
          publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'owner' }),
          publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'delegate' }),
          publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'guardian' }),
          publicClient.readContract({ address: registry, abi: registryAbi, functionName: 'effectiveFloor', args: [vault, WETH, USDC] }),
          publicClient.readContract({ address: registry, abi: registryAbi, functionName: 'effectiveFloor', args: [vault, USDC, WETH] }),
          publicClient.readContract({ address: registry, abi: registryAbi, functionName: 'guardian', args: [vault] }),
          publicClient.readContract({ address: registry, abi: registryAbi, functionName: 'floor', args: [vault, WETH, USDC] }),
          publicClient.readContract({ address: registry, abi: registryAbi, functionName: 'referenceFeed', args: [WETH, USDC] }),
          Promise.all(
            ACTIVE_TOKENS.map((t) =>
              publicClient.readContract({ address: t.address, abi: erc20Abi, functionName: 'balanceOf', args: [vault] }),
            ),
          ),
          /*
           * Nonce 0 is the usual answer and the loop below only looks further if it is taken.
           *
           * Read through the tolerant path rather than inline: a vault predating #253 reverts on
           * `mandateRevoked`, and inside this batch that failure is not its own — it fails the
           * whole `Promise.all`, so owner, delegate, guardian, floors and inventory all go missing
           * over one mapping's name.
           */
          nonceUnavailable(vault, 0n),
        ]);
        if (!live) return;
        setOwner(o as Address);
        setDelegate((d as Address) === '0x0000000000000000000000000000000000000000' ? null : (d as Address));
        // Both keys have to be the device: the vault's signs mandates, the registry's authorises
        // weakening. Either one left unset is a hole in the half of the claim the device carries.
        const vaultGuardian = g as Address;
        const regGuardian = registryGuardian as Address;
        const zero = '0x0000000000000000000000000000000000000000';
        setGuardian(vaultGuardian !== zero && regGuardian !== zero ? vaultGuardian : null);
        // Kept apart as well as together: each ceremony must ask the key its own contract checks.
        setVaultGuardian(vaultGuardian === zero ? null : vaultGuardian);
        setRegistryGuardianAddr(regGuardian === zero ? null : regGuardian);
        setRegistryGuardianSet(regGuardian !== zero);
        // A floor is only real when both directions have one. One side covered is an agent that
        // can still sell the other way at any price.
        setFloorsSet(Boolean((sell as [bigint, boolean])[1] && (buy as [bigint, boolean])[1]));

        const [isConfigured, bps, absolute] = configured as [boolean, number, bigint];
        setFloor({ enforced: isConfigured, maxAdverseBps: bps, absoluteRate: absolute });

        // Funded means the *vault* holds something. Reading the owner's wallet here ticked the
        // step green before a single token had moved.
        setInventory(
          ACTIVE_TOKENS.map((t, i) => ({
            symbol: t.symbol,
            amount: Number(formatUnits((held as bigint[])[i] ?? 0n, t.decimals)),
          })),
        );

        /*
         * The first nonce nobody has revoked.
         *
         * Since #253 a mandate is not spent by use: one signature covers every ship and re-quote
         * until it expires, so nonce 0 is the answer unless the owner or the guardian revoked it.
         * The scan only matters after a revocation, when a fresh mandate needs a nonce the vault
         * will still accept.
         *
         * Nonces need not be contiguous, so the scan is a convenience rather than a rule, and it is
         * bounded: past the window the honest answer is that this vault needs its nonces managed
         * somewhere other than a scan, not that the read should walk forever.
         */
        if (!(zeroSpent as boolean)) {
          setNonce(0n);
        } else {
          let next: bigint | null = null;
          for (let n = 1n; n <= MANDATE_NONCE_SCAN; n++) {
            const spent = await nonceUnavailable(vault, n);
            if (!spent) {
              next = n;
              break;
            }
          }
          if (!live) return;
          setNonce(next);
        }

        const [feedAddress] = reference as [Address, boolean, number, number, bigint];
        setFeed(feedAddress === '0x0000000000000000000000000000000000000000' ? null : feedAddress);
        setSettled(true);
      } catch (cause) {
        if (!live) return;
        setOwner(null);
        setError((cause instanceof Error ? cause.message : String(cause)).split('\n')[0]?.slice(0, 120) ?? 'the vault could not be read');
        setSettled(true);
      }
    })();

    return () => {
      live = false;
    };
  }, [address, vault, tick]);

  const steps: Step[] = [
    {
      id: 'fund',
      title: 'Fund the vault',
      detail: 'move inventory in. An ordinary transfer — the vault holds it, you still own it.',
      done: mocked ? mockDone > 0 : Boolean(inventory?.some((h) => h.amount > 0)),
      device: false,
    },
    {
      id: 'floor',
      title: 'Set the floor, both directions',
      detail: 'registered for the vault, not for your address: the vault is what settles.',
      done: mocked ? mockDone > 1 : floorsSet,
      device: false,
    },
    {
      id: 'guardian',
      title: 'Register your device',
      detail: 'on the vault and on the registry. The registry entry can only be set once.',
      done: mocked ? mockDone > 2 : Boolean(guardian),
      device: false,
    },
    {
      id: 'delegate',
      title: 'Name the agent',
      detail: 'the key that may compose and ship strategies, and nothing else.',
      done: mocked ? mockDone > 3 : Boolean(delegate),
      device: false,
    },
    {
      id: 'mandate',
      title: 'Sign the mandate on your device',
      detail: 'not a transaction — a signature the agent carries and the vault checks on every ship.',
      /*
       * Signed, for the delegate the vault currently names.
       *
       * The chain records a mandate only when the agent ships with it, so waiting for on-chain
       * evidence meant a step that could never complete. What this checks instead is the strongest
       * thing available locally — and it has to include the delegate, because `_consumeMandate`
       * requires `m.delegate == msg.sender`. Replace the agent and the old signature authorises
       * nobody: the step correctly goes back to unfinished rather than reporting an authorisation
       * that the vault would now reject.
       *
       * ponytail: the signature itself is not verified here, and the spec puts a mandate in the
       * Key Ring rather than in a browser. Both are wrong for the same reason and both are #143's
       * territory now that the agent exists.
       */
      done: mocked
        ? mockDone > 4
        : Boolean(
            delegate && loadMandate(vault)?.delegate?.toLowerCase() === delegate.toLowerCase(),
          ),
      device: true,
    },
  ];

  return {
    deployed: mocked || deployed,
    isOwner: mocked ? true : owner && address ? owner.toLowerCase() === address.toLowerCase() : null,
    delegate,
    guardian,
    vaultGuardian,
    registryGuardian: registryGuardianAddr,
    registryGuardianSet,
    floor,
    feed,
    inventory,
    nonce,
    steps,
    settled: mocked || settled,
    error,
    refresh,
  };
}

export { mandateDomain, mandateTypes, raiseFloorAsVault, setRegistryGuardianAsVault };
