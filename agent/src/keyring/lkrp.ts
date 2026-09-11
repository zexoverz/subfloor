/**
 * One import shim for the Ledger Key Ring packages, and the reason it exists.
 *
 * Node cannot import these packages by their bare name from an ES module:
 *
 *  1. The `default` export condition points at `lib-es/`, whose files use
 *     extensionless relative imports (`import ... from "./Device"`). Node's ESM
 *     resolver requires the extension, so `import "@ledgerhq/hw-ledger-key-ring-protocol"`
 *     fails with ERR_MODULE_NOT_FOUND on the package's own first line.
 *  2. The exports map declares both `"./lib/*"` and `"./lib/*.js"` mapping to
 *     `"./lib/*.js"`. The first pattern wins, so the natural-looking
 *     `.../lib/index.js` resolves to `lib/index.js.js` and also fails.
 *
 * What does work is the extensionless CommonJS path, `.../lib/index`, which the
 * first pattern rewrites correctly and which Node loads through its CJS interop.
 * Every other file in this package imports from here so that the workaround
 * lives in one place with its explanation attached.
 */
export {
  crypto,
  DerivationPath,
  Permissions,
  SoftwareDevice,
  StreamTree,
  CommandStreamEncoder,
  CommandStreamDecoder,
  TRUSTCHAIN_APP_NAME as KEY_RING_APP_NAME,
  device as deviceFactories,
} from "@ledgerhq/hw-ledger-key-ring-protocol/lib/index";

export type { Device } from "@ledgerhq/hw-ledger-key-ring-protocol/lib/Device";

// Deliberately nothing from `@ledgerhq/ledger-key-ring-protocol` here. Every module in this package
// loads this file, including the ones the house agent needs to open a sealed key, and that package
// depends on a Speculos transport that cannot install from a clean registry. The one thing taken
// from it, the enrollment session cipher, is imported where it is used, in `enroll/cipher.ts`.
