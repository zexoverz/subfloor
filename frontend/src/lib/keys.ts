import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { copy } from '../copy.ts';
import type { Address } from 'viem';
import { chain } from './chain.ts';
import { setRegistryGuardianAsVault, vaultAbi } from './contracts.ts';

/**
 * The two addresses the vault has to be told about, and the order they go in.
 *
 * The guardian is written twice, to two different places, and both are required. The vault's
 * guardian signs mandates; the registry's authorises weakening a floor. Either one left unset is a
 * hole in the half of the guarantee the device carries, which is why they are one action here
 * rather than two an owner could half-finish and believe complete.
 *
 * The registry's is **write-once**: `setGuardian` requires the current entry to be zero, and after
 * that only `rotateGuardian`, signed by the outgoing guardian, can move it. It is the one call in
 * this ceremony with no second chance, so the screen says so before it is pressed.
 *
 * Both go through the vault. The registry keys off `msg.sender`, so calling it from the owner's
 * wallet would register a guardian for an address that never settles and leave the vault with
 * none — #130 again, in a different slot.
 */
export type Keys = {
  sending: boolean;
  step: string | null;
  setGuardian: (guardian: Address) => Promise<void>;
  setDelegate: (delegate: Address) => Promise<void>;
};

function reason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('eth_sendTransaction')) return 'this wallet cannot sign, only read';
  return message.split('\n')[0]?.slice(0, 140) ?? 'the transaction was not sent';
}

export function useKeys(vault: Address | null, onWritten: () => void, registryTaken: boolean): Keys {
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState<string | null>(null);

  /**
   * Registering the device, which is only possible once.
   *
   * `registryTaken` is not a convenience — it decides whether this function may run at all. The
   * registry's slot is write-once, so on a vault whose slot is filled the second write reverts, and
   * by then the first has already changed the vault's guardian. The owner would be left with a
   * vault naming one key and a registry naming another, and the registry is the one that authorises
   * weakening a floor.
   *
   * Changing it after that is `rotateGuardian`, under a signature from the key being replaced.
   * That is a device ceremony this screen does not have, so it says so rather than half-doing it.
   */
  const setGuardian = useCallback(
    async (guardian: Address) => {
      if (!vault) return;
      if (registryTaken) {
        toast.error(copy.wallet.guardianLocked);
        return;
      }
      setSending(true);
      try {
        const [{ startAppKit }, core] = await Promise.all([import('./appkit.ts'), import('@wagmi/core')]);
        const config = startAppKit().config;

        /*
         * The vault first. If the registry's write-once slot were taken by an attempt that then
         * failed on the vault, the owner would be left holding the irreversible half alone.
         */
        setStep('on the vault');
        const first = await core.writeContract(config, {
          address: vault,
          abi: vaultAbi,
          functionName: 'setGuardian',
          args: [guardian],
          chainId: chain.id,
        });
        const firstReceipt = await core.waitForTransactionReceipt(config, { hash: first, chainId: chain.id });
        if (firstReceipt.status !== 'success') throw new Error('the vault did not accept the guardian');

        setStep('on the registry — this one cannot be undone');
        const second = await core.writeContract(config, {
          ...setRegistryGuardianAsVault(vault, guardian),
          chainId: chain.id,
        });
        const secondReceipt = await core.waitForTransactionReceipt(config, { hash: second, chainId: chain.id });
        if (secondReceipt.status !== 'success') throw new Error('the registry did not accept the guardian');

        toast.success('device registered, on the vault and the registry');
        onWritten();
      } catch (error) {
        toast.error(reason(error));
      } finally {
        setStep(null);
        setSending(false);
      }
    },
    [vault, onWritten, registryTaken],
  );

  const setDelegate = useCallback(
    async (delegate: Address) => {
      if (!vault) return;
      setSending(true);
      setStep('naming the agent');
      try {
        const [{ startAppKit }, core] = await Promise.all([import('./appkit.ts'), import('@wagmi/core')]);
        const config = startAppKit().config;
        const hash = await core.writeContract(config, {
          address: vault,
          abi: vaultAbi,
          functionName: 'setDelegate',
          args: [delegate],
          chainId: chain.id,
        });
        const receipt = await core.waitForTransactionReceipt(config, { hash, chainId: chain.id });
        if (receipt.status !== 'success') throw new Error('the agent was not named');
        toast.success('agent named');
        onWritten();
      } catch (error) {
        toast.error(reason(error));
      } finally {
        setStep(null);
        setSending(false);
      }
    },
    [vault, onWritten],
  );

  return { sending, step, setGuardian, setDelegate };
}
