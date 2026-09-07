import { Bytes } from "@graphprotocol/graph-ts";
import { AnswerUpdated } from "../generated/ChainlinkEthUsd/ChainlinkAggregator";
import { ReferenceAnswer } from "../generated/schema";
import { ETH_USD } from "./shared";

/// Indexes the reference forward so a fill can be scored against the answer that was current when
/// it settled. A subgraph cannot call `latestRoundData` at a historical block, so this is the only
/// way to score a fill against the same number the contract scored it against.
export function handleAnswerUpdated(event: AnswerUpdated): void {
  // Keyed by what the feed *is*, not by where it lives. The address goes in a field, so a consumer
  // reads the same row on every network instead of carrying a per-chain constant.
  let r = ReferenceAnswer.load(ETH_USD);
  if (!r) r = new ReferenceAnswer(ETH_USD);

  r.aggregator = Bytes.fromHexString(event.address.toHexString());
  r.answer = event.params.current;
  // The feed's own timestamp, not the block's. Staleness is measured against what the feed says it
  // last updated, which is what FloorRegistry compares too.
  r.updatedAt = event.params.updatedAt;
  r.roundId = event.params.roundId;
  r.blockNumber = event.block.number;
  r.save();
}
