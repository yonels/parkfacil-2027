import "server-only";
import { headers } from "next/headers";
import { getAuthenticatedContext } from "@/lib/auth/authenticatedContext";

export async function getCurrentServerContext() {
  const requestHeaders = await headers();
  return getAuthenticatedContext({ headers: requestHeaders });
}
