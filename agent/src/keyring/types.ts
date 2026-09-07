/**
 * Vocabulary note, and it is a hard rule for this package.
 *
 * The Ledger prize track talks about the Key Ring and about ring revocation. It
 * never uses the word the SDK's own type names use. Where a type below wraps a
 * value that comes out of `@ledgerhq/ledger-key-ring-protocol`, the wrapper is
 * named for the ring, and the SDK's naming stops at the import line.
 */

/** A member's keypair. The private half never leaves the host that generated it. */
export type MemberCredentials = {
  /** secp256k1 compressed public key, hex. This is the member's identity. */
  pubkey: string;
  /** secp256k1 private key, hex. Local to one host, never transmitted. */
  privatekey: string;
};

/** A member as the ring records it. */
export type RingMember = {
  /** equals MemberCredentials.pubkey */
  id: string;
  name: string;
  permissions: number;
};

/**
 * Everything a host needs to find its slot in the ring. Note what is absent:
 * the ring encryption key. That is derived at use from the ring blocks plus the
 * host's own member private key, and it is never written down.
 */
export type RingDescriptor = {
  /** hash of the ring's root block, hex. Stable for the life of the ring. */
  rootId: string;
  /**
   * Derivation path of the live application branch, e.g. `m/0'/16'/0'`. Every
   * ring revocation closes the current branch and moves this one index along,
   * which is what makes the old branch's key unreachable to a removed member.
   */
  applicationPath: string;
};

/** The sealed delegate secret as it sits on the agent host's disk. */
export type SealedSecret = {
  version: 1;
  /** which ring, and which branch of it, this ciphertext belongs to */
  ring: RingDescriptor;
  /** which member sealed it, for diagnostics only */
  sealedBy: string;
  /** scope label, mirroring `wallet-cli ring encrypt --key` */
  key: string;
  /** base64 of the AES-GCM output produced by the SDK's crypto */
  ciphertext: string;
  sealedAt: string;
};
