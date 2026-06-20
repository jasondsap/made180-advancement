import type { ReactNode } from "react";
import { EngageTabs } from "@/components/engage/EngageTabs";

export const dynamic = "force-dynamic";

export default function EngageLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.6rem", margin: "0 0 1rem" }}>Engage</h1>
      <EngageTabs />
      {children}
    </div>
  );
}
