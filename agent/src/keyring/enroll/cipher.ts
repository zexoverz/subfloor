import { makeCipher } from "../lkrp.ts";
import type { Encrypted, EnrollmentMessage } from "./protocol.ts";

/**
 * The session cipher, over Ledger's own implementation.
 *
 * `makeCipher` is the SDK's (`qrcode/cipher.ts`): a random 16-byte nonce
 * prepended to AES-GCM output, base64. We use it as-is and do not write a
 * cipher. What we do not use is the SDK's `makeMessageCipher`, whose types are
 * bound to Ledger Sync's own message union, so passing our message names
 * through it does not typecheck. This is that wrapper, over our union.
 */
export type SessionCipher = {
  seal<T extends object>(payload: T): Encrypted<T>;
  open<T>(message: EnrollmentMessage): T;
};

export function sessionCipher(sessionKey: Uint8Array): SessionCipher {
  const cipher = makeCipher(sessionKey);
  return {
    seal<T extends object>(payload: T): Encrypted<T> {
      return { encrypted: cipher.encrypt(payload) };
    },
    open<T>(message: EnrollmentMessage): T {
      if (message.message === "InitiateHandshake" || message.message === "Failure") {
        throw new Error(`${message.message} is not encrypted`);
      }
      return cipher.decrypt(message.payload.encrypted) as T;
    },
  };
}
