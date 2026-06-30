import type { NextConfig } from "next";

const BACKEND_URL = process.env.NEXT_PUBLIC_PROJECTFLOWS_URL ?? "http://localhost:4097"

const nextConfig: NextConfig = {
transpilePackages: ["@projectflows/workflow"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/:path*`,
      },
    ]
  },
};

export default nextConfig;
