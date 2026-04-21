import { Client } from "minio";

let _client: Client | null = null;

export function getMinioClient(): Client {
  if (!_client) {
    _client = new Client({
      endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
      port: parseInt(process.env.MINIO_PORT ?? "9000", 10),
      useSSL: process.env.MINIO_USE_SSL === "true",
      accessKey: process.env.MINIO_ACCESS_KEY ?? "",
      secretKey: process.env.MINIO_SECRET_KEY ?? "",
    });
  }
  return _client;
}

export async function uploadBuffer(
  bucket: string,
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const client = getMinioClient();
  const exists = await client.bucketExists(bucket);
  if (!exists) {
    await client.makeBucket(bucket);
  }
  await client.putObject(bucket, key, buffer, buffer.length, {
    "Content-Type": contentType,
  });
}
