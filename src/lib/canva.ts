import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { requireEnv } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  getConnectionByUserId,
  rotateTokens,
  deleteConnection,
  type CanvaConnection,
} from "@/repositories/canvaConnections";

/**
 * Canva Connect client: OAuth 2.0 + PKCE, rotation-safe token refresh, design
 * listing, export jobs, and return-navigation JWT verification.
 *
 * Canva refresh tokens are SINGLE-USE — every refresh rotates both tokens.
 * The Neon HTTP driver has no transactions, so concurrent refreshes are
 * serialized with an optimistic compare-and-swap on token_version (see
 * getFreshAccessToken).
 */

const AUTHORIZE_URL = "https://www.canva.com/api/oauth/authorize";
const TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";
const API = "https://api.canva.com/rest/v1";
const JWKS_URL = "https://api.canva.com/rest/v1/connect/keys";

/** Minimal scope set: list/read designs + export + profile display name. */
export const CANVA_SCOPES = "design:meta:read design:content:read profile:read";

export class CanvaNotConnectedError extends Error {
  constructor(message = "Canva is not connected for this user") {
    super(message);
    this.name = "CanvaNotConnectedError";
  }
}

// ---------------------------------------------------------------------------
// PKCE + OAuth state cookie (HMAC-signed, engageTokens.ts pattern)
// ---------------------------------------------------------------------------

export function makePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export const OAUTH_COOKIE = "canva_oauth";

function hmac(payload: string): string {
  return createHmac("sha256", requireEnv("NEXTAUTH_SECRET")).update(payload).digest("base64url");
}

/** Pack {state, verifier} into a signed cookie value. */
export function packOauthCookie(state: string, verifier: string): string {
  const body = Buffer.from(JSON.stringify({ s: state, v: verifier })).toString("base64url");
  return `${body}.${hmac(body)}`;
}

export function verifyOauthCookie(cookie: string | undefined): { state: string; verifier: string } | null {
  if (!cookie) return null;
  const [body, sig] = cookie.split(".");
  if (!body || !sig) return null;
  const expected = hmac(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { s?: string; v?: string };
    if (!parsed.s || !parsed.v) return null;
    return { state: parsed.s, verifier: parsed.v };
  } catch {
    return null;
  }
}

export function redirectUri(): string {
  return `${requireEnv("APP_BASE_URL").replace(/\/$/, "")}/api/canva/callback`;
}

export function buildAuthorizeUrl(opts: { state: string; codeChallenge: string }): string {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", requireEnv("CANVA_CLIENT_ID"));
  u.searchParams.set("scope", CANVA_SCOPES);
  u.searchParams.set("code_challenge", opts.codeChallenge);
  u.searchParams.set("code_challenge_method", "s256");
  u.searchParams.set("state", opts.state);
  u.searchParams.set("redirect_uri", redirectUri());
  return u.toString();
}

// ---------------------------------------------------------------------------
// Token endpoint
// ---------------------------------------------------------------------------

export interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenSet> {
  const basic = Buffer.from(
    `${requireEnv("CANVA_CLIENT_ID")}:${requireEnv("CANVA_CLIENT_SECRET")}`,
  ).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = new Error(
      `Canva token request failed (${res.status}): ${String(json.error ?? "")} ${String(json.error_description ?? "")}`.trim(),
    ) as Error & { canvaError?: string };
    err.canvaError = String(json.error ?? "");
    throw err;
  }
  return json as unknown as TokenSet;
}

export function exchangeCode(code: string, verifier: string): Promise<TokenSet> {
  return tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri(),
    }),
  );
}

export function refreshTokens(refreshToken: string): Promise<TokenSet> {
  return tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
}

// ---------------------------------------------------------------------------
// Rotation-safe access token
// ---------------------------------------------------------------------------

const SKEW_MS = 2 * 60 * 1000;

function accessTokenOf(conn: CanvaConnection): string {
  return decryptSecret(conn.access_token_enc);
}

/**
 * Return a valid access token for the user, refreshing (and rotating) when
 * within 2 minutes of expiry. Concurrency: the CAS update on token_version
 * decides the winner; the loser re-reads and uses the winner's fresh token.
 */
