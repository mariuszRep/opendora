import type { NextConfig } from "next";

const BACKEND_URL = process.env.NEXT_PUBLIC_PROJECTFLOWS_URL ?? "http://localhost:4097"
const isEmbeddedBuild = process.env.PROJECTFLOWS_EMBEDDED === "1"

const nextConfig: NextConfig = {
  transpilePackages: ["@projectflows/workflow"],
  ...(isEmbeddedBuild
    ? { output: "export", trailingSlash: true }
    : {
        async rewrites() {
          return [{ source: "/api/:path*", destination: `${BACKEND_URL}/:path*` }]
        },
      }),
};

export default nextConfig;
