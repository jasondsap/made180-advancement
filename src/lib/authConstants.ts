/**
 * Cookie names — kept dependency-free so both the Node auth layer and the Edge
 * middleware can import them without pulling Node-only code into the Edge bundle.
 */
export const SESSION_COOKIE = "ap_session"; // Cognito id_token (httpOnly)
export const ACTIVE_ORG_COOKIE = "ap_org"; // selected org_id for super_admins
export const STATE_COOKIE = "ap_oauth_state"; // CSRF state for the OAuth round-trip
