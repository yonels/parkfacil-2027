import { timingSafeEqual } from "node:crypto";

export function isInternalServiceKeyValid(received, expected) {
  const sent = String(received || "");
  const configured = String(expected || "");
  if (!sent || !configured || sent.length !== configured.length) return false;
  return timingSafeEqual(Buffer.from(sent), Buffer.from(configured));
}
