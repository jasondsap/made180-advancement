import type { ReactNode } from "react";
import { TidingsTabs } from "@/components/tidings/TidingsTabs";

export const dynamic = "force-dynamic";

export default function TidingsLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.6rem", margin: "0 0 1rem" }}>Tidings</h1>
      <TidingsTabs />
      {children}
    </div>
  );
}
