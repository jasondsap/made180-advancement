import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env, requireEnv } from "@/lib/env";

/**
 * Public media storage (Canva exports, image uploads). Objects under a
 * public-read bucket policy prefix; uploads are server-side only, so no CORS.
 * Credentials: MEDIA_S3_ACCESS_KEY_ID/SECRET when set (local dev), else the
 * SDK default chain (Amplify SSR compute role / aws configure profile).
 */

let client: S3Client | null = null;

function getS3(): S3Client {
  if (client) return client;
  const e = env();
  client = new S3Client({
    region: requireEnv("MEDIA_S3_REGION"),
    ...(e.MEDIA_S3_ACCESS_KEY_ID && e.MEDIA_S3_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: e.MEDIA_S3_ACCESS_KEY_ID,
            secretAccessKey: e.MEDIA_S3_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  });
  return client;
}

/**
 * Upload a public image and return its stable https URL. Short cache TTL so
 * Edit-in-Canva overwrites (same key, new bytes) become visible within ~5 min.
 */
export async function putPublicImage(
  key: string,
  body: Buffer,
  contentType = "image/png",
): Promise<string> {
  const bucket = requireEnv("MEDIA_S3_BUCKET");
  const region = requireEnv("MEDIA_S3_REGION");
  await getS3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=300",
    }),
  );
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}
