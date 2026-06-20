import { verifyUnsubscribeToken } from "@/lib/engageTokens";
import { setEmailOptOut } from "@/repositories/constituents";

/**
 * Public one-click unsubscribe. No auth — intent is proven by the signed token.
 * GET shows a confirmation page; POST is the RFC 8058 one-click endpoint that
 * email clients hit directly (List-Unsubscribe-Post). Both opt the contact out.
 */
export const dynamic = "force-dynamic";

async function optOut(token: string): Promise<boolean> {
  const decoded = verifyUnsubscribeToken(token);
  if (!decoded) return false;
  try {
    await setEmailOptOut(decoded.orgId, decoded.constituentId, true);
    return true;
  } catch {
    return false;
  }
}

function page(ok: boolean): Response {
  const body = ok
    ? `<h1>You're unsubscribed</h1><p>You won't receive further marketing emails from this organization. Tax receipts for your gifts are unaffected.</p>`
    : `<h1>Link expired</h1><p>This unsubscribe link is invalid or has expired. Please contact the organization directly.</p>`;
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head>
     <body style="font-family:Georgia,serif;max-width:520px;margin:4rem auto;padding:0 1.25rem;color:#2B2620">${body}</body></html>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return page(await optOut(token));
}

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = await optOut(token);
  return new Response(null, { status: ok ? 204 : 400 });
}
