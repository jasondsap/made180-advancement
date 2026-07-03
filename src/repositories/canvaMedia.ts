import { sql } from "@/lib/db";
import { assertOrgId } from "@/lib/tenancy";

/**
 * Org-scoped record of every image exported from Canva. s3_key is stable for
 * the life of the row — Edit-in-Canva re-exports overwrite the same object, so
 * stored URLs never need rewriting. target_kind/target_id are provenance and
 * drive the post-edit redirect.
 */

export const TARGET_KINDS = ["campaign_cover", "org_logo", "fundraiser_cover", "email_inline"] as const;
export type CanvaTargetKind = (typeof TARGET_KINDS)[number];

export interface CanvaMedia {
  id: string;
  org_id: string;
  canva_design_id: string;
  s3_key: string;
  url: string;
  target_kind: CanvaTargetKind;
  target_id: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function insertMedia(
  orgId: string,
  m: {
    id: string; // app-generated — embedded in s3_key before insert
    canvaDesignId: string;
    s3Key: string;
    url: string;
    targetKind: CanvaTargetKind;
    targetId: string | null;
    createdBy: string | null;
  },
): Promise<CanvaMedia> {
  assertOrgId(orgId);
  const rows = (await sql`
    INSERT INTO canva_media (id, org_id, canva_design_id, s3_key, url, target_kind, target_id, created_by)
    VALUES (${m.id}, ${orgId}, ${m.canvaDesignId}, ${m.s3Key}, ${m.url}, ${m.targetKind}, ${m.targetId}, ${m.createdBy})
    RETURNING *
  `) as unknown as CanvaMedia[];
  return rows[0]!;
}

export async function getMediaById(orgId: string, id: string): Promise<CanvaMedia | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT * FROM canva_media WHERE org_id = ${orgId} AND id = ${id} LIMIT 1
  `) as unknown as CanvaMedia[];
  return rows[0];
}

/** Latest media row for a stored URL — resurfaces "Edit in Canva" on revisit. */
export async function getMediaByUrl(orgId: string, url: string): Promise<CanvaMedia | undefined> {
  assertOrgId(orgId);
  const rows = (await sql`
    SELECT * FROM canva_media
    WHERE org_id = ${orgId} AND url = ${url}
    ORDER BY created_at DESC
    LIMIT 1
  `) as unknown as CanvaMedia[];
  return rows[0];
}

/** Bump updated_at after a re-export overwrote the object at s3_key. */
export async function touchMedia(orgId: string, id: string): Promise<void> {
  assertOrgId(orgId);
  await sql`UPDATE canva_media SET updated_at = now() WHERE org_id = ${orgId} AND id = ${id}`;
}
