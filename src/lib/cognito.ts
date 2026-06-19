import { CognitoJwtVerifier } from "aws-jwt-verify";
import { env, requireEnv } from "@/lib/env";

/**
 * Cognito Hosted UI — Authorization Code flow.
 *
 * Login redirects to the Hosted UI; the callback exchanges the code for tokens;
 * we store the id_token in an httpOnly cookie and verify it (signature, exp,
 * audience, issuer) against the pool's JWKS on every request via aws-jwt-verify.
 *
 * Supports both public and confidential app clients (Basic auth on the token
 * call when COGNITO_CLIENT_SECRET is set).
 */
function baseUrl(): string {
  return requireEnv("APP_BASE_URL").replace(/\/$/, "");
}

function cfg() {
  return {
    region: requireEnv("COGNITO_REGION"),
    userPoolId: requireEnv("COGNITO_USER_POOL_ID"),
    clientId: requireEnv("COGNITO_CLIENT_ID"),
    domain: requireEnv("COGNITO_DOMAIN").replace(/\/$/, ""),
    clientSecret: env().COGNITO_CLIENT_SECRET || "",
  };
}

export function redirectUri(): string {
  return `${baseUrl()}/api/auth/callback`;
}

export function getAuthorizeUrl(state: string): string {
  const c = cfg();
  const params = new URLSearchParams({
    client_id: c.clientId,
    response_type: "code",
    scope: "openid email profile",
    redirect_uri: redirectUri(),
    state,
  });
  return `${c.domain}/oauth2/authorize?${params.toString()}`;
}

export function getLogoutUrl(): string {
  const c = cfg();
  const params = new URLSearchParams({
    client_id: c.clientId,
    logout_uri: `${baseUrl()}/`,
  });
  return `${c.domain}/logout?${params.toString()}`;
}

export interface IdClaims {
  sub: string;
  email: string;
  name?: string;
}

export async function exchangeCodeForTokens(code: string): Promise<{ id_token: string }> {
  const c = cfg();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: c.clientId,
    code,
    redirect_uri: redirectUri(),
  });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (c.clientSecret) {
    headers.Authorization =
      "Basic " + Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64");
  }
  const res = await fetch(`${c.domain}/oauth2/token`, { method: "POST", headers, body });
  if (!res.ok) {
    throw new Error(`Cognito token exchange failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { id_token: string };
}

type Verifier = { verify: (token: string) => Promise<Record<string, unknown>> };
let verifier: Verifier | null = null;

function getVerifier(): Verifier {
  if (!verifier) {
    const c = cfg();
    verifier = CognitoJwtVerifier.create({
      userPoolId: c.userPoolId,
      tokenUse: "id",
      clientId: c.clientId,
    }) as unknown as Verifier;
  }
  return verifier;
}

export async function verifyIdToken(idToken: string): Promise<IdClaims> {
  const p = await getVerifier().verify(idToken);
  return {
    sub: String(p.sub),
    email: typeof p.email === "string" ? p.email : "",
    name: typeof p.name === "string" ? p.name : undefined,
  };
}
