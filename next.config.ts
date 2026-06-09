import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  // Tunnel origins only in local dev — never in staging/production
  ...(process.env.NODE_ENV === "development" && {
    allowedDevOrigins: ["*.trycloudflare.com", "*.loca.lt"],
  }),
};

export default nextConfig;
