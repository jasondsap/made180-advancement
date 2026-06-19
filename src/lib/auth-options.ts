import type { NextAuthOptions } from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";
import { env, requireEnv } from "@/lib/env";
import {
  getUserByCognitoSub,
  getUserByEmail,
  reconcileCognitoSub,
  createUserFromCognito,
} from "@/repositories/users";

/**
 * NextAuth + AWS Cognito (matches the DDOR pattern). Confidential client,
 * Authorization Code + PKCE, JWT session. Callback path is the NextAuth standard
 * `/api/auth/callback/cognito` — which is what the Cognito app client is already
 * configured for.
 *
 * The signIn callback reconciles the Cognito identity to our users table (the
 * seeded super_admin is matched by email on first login); org + role resolution
 * happens later in getAuthContext() from the memberships table.
 */
function cognitoIssuer(): string {
  return (
    env().COGNITO_ISSUER ||
    `https://cognito-idp.${requireEnv("COGNITO_REGION")}.amazonaws.com/${requireEnv("COGNITO_USER_POOL_ID")}`
  );
}

/**
 * Built lazily (per request), not at module load, so `requireEnv` only runs at
 * runtime — `next build` never needs these secrets present.
 */
export function getAuthOptions(): NextAuthOptions {
  return {
  providers: [
    CognitoProvider({
      clientId: requireEnv("COGNITO_CLIENT_ID"),
      clientSecret: env().COGNITO_CLIENT_SECRET ?? "",
      issuer: cognitoIssuer(),
      checks: ["pkce", "state"],
    }),
  ],
  secret: requireEnv("NEXTAUTH_SECRET"),
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/auth/signin", error: "/auth/signin" },
  callbacks: {
    async signIn({ account, profile }) {
      const sub = account?.providerAccountId;
      if (!sub) return false;
      const email = (profile as { email?: string } | undefined)?.email;
      const name = (profile as { name?: string } | undefined)?.name;
      // Reconcile/create the platform user row before the session is used.
      let user = await getUserByCognitoSub(sub);
      if (!user && email) {
        const byEmail = await getUserByEmail(email);
        if (byEmail) user = await reconcileCognitoSub(byEmail.id, sub);
      }
      if (!user) await createUserFromCognito(sub, email ?? "", name ?? null);
      return true;
    },
    async jwt({ token, account }) {
      // Store the Cognito sub as the canonical subject.
      if (account?.providerAccountId) token.sub = account.providerAccountId;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
  };
}
