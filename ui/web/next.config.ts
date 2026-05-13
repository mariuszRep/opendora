import type { NextConfig } from "next";

const BACKEND_URL = process.env.NEXT_PUBLIC_OPENDORA_URL ?? "http://localhost:4097"

const nextConfig: NextConfig = {
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
