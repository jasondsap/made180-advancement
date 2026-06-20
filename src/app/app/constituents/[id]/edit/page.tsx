import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getConstituentById } from "@/repositories/constituents";
import { ConstituentForm } from "../../ConstituentForm";
import { updateConstituentAction } from "../../actions";

export default async function EditConstituentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  const { id } = await params;
  const { error } = await searchParams;
  const con = await getConstituentById(ctx.orgId, id);
  if (!con) notFound();
  return (
    <div>
      <Link href={`/app/constituents/${id}`} style={{ color: "var(--brand)", textDecoration: "none", fontSize: ".9rem" }}>← Back</Link>
      <h1 style={{ fontSize: "1.5rem", margin: ".5rem 0 1rem" }}>Edit constituent</h1>
      <ConstituentForm action={updateConstituentAction} defaults={con} submitLabel="Save changes" error={error} />
    </div>
  );
}
