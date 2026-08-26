/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_PARKFACIL_BUILD:
      process.env.NEXT_PUBLIC_PARKFACIL_BUILD ||
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
      `0.1.0-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`,
  },
};

export default nextConfig;
