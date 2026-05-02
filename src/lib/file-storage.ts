import 'server-only';
// Local-disk file storage — replaces the Supabase Storage API for the two
// upload surfaces in iCut (lead photos, payment screenshots) and the read
// surface (admin signed URLs).
//
// Layout on disk:
//   ${FILE_STORAGE_ROOT}/<bucket>/<path>
// Default root is /opt/storage; override via env. The Supabase Storage
// container's volume was at /opt/supabase/docker/volumes/storage and the
// existing files are restored as-is into the new root.
//
// Read URLs are served by /api/storage/<bucket>/<path>?exp=&sig= which
// validates the HMAC signature + expiry before streaming.

import { promises as fs } from 'fs';
import path from 'path';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const STORAGE_ROOT = process.env.FILE_STORAGE_ROOT ?? '/opt/storage';

// HMAC secret for signed URLs. Reuses SESSION_SECRET so we don't add another
// rotation surface — anyone with that secret already controls every iCut JWT.
function signingSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET missing for file-storage signing');
  return s;
}

// Reject paths that try to escape the bucket directory.
function assertSafePath(bucket: string, p: string): { fullPath: string } {
  if (!/^[a-z0-9_-]+$/i.test(bucket)) {
    throw new Error(`file-storage: invalid bucket name '${bucket}'`);
  }
  // No leading slash, no .., no NUL.
  if (!p || p.startsWith('/') || p.includes('..') || p.includes('\0')) {
    throw new Error(`file-storage: invalid path '${p}'`);
  }
  const fullPath = path.join(STORAGE_ROOT, bucket, p);
  const bucketRoot = path.join(STORAGE_ROOT, bucket) + path.sep;
  if (!fullPath.startsWith(bucketRoot)) {
    throw new Error(`file-storage: path escapes bucket '${bucket}'`);
  }
  return { fullPath };
}

// ---- write -----------------------------------------------------------------

export async function uploadFile(input: {
  bucket: string;
  path: string;
  data: Uint8Array | Blob;
  contentType?: string;       // currently unused (no per-object metadata yet)
  upsert?: boolean;           // if false (default), error when target exists
}): Promise<{ error: { message: string } | null }> {
  try {
    const { fullPath } = assertSafePath(input.bucket, input.path);
    if (!input.upsert) {
      try {
        await fs.access(fullPath);
        return { error: { message: 'Target already exists' } };
      } catch { /* not exists, good */ }
    }
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    const bytes = input.data instanceof Blob
      ? new Uint8Array(await input.data.arrayBuffer())
      : input.data;
    await fs.writeFile(fullPath, bytes, { mode: 0o640 });
    return { error: null };
  } catch (e) {
    return { error: { message: e instanceof Error ? e.message : 'upload failed' } };
  }
}

// ---- delete ---------------------------------------------------------------

export async function removeFiles(bucket: string, paths: string[]): Promise<{ error: { message: string } | null }> {
  try {
    for (const p of paths) {
      const { fullPath } = assertSafePath(bucket, p);
      await fs.unlink(fullPath).catch(() => { /* ignore missing */ });
    }
    return { error: null };
  } catch (e) {
    return { error: { message: e instanceof Error ? e.message : 'remove failed' } };
  }
}

// ---- signed URL -----------------------------------------------------------

export interface SignedUrlOpts {
  bucket: string;
  path: string;
  ttlSeconds: number;
  // Optional: which app URL the signed URL points at. Defaults to relative
  // (so it works regardless of host) — caller should prepend NEXT_PUBLIC_APP_URL
  // if they need an absolute URL (e.g. for emailing a download link).
  origin?: string;
}

export function createSignedUrl(opts: SignedUrlOpts): { signedUrl: string; expiresAt: number } {
  const { fullPath } = assertSafePath(opts.bucket, opts.path);
  void fullPath;
  const exp = Math.floor(Date.now() / 1000) + opts.ttlSeconds;
  const nonce = randomBytes(8).toString('hex');
  const payload = `${opts.bucket}:${opts.path}:${exp}:${nonce}`;
  const sig = createHmac('sha256', signingSecret()).update(payload).digest('hex');
  const base = opts.origin ?? '';
  // Path-encode each segment so '/' inside the path is preserved.
  const encodedPath = opts.path.split('/').map(encodeURIComponent).join('/');
  const url = `${base}/api/storage/${encodeURIComponent(opts.bucket)}/${encodedPath}` +
    `?exp=${exp}&n=${nonce}&sig=${sig}`;
  return { signedUrl: url, expiresAt: exp };
}

export interface VerifySignedReq {
  bucket: string;
  path: string;
  exp: string | null;
  nonce: string | null;
  sig: string | null;
}

export function verifySignedUrl(req: VerifySignedReq): { ok: true } | { ok: false; reason: string } {
  if (!req.exp || !req.nonce || !req.sig) return { ok: false, reason: 'missing params' };
  const expSec = Number(req.exp);
  if (!Number.isFinite(expSec)) return { ok: false, reason: 'bad exp' };
  if (expSec < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' };
  const payload = `${req.bucket}:${req.path}:${expSec}:${req.nonce}`;
  const expected = createHmac('sha256', signingSecret()).update(payload).digest();
  let provided: Buffer;
  try { provided = Buffer.from(req.sig, 'hex'); } catch { return { ok: false, reason: 'bad sig' }; }
  if (provided.length !== expected.length) return { ok: false, reason: 'bad sig length' };
  if (!timingSafeEqual(provided, expected)) return { ok: false, reason: 'bad sig' };
  return { ok: true };
}

// ---- read (server-side, used by the API route) ---------------------------

export async function readFile(bucket: string, p: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
  try {
    const { fullPath } = assertSafePath(bucket, p);
    const bytes = await fs.readFile(fullPath);
    const ext = path.extname(p).toLowerCase();
    const mimeType = MIME_BY_EXT[ext] ?? 'application/octet-stream';
    return { bytes, mimeType };
  } catch {
    return null;
  }
}

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};
