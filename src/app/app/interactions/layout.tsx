import type { ReactNode } from "react";
import { InteractionsTabs } from "@/components/interactions/InteractionsTabs";

export const dynamic = "force-dynamic";

export default function InteractionsLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.6rem", margin: "0 0 1rem" }}>Interactions</h1>
      <InteractionsTabs />
      {children}
    </div>
  );
}
