import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* cacheComponents intentionally disabled: the API route uses the
     classic `runtime` / `dynamic` / `maxDuration` segment configs,
     which are incompatible with cacheComponents. */
};

export default nextConfig;
