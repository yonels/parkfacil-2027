import { createHmac, timingSafeEqual } from "node:crypto";

function canonicalTimestamp(value) {
  const text = value instanceof Date ? value.toISOString() : String(value || "");
  const match = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/i);
  if (!match) throw new Error("INVALID_EVIDENCE_TIMESTAMP");
  return `${match[1]}T${match[2]}.${String(match[3] || "").padEnd(6, "0")}Z`;
}

function textHex(value) {
  return Buffer.from(String(value), "utf8").toString("hex");
}

function canonicalBlocks(blocks = []) {
  return blocks.map((block) => [
    String(block.id).toLowerCase(),
    Number(block.sequence),
    Number(block.durationSeconds),
    Number(block.amount),
    Boolean(block.repeatAfter),
  ].join(",")).join(";");
}

export function canonicalizeWebpayQuoteEvidence(snapshot) {
  return [
    "WEBPAY_STAY_QUOTE_V1",
    String(snapshot.stayId).toLowerCase(),
    canonicalTimestamp(snapshot.stayUpdatedAt),
    canonicalTimestamp(snapshot.calculatedAt),
    String(snapshot.rateId).toLowerCase(),
    canonicalTimestamp(snapshot.rateUpdatedAt),
    textHex(snapshot.rateName),
    textHex(snapshot.billingMode),
    canonicalBlocks(snapshot.rateBlocksSnapshot),
    Number(snapshot.elapsedMinutes),
    Number(snapshot.subtotalAmount),
    Number(snapshot.discountAmount),
    Number(snapshot.netAmount),
    Number(snapshot.taxAmount),
    Number(snapshot.totalAmount),
  ].join("|");
}

export function signWebpayQuoteEvidence(snapshot, secret) {
  if (Buffer.byteLength(String(secret || ""), "utf8") < 32) {
    throw new Error("WEBPAY_QUOTE_HMAC_SECRET_NOT_CONFIGURED");
  }
  return createHmac("sha256", secret)
    .update(canonicalizeWebpayQuoteEvidence(snapshot), "utf8")
    .digest("hex");
}

export function verifyWebpayQuoteEvidence(snapshot, evidence, secret) {
  if (!/^[0-9a-f]{64}$/i.test(String(evidence || ""))) return false;
  const expected = signWebpayQuoteEvidence(snapshot, secret);
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(evidence, "hex"));
}
