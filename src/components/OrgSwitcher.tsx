"use client";

import { useRef } from "react";

type OrgOption = { id: string; legal_name: string };

/**
 * Header org switcher. Submits the active-org cookie change on select. The
 * server action revalidates access, so this is purely a convenience control.
 */
export function OrgSwitcher({
  orgs,
  activeOrgId,
  action,
}: {
  orgs: OrgOption[];
  activeOrgId: string;
  action: (fd: FormData) => void | Promise<void>;
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form action={action} ref={ref}>
      <select
        name="orgId"
        defaultValue={activeOrgId}
        onChange={() => ref.current?.requestSubmit()}
        title="Active organization"
        style={{
          fontSize: ".78rem",
          color: "var(--app-text-soft)",
          background: "var(--parchment-deep)",
          border: "1px solid var(--app-border)",
          borderRadius: 999,
          padding: ".2rem .6rem",
          maxWidth: 220,
          cursor: "pointer",
        }}
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.legal_name}
          </option>
        ))}
      </select>
    </form>
  );
}
