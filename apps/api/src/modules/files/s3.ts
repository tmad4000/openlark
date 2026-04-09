import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../../config.js";

const isTest = config.NODE_ENV === "test";

let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: "us-east-1",
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY,
        secretAccessKey: config.S3_SECRET_KEY,
      },
      forcePathStyle: true, // Required for MinIO
    });
  }
  return s3Client;
}

const BUCKET = config.S3_BUCKET;

export async function ensureBucket(): Promise<void> {
  if (isTest) return;
  const client = getS3Client();
  try {
    await client.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }
}

export async function uploadToS3(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getPresignedDownloadUrl(
  key: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const client = getS3Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

export async function deleteFromS3(key: string): Promise<void> {
  const client = getS3Client();
  await client.send(
    new DeleteObjectCommand({ Bucket: BUCKET, Key: key }),
  );
}
