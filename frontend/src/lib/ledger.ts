import { useCallback, useEffect, useRef, useState } from 'react';
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

/**
 * What we can honestly say about the device before anyone presses anything.
 *
 * `unsupported` is definite: the browser has no WebHID at all. `paired` means a Ledger has already
 * been granted to this origin and is attached. `unknown` is the honest answer everywhere else —
 * WebHID will not enumerate an unpaired device without a user gesture, so a device sitting plugged
 * in and a drawer with nothing in it look identical from here, and the screen must not pretend
 * otherwise.
 */
export type Presence = 'unsupported' | 'unknown' | 'paired';

const LEDGER_VENDOR_ID = 0x2c97;

export type Ledger = {
  supported: boolean;
  presence: Presence;
  connecting: boolean;
  address: Address | null;
  error: string | null;
  /**
   * Returns the address it read, as well as storing it.
   *
   * A caller that awaits connect() and then looks at `address` sees the value from the render it
   * was created in, not the one just fetched — React state does not update inside the closure that
   * asked for it. Returning it is what lets "read it from my device" fill a field.
   */
  connect: () => Promise<Address | null>;
  /** Hand the device back, so other apps on the machine can open it. */
  release: () => Promise<void>;
  signTypedData: (typedData: unknown, onStep?: (step: string) => void) => Promise<string | null>;
};

type Session = { dmk: any; sessionId: string; signer: any };

