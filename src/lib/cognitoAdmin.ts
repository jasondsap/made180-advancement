import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  UsernameExistsException,
} from "@aws-sdk/client-cognito-identity-provider";
import { env, requireEnv } from "@/lib/env";

/**
 * Server-side Cognito user provisioning (the invite flow). AdminCreateUser
 * sends Cognito's invitation email with a temporary password; on first sign-in
 * the user sets a real one and the auth layer reconciles the seed-pending users
 * row by verified email. Credentials come from the SDK default chain (Amplify
 * SSR compute role / local aws profile) — same pattern as s3.ts.
 */

let client: CognitoIdentityProviderClient | null = null;

function getClient(): CognitoIdentityProviderClient {
  if (!client) {
    client = new CognitoIdentityProviderClient({ region: requireEnv("COGNITO_REGION") });
  }
  return client;
}

export type InviteResult = "invited" | "already_exists" | "failed";

/**
 * Create the Cognito user and send the invitation email. Idempotent-friendly:
 * an existing username is reported as `already_exists`, not an error, so
 * re-adding a member to a second org never fails the membership grant.
 * Returns `failed` (never throws) — membership creation must not depend on
 * Cognito being reachable.
 */
export async function inviteCognitoUser(email: string): Promise<InviteResult> {
  const poolId = env().COGNITO_USER_POOL_ID;
  if (!poolId) {
    console.warn("[cognito invite] COGNITO_USER_POOL_ID not set — skipping invite email");
    return "failed";
  }
  try {
    await getClient().send(
      new AdminCreateUserCommand({
        UserPoolId: poolId,
        Username: email,
        UserAttributes: [
          { Name: "email", Value: email },
          // Invited addresses are trusted — the admin typed them. Verified email
          // is also what lets the seed-pending reconcile claim the users row.
          { Name: "email_verified", Value: "true" },
        ],
        DesiredDeliveryMediums: ["EMAIL"],
      }),
    );
    return "invited";
  } catch (err) {
    if (err instanceof UsernameExistsException) return "already_exists";
    console.error("[cognito invite] AdminCreateUser failed:", err);
    return "failed";
  }
}
