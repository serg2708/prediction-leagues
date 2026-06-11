import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    // Module-load-time env reads (session secret, pool address) need these set
    // before any source module is imported.
    env: {
      SESSION_SECRET: "test-session-secret-at-least-32-chars-long-xx",
      ADMIN_SECRET: "test-admin-secret",
      NEXT_PUBLIC_CHAIN_ID: "84532",
      NEXT_PUBLIC_POOL_ADDRESS: "0x31c0A112F601AB4eE4051085F295421c4AB1892B",
    },
  },
});
