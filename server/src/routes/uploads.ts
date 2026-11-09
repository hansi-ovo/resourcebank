import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router, raw, type RequestHandler } from 'express';

/**
 * Local image upload for the admin "Image URL" fields (manual add +
 * inline table editing). The admin can either paste an external URL or
 * upload a JPG/PNG/WebP/GIF from their computer — the file is stored on
 * the server and the DB keeps the servable path `/api/uploads/<name>`.
 *
 * POST /api/uploads        (admin)  — raw image body, Content-Type image/*
 * GET  /api/uploads/:file  (public) — the display site loads these images,
 *                                      same as it loads /api/seedimg art.
 *
 * No multer dependency: the browser sends the File as the raw request
 * body; express.raw parses it. The stored filename is server-generated
 * (never the client's name) with a magic-byte check, so a mislabeled
 * content-type or a crafted filename cannot poison the store.
 */

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — program card art, not photo storage
/** body-parser reads a little over the limit to fail loudly with 413 */
const BODY_LIMIT = `${Math.ceil(MAX_BYTES / 1024) + 1}kb`;

interface ImageSpec {
  /** stored file extension */
  ext: string;
  mime: string;
  /** validates the buffer's leading magic bytes for this type */
  magic: (b: Buffer) => boolean;
}

const PNG_1x1_PREFIX = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const TYPES: Record<string, ImageSpec> = {
  'image/jpeg': {
    ext: 'jpg',
    mime: 'image/jpeg',
    magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  'image/png': {
    ext: 'png',
    mime: 'image/png',
    magic: (b) => PNG_1x1_PREFIX.every((byte, i) => b[i] === byte),
  },
  'image/webp': {
    ext: 'webp',
    mime: 'image/webp',
    magic: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  'image/gif': {
    ext: 'gif',
    mime: 'image/gif',
    magic: (b) => b.subarray(0, 4).toString('ascii') === 'GIF8',
  },
};

/** Stored-name shape: server-generated, no client input anywhere. */
const NAME_RE = /^img-[a-z0-9]+-[a-f0-9]+\.(jpg|png|webp|gif)$/;

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

export function uploadsRoutes(uploadDir: string, admin: RequestHandler): Router {
  fs.mkdirSync(uploadDir, { recursive: true });
  const router = Router();

  router.post(
    '/',
    admin,
    raw({ type: Object.keys(TYPES), limit: BODY_LIMIT }),
    (req, res) => {
      // A non-image content-type (or empty body) skips express.raw entirely.
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(415).json({ error: 'Please upload a JPG, PNG, WebP or GIF image.' });
        return;
      }
      const mime = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
      const spec = TYPES[mime];
      if (!spec) {
        res.status(415).json({ error: 'Please upload a JPG, PNG, WebP or GIF image.' });
        return;
      }
      if (req.body.length > MAX_BYTES) {
        res.status(413).json({ error: 'Image is larger than 5 MB.' });
        return;
      }
      if (!spec.magic(req.body)) {
        res.status(415).json({ error: 'That file is not a valid image of the type it claims.' });
        return;
      }
      const name = `img-${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}.${spec.ext}`;
      fs.writeFileSync(path.join(uploadDir, name), req.body);
      console.log(`[uploads] stored ${name} (${req.body.length} bytes)`);
      res.status(201).json({ url: `/api/uploads/${name}` });
    },
  );

  router.get('/:file', (req, res) => {
    const file = req.params.file;
    // strict shape check doubles as path-traversal protection (no /, no ..)
    if (!NAME_RE.test(file)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const full = path.join(uploadDir, file);
    let body: Buffer;
    try {
      body = fs.readFileSync(full);
    } catch {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    // names are unique per upload — the asset is immutable forever
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type(MIME_BY_EXT[file.split('.').pop()!]!).send(body);
  });

  return router;
}
