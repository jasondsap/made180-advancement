/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Stripe webhook route reads the raw request body and uses the Node
  // crypto/stripe SDK, so it must run on the Node.js runtime (set per-route via
  // `export const runtime = 'nodejs'`). Nothing global needed here yet.
  // Keep server-only packages out of the client/edge bundles.
  serverExternalPackages: ["pg", "@neondatabase/serverless", "stripe"],
};

export default nextConfig;
