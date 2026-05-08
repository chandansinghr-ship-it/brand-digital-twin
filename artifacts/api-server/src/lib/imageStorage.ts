import { Storage } from "@google-cloud/storage";
import { randomUUID } from "node:crypto";

// Replit sidecar GCS auth — same shape as the object-storage skill template
// but trimmed to just the bits the menu-asset pipeline needs (upload bytes,
// download bytes, build a public-serve URL).
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function privateRoot(): { bucket: string; prefix: string } {
  const dir = process.env["PRIVATE_OBJECT_DIR"];
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
  // Format is /<bucket>/<prefix...>
  const parts = dir.replace(/^\/+/, "").split("/");
  const bucket = parts.shift();
  if (!bucket) throw new Error(`PRIVATE_OBJECT_DIR malformed: ${dir}`);
  return { bucket, prefix: parts.join("/") };
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extForMime(mime: string): string {
  return EXT_BY_MIME[mime.toLowerCase()] ?? "bin";
}

// Persists a buffer in object storage and returns the storage path plus a
// public-serve URL the API will route bytes through.
export async function saveAssetBytes(input: {
  slug: string;
  kind: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<{ storagePath: string; publicUrl: string }> {
  const { bucket, prefix } = privateRoot();
  const id = randomUUID();
  const objectName = [
    prefix,
    "menu-assets",
    input.slug,
    `${input.kind}-${id}.${extForMime(input.mimeType)}`,
  ]
    .filter(Boolean)
    .join("/");
  const file = storage.bucket(bucket).file(objectName);
  await file.save(input.buffer, {
    contentType: input.mimeType,
    resumable: false,
  });
  return {
    storagePath: `${bucket}/${objectName}`,
    publicUrl: `/api/storage/menu-assets/${input.slug}/${objectName.split("/").pop()}`,
  };
}

export async function readAssetBytes(
  storagePath: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const slash = storagePath.indexOf("/");
  if (slash <= 0) throw new Error(`bad storagePath: ${storagePath}`);
  const bucket = storagePath.slice(0, slash);
  const objectName = storagePath.slice(slash + 1);
  const file = storage.bucket(bucket).file(objectName);
  const [meta] = await file.getMetadata();
  const [buf] = await file.download();
  return {
    buffer: buf,
    mimeType: (meta.contentType as string) || "application/octet-stream",
  };
}

// Resolves the storage path for a given served URL and streams the bytes back
// to the express response. Used by GET /storage/menu-assets/:slug/:filename.
export async function serveStoredAsset(
  slug: string,
  filename: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const { bucket, prefix } = privateRoot();
  const objectName = [prefix, "menu-assets", slug, filename]
    .filter(Boolean)
    .join("/");
  const file = storage.bucket(bucket).file(objectName);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [meta] = await file.getMetadata();
  const [buf] = await file.download();
  return {
    buffer: buf,
    mimeType: (meta.contentType as string) || "application/octet-stream",
  };
}
