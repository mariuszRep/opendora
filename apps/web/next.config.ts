import type { NextConfig } from "next";

const BACKEND_URL = process.env.NEXT_PUBLIC_PROJECTFLOWS_URL ?? "http://localhost:4097"
const isEmbeddedBuild = process.env.PROJECTFLOWS_EMBEDDED === "1"

// `output: "export"` is the canonical production artifact shared by the embedded
// single-binary CLI distribution, the Electron desktop wrapper, and the Capacitor
// Android wrapper (see .projectflows/goals/done/shared-static-export-release-foundation).
// It stays gated behind PROJECTFLOWS_EMBEDDED because it is incompatible with the
// rewrites() dev proxy that `bun dev` / `bun dev:ui` use to reach the local backend
// at :4097 — a static export has no server to rewrite through. Run
// `bun run build:export` (sets PROJECTFLOWS_EMBEDDED=1) to produce apps/web/out/.
const nextConfig: NextConfig = {
  transpilePackages: ["@projectflows/workflow"],
  // Required for output:"export" (no Image Optimization server in a static export).
  // Kept on unconditionally so dev and the production export behave identically —
  // avoids "works in dev, breaks in export" drift.
  images: { unoptimized: true },
  ...(isEmbeddedBuild
    ? { output: "export", trailingSlash: true }
    : {
        async rewrites() {
          return [{ source: "/api/:path*", destination: `${BACKEND_URL}/:path*` }]
        },
      }),
};

export default nextConfig;