export async function getFreshAccessToken(userId: string): Promise<string> {
  const conn = await getConnectionByUserId(userId);
  if (!conn) throw new CanvaNotConnectedError();
  if (new Date(conn.access_token_expires_at).getTime() > Date.now() + SKEW_MS) {
    return accessTokenOf(conn);
  }

  let tokens: TokenSet;
  try {
    tokens = await refreshTokens(decryptSecret(conn.refresh_token_enc));
  } catch (e) {
    const canvaError = (e as { canvaError?: string }).canvaError;
    if (canvaError === "invalid_grant") {
      // Our refresh token was consumed elsewhere or revoked. If a concurrent
      // refresh won, its row carries a fresh token; otherwise the connection
      // is dead.
      const latest = await getConnectionByUserId(userId);
      if (latest && latest.token_version > conn.token_version) return accessTokenOf(latest);
      await deleteConnection(userId);
      throw new CanvaNotConnectedError("Canva connection expired — please reconnect");
    }
    throw e;
  }

  const rotated = await rotateTokens(userId, conn.token_version, {
    accessTokenEnc: encryptSecret(tokens.access_token),
    refreshTokenEnc: encryptSecret(tokens.refresh_token),
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  });
  if (rotated) return tokens.access_token;

  // CAS lost — someone else rotated between our read and write. Use theirs.
  const latest = await getConnectionByUserId(userId);
  if (!latest) throw new CanvaNotConnectedError();
  return accessTokenOf(latest);
}

// ---------------------------------------------------------------------------
// REST API
// ---------------------------------------------------------------------------

async function api<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Canva API ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export interface CanvaDesignSummary {
  id: string;
  title: string;
  thumbnailUrl: string | null;
}

interface RawDesign {
  id: string;
  title?: string;
  thumbnail?: { url?: string };
  urls?: { edit_url?: string; view_url?: string };
}

export async function listDesigns(accessToken: string, query?: string): Promise<CanvaDesignSummary[]> {
  const params = new URLSearchParams({ limit: "30" });
  if (query?.trim()) params.set("query", query.trim());
  const data = await api<{ items?: RawDesign[] }>(accessToken, `/designs?${params}`);
  return (data.items ?? []).map((d) => ({
    id: d.id,
    title: d.title || "Untitled design",
    thumbnailUrl: d.thumbnail?.url ?? null,
  }));
}

/** Fresh design metadata — edit_url is a temporary token, fetch at click time. */
export async function getDesign(accessToken: string, designId: string): Promise<{ id: string; editUrl: string | null }> {
  const data = await api<{ design?: RawDesign }>(accessToken, `/designs/${encodeURIComponent(designId)}`);
  return { id: data.design?.id ?? designId, editUrl: data.design?.urls?.edit_url ?? null };
}

export async function createExport(accessToken: string, designId: string): Promise<string> {
  const data = await api<{ job: { id: string } }>(accessToken, "/exports", {
    method: "POST",
    body: JSON.stringify({ design_id: designId, format: { type: "png" } }),
  });
  return data.job.id;
}

interface ExportJob {
  job: { id: string; status: "in_progress" | "success" | "failed"; urls?: string[]; error?: { message?: string } };
}

export async function getExport(accessToken: string, jobId: string): Promise<ExportJob["job"]> {
  const data = await api<ExportJob>(accessToken, `/exports/${encodeURIComponent(jobId)}`);
  return data.job;
}

/**
 * Poll an export job until success/failure or the deadline, then download the
 * PNG. Returns null when the deadline passes with the job still in progress
 * (caller returns 202 and the client continues the job).
 */
export async function pollExportAndDownload(
  accessToken: string,
  jobId: string,
  deadlineMs: number,
): Promise<Buffer | null> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    const job = await getExport(accessToken, jobId);
    if (job.status === "success") {
      const url = job.urls?.[0];
      if (!url) throw new Error("Canva export succeeded but returned no download URL");
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Canva export download failed (${res.status})`);
      return Buffer.from(await res.arrayBuffer());
    }
    if (job.status === "failed") {
      throw new Error(`Canva export failed: ${job.error?.message ?? "unknown error"}`);
    }
    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export async function getCanvaUser(accessToken: string): Promise<{ id: string; displayName: string | null }> {
  const me = await api<{ team_user?: { user_id?: string } }>(accessToken, "/users/me");
  let displayName: string | null = null;
  try {
    const profile = await api<{ profile?: { display_name?: string } }>(accessToken, "/users/me/profile");
    displayName = profile.profile?.display_name ?? null;
  } catch {
    // profile:read may be missing/denied — display name is cosmetic.
  }
  return { id: me.team_user?.user_id ?? "", displayName };
}

// ---------------------------------------------------------------------------
// Return navigation (correlation JWT)
// ---------------------------------------------------------------------------

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export async function verifyCorrelationJwt(
  token: string,
): Promise<{ correlationState: string; designId: string; canvaUserId: string }> {
  jwks ??= createRemoteJWKSet(new URL(JWKS_URL));
  const { payload } = await jwtVerify(token, jwks, { audience: requireEnv("CANVA_CLIENT_ID") });
  const correlationState = String(payload.correlation_state ?? "");
  const designId = String(payload.design_id ?? "");
  if (!correlationState || !designId) throw new Error("correlation_jwt missing expected claims");
  return { correlationState, designId, canvaUserId: String(payload.sub ?? "") };
}
