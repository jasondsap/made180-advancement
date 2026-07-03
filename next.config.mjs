/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Keep server-only packages out of the client/edge bundles.
  serverExternalPackages: ["pg", "@neondatabase/serverless", "stripe", "@aws-sdk/client-s3"],

  // Expose server env vars to the AWS Amplify SSR Lambda. Amplify's managed
  // Next.js compute does not reliably propagate console env vars to the runtime,
  // so we bake them in at build time. Next statically replaces these literal
  // `process.env.KEY` reads — which is why src/lib/env.ts reads each var as a
  // literal rather than spreading `process.env`.
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_CONNECT_CLIENT_ID: process.env.STRIPE_CONNECT_CLIENT_ID,
    STRIPE_CONNECT_WEBHOOK_SECRET: process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
    COGNITO_REGION: process.env.COGNITO_REGION,
    COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
    COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
    COGNITO_CLIENT_SECRET: process.env.COGNITO_CLIENT_SECRET,
    COGNITO_DOMAIN: process.env.COGNITO_DOMAIN,
    COGNITO_ISSUER: process.env.COGNITO_ISSUER,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_FALLBACK: process.env.RESEND_FROM_FALLBACK,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_MESSAGING_SERVICE_SID: process.env.TWILIO_MESSAGING_SERVICE_SID,
    TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    APP_BASE_URL: process.env.APP_BASE_URL,
    CANVA_CLIENT_ID: process.env.CANVA_CLIENT_ID,
    CANVA_CLIENT_SECRET: process.env.CANVA_CLIENT_SECRET,
    TOKEN_ENC_KEY: process.env.TOKEN_ENC_KEY,
    MEDIA_S3_BUCKET: process.env.MEDIA_S3_BUCKET,
    MEDIA_S3_REGION: process.env.MEDIA_S3_REGION,
    MEDIA_S3_ACCESS_KEY_ID: process.env.MEDIA_S3_ACCESS_KEY_ID,
    MEDIA_S3_SECRET_ACCESS_KEY: process.env.MEDIA_S3_SECRET_ACCESS_KEY,
    // Feature flags (previously missing from this block — they read undefined
    // on Amplify without being baked in here).
    ENGAGE_SMS_ENABLED: process.env.ENGAGE_SMS_ENABLED,
    ENGAGE_MAILINGS_ENABLED: process.env.ENGAGE_MAILINGS_ENABLED,
    FUNDRAISER_EVENTS_ENABLED: process.env.FUNDRAISER_EVENTS_ENABLED,
    FUNDRAISER_P2P_ENABLED: process.env.FUNDRAISER_P2P_ENABLED,
    FUNDRAISER_AUCTION_ENABLED: process.env.FUNDRAISER_AUCTION_ENABLED,
    CANVA_ENABLED: process.env.CANVA_ENABLED,
    // NEXT_PUBLIC_* are inlined automatically by Next.
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
};

export default nextConfig;
