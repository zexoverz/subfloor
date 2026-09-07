import {
  crypto,
  DerivationPath,
  Permissions,
  SoftwareDevice,
  StreamTree,
} from "./lkrp.ts";
import type { Device } from "./lkrp.ts";
import { toKeyPair } from "./credentials.ts";
import type { MemberCredentials, RingDescriptor, RingMember } from "./types.ts";

/**
 * SUBFLOOR's application id inside the ring. Ledger Sync uses its own; a second
 * application id gives the agent its own branch, so revoking the agent does not
 * disturb the owner's Ledger Sync members.
 */
export const SUBFLOOR_APPLICATION_ID = 16;

/**
 * The ring blocks, as they are stored and moved between hosts.
 *
 * This is exactly `StreamTree.serialize()`: a map from derivation path to the
 * hex-encoded, signed command stream at that path. Every block in it is signed
 * with real secp256k1 by whichever device issued it. Nothing here is secret —
 * the key material inside is encrypted to each member's public key — which is
 * why Ledger's own backend is happy to serve it to any authenticated member.
 */
export type RingBlocks = Record<string, string>;

/** Where a host keeps the ring blocks. */
export interface RingStore {
  read(): Promise<RingBlocks | null>;
  write(blocks: RingBlocks): Promise<void>;
}

export class InMemoryRingStore implements RingStore {
  #blocks: RingBlocks | null = null;
  async read(): Promise<RingBlocks | null> {
    return this.#blocks;
  }
  async write(blocks: RingBlocks): Promise<void> {
    this.#blocks = blocks;
  }
}

/** Thrown when a host asks the ring for a key it is no longer entitled to. */
export class NotARingMember extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotARingMember";
  }
}

/**
 * A Ledger Key Ring, held as blocks and operated on locally.
 *
 * Every operation below runs the real protocol from
 * `@ledgerhq/hw-ledger-key-ring-protocol` — the same StreamTree, the same
 * SoftwareDevice, the same signatures that `@ledgerhq/ledger-key-ring-protocol`
 * drives when Ledger Live talks to LKRP. What this class replaces is only
 * LKRP's hosted block store, so that enrollment and revocation can be exercised
 * on a laptop with no account and no network. Swap `RingStore` for the SDK's
 * `SDK` class and the block movements go to Ledger's backend unchanged.
 */
export class Ring {
  #tree: StreamTree;
  #applicationId: number;

  private constructor(tree: StreamTree, applicationId: number) {
    this.#tree = tree;
    this.#applicationId = applicationId;
  }

  /**
   * Create a ring.
   *
   * HARDWARE. This is the one operation the protocol roots in a device: the
   * seed block is signed by `owner`, and in production `owner` is the Ledger.
   * `SDK.getOrCreateTrustchain` routes exactly this call through
   * `hwDeviceProvider.withHw` (sdk.ts:137). Pass a Speculos-backed device to
   * run it without physical hardware, or a SoftwareDevice to run it in tests.
   */
  static async create(
    owner: Device,
    ownerId: Uint8Array,
    ownerName: string,
    applicationId: number = SUBFLOOR_APPLICATION_ID,
  ): Promise<Ring> {
    let tree = await StreamTree.createNewTree(owner, {});
    const path = tree.getApplicationRootPath(applicationId);
    tree = await tree.share(path, owner, ownerId, ownerName, Permissions.OWNER);
    return new Ring(tree, applicationId);
  }

  static fromBlocks(blocks: RingBlocks, applicationId: number = SUBFLOOR_APPLICATION_ID): Ring {
    return new Ring(StreamTree.deserialize(blocks), applicationId);
  }

  static async load(
    store: RingStore,
    applicationId: number = SUBFLOOR_APPLICATION_ID,
  ): Promise<Ring> {
    const blocks = await store.read();
    if (!blocks) throw new Error("no ring on this host; enroll it first");
    return Ring.fromBlocks(blocks, applicationId);
  }

  toBlocks(): RingBlocks {
    return this.#tree.serialize();
  }

  save(store: RingStore): Promise<void> {
    return store.write(this.toBlocks());
  }

  /** Path of the live branch. Moves on every ring revocation. */
  get applicationPath(): string {
    return this.#tree.getApplicationRootPath(this.#applicationId);
  }

