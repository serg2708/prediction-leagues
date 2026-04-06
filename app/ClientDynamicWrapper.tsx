"use client";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// Must live in a Client Component so that ssr: false is allowed
const RootProvider = dynamic(
  () => import("./rootProvider").then((m) => m.RootProvider),
  { ssr: false }
);

export function ClientDynamicWrapper({ children }: { children: ReactNode }) {
  return <RootProvider>{children}</RootProvider>;
}
