import { useCallback, useRef, useState } from 'react';
import type { Address } from 'viem';

/**
 * The Ledger, connected directly over WebHID — no browser wallet in between.
 *
 * This is not a convenience. The whole security claim is a key split: the machine that trades is
 * never the machine that defines the worst price. Routing the device through MetaMask makes it a
 * signing accessory, and what gets demonstrated is MetaMask's integration rather than the
 * separation this project is built on. Connecting the device itself shows the split instead of
 * describing it.
 *
 * Everything is behind a dynamic import: the kits are large, and a visitor reading the tape has no
 * reason to download a hardware stack.
 *
 * ponytail: untested against physical hardware — written from the installed type definitions, and
 * the first real device or Speculos run is what confirms the derivation path and the typed-data
 * shape are right.
 */
const DERIVATION_PATH = "44'/60'/0'/0/0";

export type Ledger = {
  supported: boolean;
  connecting: boolean;
  address: Address | null;
  error: string | null;
  connect: () => void;
  signTypedData: (typedData: unknown) => Promise<string | null>;
};

type Session = { dmk: any; sessionId: string; signer: any };

export function useLedger(): Ledger {
  const [address, setAddress] = useState<Address | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<Session | null>(null);

  // WebHID is Chromium-only, and saying so beats a button that silently does nothing in Firefox.
  const supported = typeof navigator !== 'undefined' && 'hid' in navigator;

  /** The device actions report progress on an observable; this waits for the terminal state. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rxjs subscribe has overloads the
  // narrow shape below cannot satisfy; the state object is validated at runtime instead.
  const settle = <T,>(action: { observable: { subscribe: (o: any) => unknown } }): Promise<T> =>
    new Promise((resolve, reject) => {
      action.observable.subscribe({
        next: (state: { status: string; output?: T; error?: unknown }) => {
          if (state.status === 'completed' && state.output !== undefined) resolve(state.output);
          if (state.status === 'error') reject(state.error);
          if (state.status === 'stopped') reject(new Error('cancelled on the device'));
        },
        error: reject,
      });
    });

  const connect = useCallback(async () => {
    if (!supported) {
      setError('this browser cannot talk to a Ledger directly — try Chrome or Edge');
      return;
    }
    setConnecting(true);
    setError(null);

    try {
      const [{ DeviceManagementKitBuilder }, { webHidTransportFactory }, { SignerEthBuilder }] = await Promise.all([
        import('@ledgerhq/device-management-kit'),
        import('@ledgerhq/device-transport-kit-web-hid'),
        import('@ledgerhq/device-signer-kit-ethereum'),
      ]);

      const dmk = new DeviceManagementKitBuilder().addTransport(webHidTransportFactory).build();

      // Discovery is a stream; the first device the owner picks in the browser prompt is the one.
      const device = await new Promise<any>((resolve, reject) => {
        const sub = dmk.startDiscovering({}).subscribe({
          next: (d: unknown) => {
            sub.unsubscribe();
            resolve(d);
          },
          error: reject,
        });
      });

      const sessionId = await dmk.connect({ device });
      const signer = new SignerEthBuilder({ dmk, sessionId, originToken: 'subfloor' }).build();

      const result = await settle<{ address: string }>(signer.getAddress(DERIVATION_PATH));
      session.current = { dmk, sessionId, signer };
      setAddress(result.address as Address);
    } catch (e) {
      // A device left locked, or the owner closing the browser prompt, are both ordinary outcomes.
      setError(e instanceof Error ? e.message : 'could not reach the device');
    } finally {
      setConnecting(false);
    }
  }, [supported]);

  const signTypedData = useCallback(async (typedData: unknown) => {
    if (!session.current) return null;
    try {
      const signed = await settle<{ r: string; s: string; v: number }>(
        session.current.signer.signTypedData(DERIVATION_PATH, typedData),
      );
      return `${signed.r}${signed.s.slice(2)}${signed.v.toString(16).padStart(2, '0')}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'the device declined');
      return null;
    }
  }, []);

  return { supported, connecting, address, error, connect, signTypedData };
}
