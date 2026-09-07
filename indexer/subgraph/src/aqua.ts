import { Shipped, Docked, Pulled, Pushed } from "../generated/Aqua/Aqua";
import { getProtocol, getToken } from "./shared";

/// Aqua's four events carry the position lifecycle. None of their parameters is indexed, so every
/// maker and every app on the venue arrives here and is narrowed after decoding — see
/// docs/event-map.md. The narrowing is deliberately not done yet: the vault address is not deployed,
/// and hardcoding a placeholder would silently drop everything once it is.
export function handleShipped(event: Shipped): void {
  getProtocol(event.block);
  // event.params.strategy carries the SwapVM program bytecode. The decoder lands with the
  // program-step entities; until then the blob is left unparsed rather than half-parsed.
  const app = event.params.app;
  if (app.toHexString().length == 0) return;
}

export function handleDocked(event: Docked): void {
  getProtocol(event.block);
  const app = event.params.app;
  if (app.toHexString().length == 0) return;
}

export function handlePulled(event: Pulled): void {
  getToken(event.params.token, event.block);
}

export function handlePushed(event: Pushed): void {
  getToken(event.params.token, event.block);
}
