import { BigInt, Bytes, log } from "@graphprotocol/graph-ts";

/// Trigger handler for the Substreams-powered variant.
///
/// The module's output is a protobuf message rather than a log, because a refused fill is a revert
/// and reverted transactions emit no logs at all. This handler exists to answer one question the
/// spike is about — whether Studio accepts a `kind: substreams` data source at all — so it counts
/// what arrives rather than decoding it. The decoding already exists in the Rust module.
export function handleRefusals(bytes: Uint8Array): void {
  log.info("substreams trigger delivered {} bytes", [bytes.length.toString()]);
}