  get rootId(): string {
    return crypto.to_hex(this.#tree.getRoot().getRootHash());
  }

  descriptor(): RingDescriptor {
    return { rootId: this.rootId, applicationPath: this.applicationPath };
  }

  async members(): Promise<RingMember[]> {
    const branch = this.#tree.getChild(this.applicationPath);
    if (!branch) return [];
    const resolved = await branch.resolve();
    return resolved.getMembersData();
  }

  async isMember(pubkeyHex: string): Promise<boolean> {
    return (await this.members()).some((m) => m.id === pubkeyHex);
  }

  /**
   * Add a member.
   *
   * NO HARDWARE. `by` is any existing member's credentials; the SDK does the
   * same thing, building a SoftwareDevice from the caller's own credentials
   * (`getSoftwareDevice(memberCredentials)`, sdk.ts:332) rather than reaching
   * for the device provider. This is what makes remote enrollment possible at
   * all, and it is the asymmetry the whole design leans on: joining the ring is
   * cheap, leaving it costs a device.
   */
  async addMember(by: MemberCredentials, member: RingMember): Promise<Ring> {
    if (!(await this.isMember(by.pubkey))) {
      throw new NotARingMember(`${short(by.pubkey)} cannot add members: not in the ring`);
    }
    if (await this.isMember(member.id)) return this;
    const device = new SoftwareDevice(toKeyPair(by));
    const tree = await this.#tree.share(
      this.applicationPath,
      device,
      crypto.from_hex(member.id),
      member.name,
      member.permissions,
    );
    return new Ring(tree, this.#applicationId);
  }

  /**
   * Derive this host's copy of the ring encryption key.
   *
   * NO HARDWARE, and no stored key either. The key is unwrapped from the ring
   * blocks using the host's own member private key, at the moment it is needed,
   * and thrown away after. A host that has been revoked reaches this line and
   * gets NotARingMember, because the current branch carries no key wrapped to
   * its public key.
   */
  async ringKey(credentials: MemberCredentials): Promise<Uint8Array> {
    const device = new SoftwareDevice(toKeyPair(credentials));
    const path = DerivationPath.toIndexArray(this.applicationPath);
    try {
      const key = await device.readKey(this.#tree, path);
      // The stream stores an xpriv; the private half is the first 32 bytes, and
      // that is what the SDK uses as the encryption key (sdk.ts:501).
      return key.slice(0, 32);
    } catch (e) {
      throw new NotARingMember(
        `${short(credentials.pubkey)} cannot derive the ring key on ${this.applicationPath}: ` +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }

  /**
   * Ring revocation. The kill switch.
   *
   * HARDWARE. Closing the live branch is signed by `owner`, and in production
   * `owner` is the Ledger. The SDK routes the equivalent close through
   * `hwDeviceProvider.withHw` and says why in a source comment: "We close the
   * current trustchain with the hardware wallet in order to get a user
   * confirmation of the action" (sdk.ts:271). A compromised agent host holds a
   * member credential and no device, so it cannot revoke anybody, including the
   * owner.
   *
   * The mechanism, in order: close the live branch, derive the next one, and
   * republish the key to every member except the revoked one. The revoked
   * member's public key never appears on the new branch, so there is no wrapped
   * copy of the new key it can open.
   *
   * What this does NOT do, and the README says so too: it does not reach into
   * the revoked host and erase what it already read. Anything sealed under the
   * old branch key stays readable to whoever cached that key. That is why
   * `revoke` returns the new ring and the caller is expected to re-seal.
   */
  async revoke(owner: Device, memberId: string): Promise<Ring> {
    const current = await this.members();
    if (!current.some((m) => m.id === memberId)) {
      throw new Error(`${short(memberId)} is not a member; nothing to revoke`);
    }
    const survivors = current.filter((m) => m.id !== memberId);
    if (survivors.length === 0) {
      throw new Error("refusing to revoke the last member: that destroys the ring, not a member");
    }

    const oldPath = this.applicationPath;
    const newPath = this.#tree.getApplicationRootPath(this.#applicationId, 1);

    let tree = await this.#tree.close(oldPath, owner);
    for (const m of survivors) {
      tree = await tree.share(
        newPath,
        owner,
        crypto.from_hex(m.id),
        m.name,
        m.permissions,
      );
    }
    return new Ring(tree, this.#applicationId);
  }
}

function short(hex: string): string {
  return hex.length > 12 ? `${hex.slice(0, 8)}…${hex.slice(-4)}` : hex;
}

export { Permissions };
