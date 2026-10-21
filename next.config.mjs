import { recoveryReadiness } from "./src/lib/passwordRecoveryReadiness.mjs";
import { couponsEnabled } from "./src/lib/cupones/couponsAvailability.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_PARKFACIL_BUILD:
      process.env.NEXT_PUBLIC_PARKFACIL_BUILD ||
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
      `0.1.0-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`,
    // Cupones (SOL-2026-10-19-001): ocultos en producción hasta el canje en el POS.
    NEXT_PUBLIC_COUPONS_ENABLED: String(couponsEnabled(process.env)),
  },
};

export default function configureNext(phase) {
  if (process.env.VERCEL === "1" && phase === "phase-production-build") {
    const result = recoveryReadiness();
    if (!result.ok) throw new Error(`[access-readiness] BLOCKED: ${result.problems.join(", ")}`);
  }
  return nextConfig;
}
