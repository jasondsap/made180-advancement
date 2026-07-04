import { getAuthContext, canManage } from "@/lib/auth";
import ImportWizard from "./ImportWizard";

export const dynamic = "force-dynamic";

/**
 * CSV import (constituents + gift history) — the LGL/Excel migration path.
 * Parsing and column mapping happen client-side; rows are imported through
 * batched server actions so large files never ride one long request.
 */
export default async function ImportPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  if (!canManage(ctx.role)) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: "1.5rem" }}>Import</h1>
        <p style={{ color: "#7a7367" }}>Data import is available to organization admins.</p>
      </div>
    );
  }
  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 .25rem" }}>Import data</h1>
      <p style={{ color: "#7a7367", margin: "0 0 1.25rem", fontSize: ".92rem" }}>
        Bring constituents and gift history over from Little Green Light, Excel, or any CRM that
        exports CSV. Import constituents first, then gifts.
      </p>
      <ImportWizard />
    </div>
  );
}
