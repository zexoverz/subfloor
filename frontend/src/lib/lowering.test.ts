import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { loweringTypes } from './contracts.ts';

/*
 * The struct, pinned against the contract's own typehash string.
 *
 * `FloorRegistry._FLOOR_LOWERING_TYPEHASH` is what the registry recovers the guardian from, so a
 * field renamed, reordered or retyped here produces a signature over different bytes — accepted by
 * the device, refused by the chain, and only discovered after a transaction. Cheap to pin, and the
 * kind of drift nothing else in this app would catch.
 */
const FROM_THE_CONTRACT =
  'FloorLowering(address recipient,address base,address quote,uint16 maxAdverseBps,uint256 absoluteRate,uint256 nonce,uint256 deadline)';

test('the typed data encodes the typehash the registry hashes', () => {
  const fields = loweringTypes.FloorLowering.map((f) => `${f.type} ${f.name}`).join(',');
  assert.equal(`FloorLowering(${fields})`, FROM_THE_CONTRACT);
});

test('the order is the one the contract declares, not alphabetical or convenient', () => {
  assert.deepEqual(
    loweringTypes.FloorLowering.map((f) => f.name),
    ['recipient', 'base', 'quote', 'maxAdverseBps', 'absoluteRate', 'nonce', 'deadline'],
  );
});
