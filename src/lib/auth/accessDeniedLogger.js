import "server-only";
import { createDeniedAccessEvent } from "@/lib/auth/accessDeniedCore.mjs";

export function logDeniedAccess({ request, context, error }) {
  const event = createDeniedAccessEvent({ request, context, error });
  console.warn(JSON.stringify(event));
  return event;
}
