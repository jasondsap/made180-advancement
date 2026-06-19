/**
 * Cookie name kept dependency-free so Edge middleware can import it without
 * pulling Node-only code into the Edge bundle.
 */
export const ACTIVE_ORG_COOKIE = "ap_org"; // selected org_id for super_admins
