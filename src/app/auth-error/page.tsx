import Link from "next/link";

const REASONS: Record<string, string> = {
  missing_code: "The sign-in response was missing its authorization code.",
  bad_state: "The sign-in request could not be verified (state mismatch). Please try again.",
  token_exchange: "We couldn’t complete sign-in with the identity provider.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const message = (reason && REASONS[reason]) || "Something went wrong during sign-in.";
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 480, margin: "4rem auto", padding: "0 1.25rem", textAlign: "center" }}>
      <h1 style={{ fontSize: "1.4rem" }}>Sign-in problem</h1>
      <p style={{ color: "#555" }}>{message}</p>
      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/api/auth/login" style={{ color: "#1c6e3c" }}>Try signing in again</Link>
      </p>
    </main>
  );
}
