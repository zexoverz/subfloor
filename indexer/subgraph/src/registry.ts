import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  FloorRaised,
  FloorLowered,
  ToleranceTightened,
  ToleranceWidened,
} from "../generated/FloorRegistry/FloorRegistry";
import { Floor, FloorChange } from "../generated/schema";
import { eventId, getToken, ZERO_BI } from "./shared";

function loadFloor(recipient: Address, base: Address, quote: Address, event: ethereum.Event): Floor {
  const baseToken = getToken(base, event.block);
  const quoteToken = getToken(quote, event.block);
  const id = Bytes.fromHexString(recipient.toHexString()).concat(baseToken.id).concat(quoteToken.id);

  let f = Floor.load(id);
  if (!f) {
    f = new Floor(id);
    f.recipient = recipient;
    f.base = baseToken.id;
    f.quote = quoteToken.id;
    // 10000 bps is "no relative protection", which is what an unconfigured pair means.
    f.maxAdverseBps = 10000;
    f.absoluteRate = ZERO_BI;
  }
  f.updatedAtBlock = event.block.number;
  f.updatedAt = event.block.timestamp;
  const out = f as Floor;
  return out;
}

export function handleFloorRaised(event: FloorRaised): void {
  const f = loadFloor(event.params.recipient, event.params.base, event.params.quote, event);

  const c = new FloorChange(eventId(event));
  c.floor = f.id;
  c.kind = "RAISED";
  c.oldMaxAdverseBps = f.maxAdverseBps;
  c.newMaxAdverseBps = f.maxAdverseBps;
  c.oldAbsoluteRate = event.params.oldFloor;
  c.newAbsoluteRate = event.params.newFloor;
  c.guardian = null; // a raise needs no signature, and recording one would be a lie
  c.hash = event.transaction.hash;
  c.blockNumber = event.block.number;
  c.timestamp = event.block.timestamp;
  c.save();

  f.absoluteRate = event.params.newFloor;
  f.save();
}

export function handleFloorLowered(event: FloorLowered): void {
  const f = loadFloor(event.params.recipient, event.params.base, event.params.quote, event);

  const c = new FloorChange(eventId(event));
  c.floor = f.id;
  c.kind = "LOWERED";
  c.oldMaxAdverseBps = f.maxAdverseBps;
  c.newMaxAdverseBps = f.maxAdverseBps;
  c.oldAbsoluteRate = event.params.oldFloor;
  c.newAbsoluteRate = event.params.newFloor;
  // The guardian that signed it. This is the field the floor-history screen puts a device icon on.
  c.guardian = event.params.guardian;
  c.hash = event.transaction.hash;
  c.blockNumber = event.block.number;
  c.timestamp = event.block.timestamp;
  c.save();

  f.absoluteRate = event.params.newFloor;
  f.save();
}

export function handleToleranceTightened(event: ToleranceTightened): void {
  const f = loadFloor(event.params.recipient, event.params.base, event.params.quote, event);

  const c = new FloorChange(eventId(event));
  c.floor = f.id;
  c.kind = "RAISED";
  c.oldMaxAdverseBps = event.params.oldMaxAdverseBps;
  c.newMaxAdverseBps = event.params.newMaxAdverseBps;
  c.oldAbsoluteRate = f.absoluteRate;
  c.newAbsoluteRate = f.absoluteRate;
  c.guardian = null;
  c.hash = event.transaction.hash;
  c.blockNumber = event.block.number;
  c.timestamp = event.block.timestamp;
  c.save();

  f.maxAdverseBps = event.params.newMaxAdverseBps;
  f.save();
}

export function handleToleranceWidened(event: ToleranceWidened): void {
  const f = loadFloor(event.params.recipient, event.params.base, event.params.quote, event);

  const c = new FloorChange(eventId(event));
  c.floor = f.id;
  c.kind = "LOWERED";
  c.oldMaxAdverseBps = event.params.oldMaxAdverseBps;
  c.newMaxAdverseBps = event.params.newMaxAdverseBps;
  c.oldAbsoluteRate = f.absoluteRate;
  c.newAbsoluteRate = f.absoluteRate;
  c.guardian = event.params.guardian;
  c.hash = event.transaction.hash;
  c.blockNumber = event.block.number;
  c.timestamp = event.block.timestamp;
  c.save();

  f.maxAdverseBps = event.params.newMaxAdverseBps;
  f.save();
}
