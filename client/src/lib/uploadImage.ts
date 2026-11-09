/**
 * Local image upload (admin): the "Image URL" fields accept either a pasted
 * URL or a local JPG/PNG/WebP/GIF file. The file goes to POST /api/uploads
 * as the raw request body (same-origin cookie auth), and the server answers
 * with the servable path that gets stored in the entry's image URL.
 *
 * The image type is decided by the file's MAGIC BYTES, never by the
 * browser-reported `file.type` — files saved by WeChat/QQ, extracted from
 * ZIPs, or produced by some download managers are perfectly valid PNG/JPEGs
 * that the OS reports as `application/octet-stream`, and those must upload.
 * The server re-validates the magic bytes anyway (uploads.ts).
 */

const MAX_BYTES = 5 * 1024 * 1024; // must mirror the server's limit

/** Sniffs the real image type from the first bytes; null = not a supported image. */
async function sniffImageType(
  file: File,
): Promise<'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const eq = (offset: number, bytes: number[]) => bytes.every((b, i) => head[offset + i] === b);
  if (eq(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (eq(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  // "GIF8"
  if (eq(0, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  // "RIFF" .... "WEBP"
  if (eq(0, [0x52, 0x49, 0x46, 0x46]) && eq(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp';
  return null;
}

export async function uploadImageFile(file: File): Promise<string> {
  if (file.size > MAX_BYTES) {
    throw new Error('That image is larger than 5 MB.');
  }
  const type = await sniffImageType(file);
  if (!type) {
    throw new Error('Unsupported format — the file is not a JPG, PNG, WebP or GIF image.');
  }
  const res = await fetch('/api/uploads', {
    method: 'POST',
    headers: { 'Content-Type': type },
    body: file,
  });
  let json: { url?: string; error?: string } = {};
  try {
    json = (await res.json()) as typeof json;
  } catch {
    /* non-JSON failure */
  }
  if (!res.ok || !json.url) {
    throw new Error(json.error || 'Upload failed. Please try again.');
  }
  return json.url;
}
