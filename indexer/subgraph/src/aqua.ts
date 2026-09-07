import { Bytes, ethereum, BigInt } from "@graphprotocol/graph-ts";
import { Shipped, Docked, Pulled, Pushed } from "../generated/Aqua/Aqua";
import { Maker, Strategy, StrategyStep } from "../generated/schema";
import { classify, decode, familiesOf, unwrapShipped } from "./decoder";
import { getProtocol, getToken } from "./shared";

/// Aqua's four events carry the position lifecycle. None of their parameters is indexed, so every
/// maker and every app on the venue arrives here and is recorded rather than filtered — see
/// docs/event-map.md. Narrowing to one vault is a query, which is what makes this index usable by
/// anyone building on Aqua instead of only by us.

function strategyId(maker: Bytes, app: Bytes, hash: Bytes): Bytes {
  return Bytes.fromHexString(maker.toHexString()).concat(Bytes.fromHexString(app.toHexString())).concat(hash);
}

function getMaker(address: Bytes, block: ethereum.Block): Maker {
  const id = Bytes.fromHexString(address.toHexString());
  let m = Maker.load(id);
  if (m == null) {
    m = new Maker(id);
    m.strategiesShipped = 0;
    m.strategiesActive = 0;
    m.firstSeenTimestamp = block.timestamp;
  }
  m.lastUpdateTimestamp = block.timestamp;
  return m;
}

export function handleShipped(event: Shipped): void {
  getProtocol(event.block);

  const maker = getMaker(event.params.maker, event.block);
  const id = strategyId(event.params.maker, event.params.app, event.params.strategyHash);

  // Aqua rejects a re-ship of a live strategy (StrategiesMustBeImmutable), but a docked one can be
  // shipped again under the same hash, so this reactivates rather than assuming the row is new.
  let s = Strategy.load(id);
  const isNew = s == null;
  if (s == null) s = new Strategy(id);

  // What Aqua carries is not the program. `AquaGuardVault.ship` sends `abi.encode(order)` and the
  // program sits in the Order's `data` field, so decoding the blob directly reads the maker address
  // as instructions.
  const shipped = unwrapShipped(event.params.strategy);
  const program = shipped.program;
  const decoded = decode(program);
  const families = familiesOf(decoded.steps);

  s.maker = maker.id;
  s.app = Bytes.fromHexString(event.params.app.toHexString());
  s.strategyHash = event.params.strategyHash;
  s.program = program;
  s.programWrappedInOrder = shipped.wrappedInOrder;
  s.families = families;
  s.classification = classify(families);
  s.stepCount = decoded.steps.length;
  s.decodeError = decoded.error;
  s.active = true;
  s.shippedTimestamp = event.block.timestamp;
  s.shippedBlock = event.block.number;
  s.dockedTimestamp = null;
  s.dockedBlock = null;
  s.save();

  for (let i = 0; i < decoded.steps.length; i++) {
    const step = new StrategyStep(id.concatI32(i));
    step.strategy = s.id;
    step.index = i;
    step.opcode = decoded.steps[i].opcode;
    step.name = decoded.steps[i].name;
    step.args = decoded.steps[i].args;
    step.save();
  }

  if (isNew) maker.strategiesShipped = maker.strategiesShipped + 1;
  maker.strategiesActive = maker.strategiesActive + 1;
  maker.save();
}

export function handleDocked(event: Docked): void {
  getProtocol(event.block);

  const id = strategyId(event.params.maker, event.params.app, event.params.strategyHash);
  const s = Strategy.load(id);
  // A dock for a strategy this subgraph never saw shipped is possible whenever the start block sits
  // after the ship. Recording nothing is right: inventing a Strategy row with no program in it would
  // put an undecodable strategy into an index whose whole point is that programs are decoded.
  if (s == null) return;

  s.active = false;
  s.dockedTimestamp = event.block.timestamp;
  s.dockedBlock = event.block.number;
  s.save();

  const maker = getMaker(event.params.maker, event.block);
  if (maker.strategiesActive > 0) maker.strategiesActive = maker.strategiesActive - 1;
  maker.save();
}

export function handlePulled(event: Pulled): void {
  getToken(event.params.token, event.block);
}

export function handlePushed(event: Pushed): void {
  getToken(event.params.token, event.block);
}
