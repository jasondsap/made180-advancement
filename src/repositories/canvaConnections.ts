import { sql } from "@/lib/db";

/**
 * Canva OAuth connections — per USER, deliberately NOT org-scoped.
 *
 * Documented exception to the org-first rule (same class as users.ts): a Canva
 * login belongs to a person, and platform users span orgs via memberships.
 * Org-scoping tokens would force per-org reconnects and duplicate Canva's
 * single-use rotating refresh tokens. Access control: API routes only ever use
 * the session user's own connection, and all canva_media reads/writes go
 * through the org-scoped canvaMedia repository.
 */

export interface CanvaConnection {
  id: string;
  user_id: string;
  canva_user_id: string;
  display_name: string | null;
  access_token_enc: string;
  refresh_token_enc: string;
  access_token_expires_at: Date;
  scopes: string;
  token_version: number;
  created_at: Date;
  updated_at: Date;
}

export async function getConnectionByUserId(userId: string): Promise<CanvaConnection | undefined> {
  const rows = (await sql`
    SELECT * FROM canva_connections WHERE user_id = ${userId} LIMIT 1
  `) as unknown as CanvaConnection[];
  return rows[0];
}

export async function upsertConnection(
  userId: string,
  c: {
    canvaUserId: string;
    displayName: string | null;
    accessTokenEnc: string;
    refreshTokenEnc: string;
    expiresAt: Date;
    scopes: string;
  },
): Promise<CanvaConnection> {
  // On reconnect, bump token_version so any in-flight stale refresh CAS loses.
  const rows = (await sql`
    INSERT INTO canva_connections
      (user_id, canva_user_id, display_name, access_token_enc, refresh_token_enc, access_token_expires_at, scopes)
    VALUES (${userId}, ${c.canvaUserId}, ${c.displayName}, ${c.accessTokenEnc}, ${c.refreshTokenEnc}, ${c.expiresAt.toISOString()}, ${c.scopes})
    ON CONFLICT (user_id) DO UPDATE SET
      canva_user_id = EXCLUDED.canva_user_id,
      display_name = EXCLUDED.display_name,
      access_token_enc = EXCLUDED.access_token_enc,
      refresh_token_enc = EXCLUDED.refresh_token_enc,
      access_token_expires_at = EXCLUDED.access_token_expires_at,
      scopes = EXCLUDED.scopes,
      token_version = canva_connections.token_version + 1
    RETURNING *
  `) as unknown as CanvaConnection[];
  return rows[0]!;
}

/**
 * Optimistic compare-and-swap for Canva's single-use refresh tokens (Neon HTTP
 * driver = no row locks). Returns the updated row, or undefined when a
 * concurrent rotation won (caller re-reads and uses the winner's tokens).
 */
export async function rotateTokens(
  userId: string,
  expectedVersion: number,
  t: { accessTokenEnc: string; refreshTokenEnc: string; expiresAt: Date },
): Promise<CanvaConnection | undefined> {
  const rows = (await sql`
    UPDATE canva_connections SET
      access_token_enc = ${t.accessTokenEnc},
      refresh_token_enc = ${t.refreshTokenEnc},
      access_token_expires_at = ${t.expiresAt.toISOString()},
      token_version = token_version + 1
    WHERE user_id = ${userId} AND token_version = ${expectedVersion}
    RETURNING *
  `) as unknown as CanvaConnection[];
  return rows[0];
}

export async function deleteConnection(userId: string): Promise<void> {
  await sql`DELETE FROM canva_connections WHERE user_id = ${userId}`;
}
