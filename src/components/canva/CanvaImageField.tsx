"use client";

import { useEffect, useRef, useState } from "react";
import { CanvaPicker } from "./CanvaPicker";

/**
 * Image-URL form field with optional Canva superpowers. Renders a plain text
 * input named {name} (the enclosing server-action form reads it by name, and
 * manual URL paste keeps working), plus — when the Canva flag is on — a
 * "Design with Canva" picker and an "Edit in Canva" round-trip link.
 * With canvaEnabled=false it degrades to exactly the plain input.
 */
export function CanvaImageField({
  name,
  defaultValue,
  placeholder,
  targetKind,
  targetId,
  initialMediaId,
  canvaEnabled,
  canvaConnected,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  targetKind: string;
  targetId?: string | null;
  /** canva_media id when the stored URL came from Canva (server looks it up). */
  initialMediaId?: string | null;
  canvaEnabled: boolean;
  canvaConnected: boolean;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [mediaId, setMediaId] = useState<string | null>(initialMediaId ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cacheBust, setCacheBust] = useState(0);
  const editedInCanva = useRef(false);

  // After an Edit-in-Canva tab was opened, bust the preview cache when the
  // user returns to this window (the S3 object may have new bytes, same URL).
  useEffect(() => {
    function onFocus() {
      if (editedInCanva.current) setCacheBust(Date.now());
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const previewSrc = value && cacheBust ? `${value}${value.includes("?") ? "&" : "?"}t=${cacheBust}` : value;
  const isUrl = /^https?:\/\//.test(value);

  return (
    <div style={{ display: "grid", gap: ".45rem" }}>
      <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
        <input
          name={name}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setMediaId(null); // manual edit breaks the Canva link
          }}
          placeholder={placeholder}
          style={{ flex: 1, padding: ".5rem .6rem", border: "1px solid #ccc", borderRadius: 7, fontSize: ".95rem", boxSizing: "border-box", minWidth: 0 }}
        />
        {canvaEnabled &&
          (canvaConnected ? (
            <button type="button" onClick={() => setPickerOpen(true)} style={canvaBtn}>
              🎨 Design with Canva
            </button>
          ) : (
            <a href="/app/settings" style={{ fontSize: ".8rem", color: "var(--brand)", whiteSpace: "nowrap" }}>
              Connect Canva →
            </a>
          ))}
      </div>

      {isUrl && (
        <div style={{ display: "flex", gap: ".7rem", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewSrc}
            alt="Preview"
            style={{ maxHeight: 72, maxWidth: 200, objectFit: "contain", border: "1px solid #eee", borderRadius: 6, background: "#fafaf8" }}
          />
          {canvaEnabled && canvaConnected && mediaId && (
            <a
              href={`/api/canva/edit?media=${mediaId}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                editedInCanva.current = true;
              }}
              style={{ fontSize: ".82rem", color: "var(--brand)", fontWeight: 600 }}
            >
              Edit in Canva ↗
            </a>
          )}
        </div>
      )}

      {pickerOpen && (
        <CanvaPicker
          targetKind={targetKind}
          targetId={targetId}
          onClose={() => setPickerOpen(false)}
          onPlaced={({ url, mediaId: id }) => {
            setValue(url);
            setMediaId(id);
            setCacheBust(0);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

const canvaBtn: React.CSSProperties = {
  padding: ".45rem .7rem",
  borderRadius: 7,
  border: "1px solid #d8dad8",
  background: "#fff",
  fontSize: ".82rem",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
