import { S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

console.log("[AWS Config] Initializing S3Client...");
console.log("[AWS Config] Region:", env.AWS_REGION);
console.log("[AWS Config] Bucket:", env.S3_BUCKET_NAME);
console.log(
  "[AWS Config] Access Key ID (masked):",
  env.AWS_ACCESS_KEY_ID?.substring(0, 8) + "..."
);

export const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

console.log("[AWS Config] S3Client initialized successfully");

export const S3_CONFIG = {
  bucket: env.S3_BUCKET_NAME,
  region: env.AWS_REGION,
  presignedUrlExpiry: 3600, // 1 hour in seconds
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedMimeTypes: ["application/pdf"],
};
