import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import { COUPON_CODE_ALPHABET, generateDistinctShortCouponCodes, generateShortCouponCode, SHORT_COUPON_CODE_PATTERN } from "./couponCode.mjs";

test("short code: 4 characters from an alphabet without 0/O/1/I/L", () => {
  for (const char of "01OIL") assert.equal(COUPON_CODE_ALPHABET.includes(char), false, char);
  for (let index = 0; index < 500; index += 1) {
    const code = generateShortCouponCode(randomInt);
    assert.equal(code.length, 4);
    assert.match(code, SHORT_COUPON_CODE_PATTERN);
  }
  assert.equal(generateShortCouponCode(() => 0), "2222");
});

test("distinct codes avoid duplicates and taken codes; exhausted space fails loudly", () => {
  const codes = generateDistinctShortCouponCodes(100, randomInt, new Set(["2222"]));
  assert.equal(new Set(codes).size, 100);
  assert.equal(codes.includes("2222"), false);
  assert.throws(() => generateDistinctShortCouponCodes(2, () => 0), /COUPON_CODE_SPACE_EXHAUSTED/);
});

test("server and screen use the short code; create retries on a duplicate code", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const create = read("../../app/api/cupones/route.js");
  assert.match(create, /SHORT_COUPON_CODE_PATTERN\.test\(requested\) \? requested : generateShortCouponCode\(randomInt\)/);
  assert.match(create, /if \(error\?\.code !== "23505"\) break;/);
  assert.doesNotMatch(create, /PF-\$\{randomBytes/);
  const batch = read("../../app/api/cupones/lote/route.js");
  assert.match(batch, /generateDistinctShortCouponCodes\(quantity - 1, randomInt, new Set\(\[source\.code\]\)\)/);
  assert.doesNotMatch(batch, /randomBytes/);
  assert.match(read("../../components/cupones/CouponsClient.js"), /const generateCouponCode = \(\) => generateShortCouponCode\(/);
});
