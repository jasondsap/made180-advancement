"use client";

import { signOut } from "next-auth/react";

/** Clears the NextAuth session, then federates through Cognito Hosted UI logout. */
export function SignOutButton({ style }: { style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/api/auth/cognito-logout" })}
      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", ...style }}
    >
      Sign out
    </button>
  );
}