export function useLedger(): Ledger {
  const [address, setAddress] = useState<Address | null>(null);
  const [presence, setPresence] = useState<Presence>('unknown');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<Session | null>(null);

  // WebHID is Chromium-only, and saying so beats a button that silently does nothing in Firefox.
  const supported = typeof navigator !== 'undefined' && 'hid' in navigator;

  /**
   * Enumerated on load, before the ceremony is offered. §10 is explicit that the device-absent
   * state must be known up front rather than discovered by a user who has already filled in a form.
   */
  useEffect(() => {
    if (!supported) {
      setPresence('unsupported');
      return;
    }

    const hid = (navigator as Navigator & { hid: { getDevices: () => Promise<{ vendorId: number }[]>; addEventListener: Function; removeEventListener: Function } }).hid;

    const look = async () => {
      try {
        const devices = await hid.getDevices();
        setPresence(devices.some((d) => d.vendorId === LEDGER_VENDOR_ID) ? 'paired' : 'unknown');
      } catch {
        setPresence('unknown');
      }
    };

    void look();
    // Plugging in or unplugging a paired device changes the answer while the page is open.
    hid.addEventListener('connect', look);
    hid.addEventListener('disconnect', look);
    return () => {
      hid.removeEventListener('connect', look);
      hid.removeEventListener('disconnect', look);
    };
  }, [supported]);

  /** The device actions report progress on an observable; this waits for the terminal state. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rxjs subscribe has overloads the
  // narrow shape below cannot satisfy; the state object is validated at runtime instead.
  const settle = <T,>(
    action: { observable: { subscribe: (o: any) => unknown } },
    onStep?: (step: string) => void,
  ): Promise<T> =>
    new Promise((resolve, reject) => {
      /*
       * A device is allowed to be slow — someone reading four lines on a small screen is not to be
       * hurried — but an action that never emits at all is not slowness. A malformed payload dies
       * inside the observable and simply stops, and without this the screen waits on approval the
       * hardware was never asked for. Two minutes is longer than any real approval and shorter
       * than forever.
       */
      const gaveUp = setTimeout(
        () => reject(new Error('the device did not answer — is the Ethereum app open on it?')),
        120_000,
      );
      const done = <R,>(fn: (v: R) => void) => (v: R) => {
        clearTimeout(gaveUp);
        fn(v);
      };
      resolve = done(resolve);
      reject = done(reject);
      action.observable.subscribe({
        next: (state: { status: string; output?: T; error?: unknown; intermediateValue?: { step?: string } }) => {
          // The kit names the step it is on. Reporting it is the difference between "waiting" and
          // "waiting on the metadata service", which are not the same problem.
          if (state.intermediateValue?.step) onStep?.(state.intermediateValue.step);
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
      return null;
    }
    /*
     * Reuse the session rather than building a second kit.
     *
     * Each call used to construct a fresh DeviceManagementKit and start its own discovery. The
     * first one opens the device and keeps it — WebHID hands out an exclusive handle — so the
     * second kit discovers nothing, its promise never resolves, and the caller waits forever on an
     * address that was already sitting in the first session. The logs showed exactly that: a live
     * session polling getAppAndVersion happily, and no GetAddress APDU behind it.
     */
    if (session.current) {
      try {
        const known = await settle<{ address: string }>(session.current.signer.getAddress(DERIVATION_PATH));
        setAddress(known.address as Address);
        return known.address as Address;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'the device stopped answering');
        return null;
      }
    }
    // A second press while the first is still discovering would do the same damage.
    if (connecting) return null;

    setConnecting(true);
    setError(null);

    try {
      const [{ DeviceManagementKitBuilder }, { webHidTransportFactory }, { SignerEthBuilder }] = await Promise.all([
        import('@ledgerhq/device-management-kit'),
        import('@ledgerhq/device-transport-kit-web-hid'),
        import('@ledgerhq/device-signer-kit-ethereum'),
      ]);

      /*
       * The kit reports what it is doing through a logger, and without one every failure inside it
       * — a transport that will not open, a context lookup that 404s, an APDU the app rejects —
       * surfaces here as a promise that never settles. In dev that silence cost several rounds of
       * guessing at internals, so it now says so out loud.
       */
      const builder = new DeviceManagementKitBuilder().addTransport(webHidTransportFactory);
      if (import.meta.env?.DEV) {
        builder.addLogger({
          log: (level: unknown, message: unknown, options: unknown) =>
            console.info('[ledger]', level, message, options),
        } as never);
      }
      const dmk = builder.build();

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
      return result.address as Address;
    } catch (e) {
      // A device left locked, or the owner closing the browser prompt, are both ordinary outcomes.
      setError(e instanceof Error ? e.message : 'could not reach the device');
    } finally {
      setConnecting(false);
    }
    return null;
  }, [supported, connecting]);

  /**
   * Give the device back.
   *
   * WebHID hands out an exclusive handle: while this page holds the Ledger, nothing else on the
   * machine can open it — MetaMask lists it and greys out Connect, Ledger Live sees nothing. We
   * were opening it and never closing it, so one visit to the setup sheet took the device hostage
   * for the life of the tab.
   *
   * Called on unmount as well as by hand, because the common way to leave this screen is to
   * navigate away rather than to press anything.
   */
  const release = useCallback(async () => {
    const open = session.current;
    if (!open) return;
    session.current = null;
    setAddress(null);
    try {
      await open.dmk.disconnect({ sessionId: open.sessionId });
    } catch {
      // Already gone — unplugged, or the browser reclaimed it. Nothing to report.
    }
    try {
      await open.dmk.close?.();
    } catch {
      // Older kits have no close(); disconnect alone frees the handle there.
    }
  }, []);

  // Leaving the page is the usual exit, so the handle has to be freed there and not only on a press.
  useEffect(() => () => void release(), [release]);

  const signTypedData = useCallback(async (typedData: unknown, onStep?: (step: string) => void) => {
    if (!session.current) {
      // Not a decline. Nothing was asked, and reporting it as one taught the owner that their
      // device had refused something it had never been shown.
      setError('no device is paired — connect it first');
      return null;
    }
    if (!typedData) {
      setError('there is nothing to sign yet');
      return null;
    }
    try {
      /*
       * The builder can throw before it returns an action at all — a payload it cannot encode
       * fails here, synchronously, with no observable to carry the error. Wrapping only the stream
       * left that throw to escape as an unhandled rejection while the screen went on waiting.
       */
      const action = session.current.signer.signTypedData(DERIVATION_PATH, typedData);
      const signed = await settle<{ r: string; s: string; v: number }>(action, onStep);
      return `${signed.r}${signed.s.slice(2)}${signed.v.toString(16).padStart(2, '0')}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'the device declined');
      return null;
    }
  }, []);

  return { supported, presence, connecting, address, error, connect, release, signTypedData };
}
