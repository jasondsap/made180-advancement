"use client";

import { useState } from "react";
import { CanvaPicker } from "./CanvaPicker";

/**
 * Composer variant: pick a Canva design and hand back `![alt](url)` markdown
 * for insertion at the textarea cursor.
 */
export function CanvaInsertImageButton({
  targetId,
  canvaEnabled,
  canvaConnected,
  onInsert,
}: {
  targetId?: string | null;
  canvaEnabled: boolean;
  canvaConnected: boolean;
  onInsert: (markdown: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!canvaEnabled) return null;
  if (!canvaConnected) {
    return (
      <a href="/app/settings" style={{ fontSize: ".78rem", color: "var(--brand)" }}>
        Connect Canva to insert designed images →
      </a>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ padding: ".35rem .65rem", borderRadius: 7, border: "1px solid #d8dad8", background: "#fff", fontSize: ".78rem", fontWeight: 600, cursor: "pointer" }}
      >
        🎨 Insert Canva image
      </button>
      {open && (
        <CanvaPicker
          targetKind="email_inline"
          targetId={targetId}
          onClose={() => setOpen(false)}
          onPlaced={({ url }) => {
            onInsert(`![Image](${url})`);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
