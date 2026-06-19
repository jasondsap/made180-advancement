import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { ConstituentForm } from "../ConstituentForm";
import { createConstituentAction } from "../actions";

export default async function NewConstituentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { error } = await searchParams;
  return (
    <div>
      <Link href="/app/constituents" style={{ color: "#1c6e3c", textDecoration: "none", fontSize: ".9rem" }}>← Constituents</Link>
      <h1 style={{ fontSize: "1.5rem", margin: ".5rem 0 1rem" }}>Add constituent</h1>
      <ConstituentForm action={createConstituentAction} submitLabel="Create" error={error} />
    </div>
  );
}
