import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// The SDK reads AWS_ENDPOINT_URL_S3, AWS_REGION and credentials from the
// server environment populated by `neon deploy`. Neon requires path style.
const storage = new S3Client({ forcePathStyle: true });
const bucket = "assets";

function key(userId: string, id: string) {
  return `users/${userId}/${id}`;
}

export async function uploadFile(userId: string, id: string, body: Buffer) {
  await storage.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key(userId, id),
      Body: body,
      ContentType: "application/octet-stream",
      CacheControl: "private, no-store",
    }),
  );
}

export async function downloadFile(userId: string, id: string) {
  try {
    const object = await storage.send(
      new GetObjectCommand({ Bucket: bucket, Key: key(userId, id) }),
    );
    return object.Body?.transformToWebStream() ?? null;
  } catch (error) {
    if (error instanceof Error && error.name === "NoSuchKey") return null;
    throw error;
  }
}

export async function deleteFile(userId: string, id: string) {
  await storage.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key(userId, id) }),
  );
}
