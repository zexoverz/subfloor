import { test } from "node:test";
import assert from "node:assert/strict";
import { headersFor, publicEndpoint, STUDIO_ENDPOINT } from "./subgraph.ts";

const KEY = "0123456789abcdef0123456789abcdef";

test("the key goes to the gateway as a bearer header", () => {
  assert.deepEqual(headersFor("https://gateway.thegraph.com/api/subgraphs/id/abc", KEY), { authorization: `Bearer ${KEY}` });
});

test("the key never goes to Studio or anywhere else", () => {
  assert.deepEqual(headersFor(STUDIO_ENDPOINT, KEY), {});
  assert.deepEqual(headersFor("https://gateway.thegraph.com.evil.example/api", KEY), {});
  assert.deepEqual(headersFor("not a url", KEY), {});
});

test("no key, no header", () => {
  assert.deepEqual(headersFor("https://gateway.thegraph.com/api/subgraphs/id/abc", undefined), {});
});

test("a key in the path is masked before anything prints it", () => {
  assert.equal(
    publicEndpoint(`https://gateway.thegraph.com/api/${KEY}/subgraphs/id/abc`),
    "https://gateway.thegraph.com/api/<key>/subgraphs/id/abc",
  );
  assert.equal(publicEndpoint(STUDIO_ENDPOINT), STUDIO_ENDPOINT);
});
