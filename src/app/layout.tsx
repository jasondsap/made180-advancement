import type { Metadata } from "next";
import type { ReactNode } from "react";
import SessionProvider from "@/components/SessionProvider";

export const metadata: Metadata = {
  title: "MADe180 Advancement Platform",
  description: "Multi-tenant nonprofit donor CRM + donation processing",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
