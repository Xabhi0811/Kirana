import { test } from "node:test";
import assert from "node:assert/strict";
import { BRAND_NAME, displayMarketplaceName } from "../src/lib/brand";

test("legacy default branding displays as Kirana without rewriting stored names", () => {
  for (const name of [
    "LocalKart",
    "LocalMart",
    "LOCALMART",
    "local-mart",
    "local_mart",
    "Localmart",
  ])
    assert.equal(displayMarketplaceName(name), BRAND_NAME);
});

test("custom marketplace names remain unchanged", () => {
  for (const name of ["Kirana", "Neighbour Store", "LocalMart Partners", ""])
    assert.equal(displayMarketplaceName(name), name);
});
