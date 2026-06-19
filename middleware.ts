import { withAuth } from "next-auth/middleware";

/**
 * Guard /app/* with NextAuth. Unauthenticated requests are redirected to the
 * Cognito sign-in page. Token verification uses NEXTAUTH_SECRET (available at the
 * Edge via the next.config env block).
 */
export default withAuth({
  pages: { signIn: "/auth/signin" },
});

export const config = {
  matcher: ["/app/:path*"],
};
