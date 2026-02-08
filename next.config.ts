import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,

  typescript: {
    // ⚠️ Allows build to succeed even if there are TS errors
    ignoreBuildErrors: true,
  },

  eslint: {
    // ⚠️ Allows build to succeed even if there are lint errors
    ignoreDuringBuilds: true,
  },

  experimental: {
    turbo: {
      unstable_skipDevServer: false,
    },
  },
};

export default nextConfig;
