import 'server-only';
import { createSignedUrl } from '@/lib/file-storage';

/**
 * Generate a short-lived signed URL for an object in a private storage bucket.
 *
 * Context: migration 030 flipped `payment-screenshots` and `lead-photos` from
 * public-read to private. Old rows stored `getPublicUrl()` output which 404s
 * after the flip; new rows store the storage path (e.g. `<salonId>/<uuid>.jpg`)
 * and mint a signed URL at render time.
 *
 * Implementation now points at the local-disk file store (replaces Supabase
 * Storage). Signed URLs route through /api/storage/[bucket]/[...path].
 *
 * TTL default is 15 minutes — long enough for an admin to open a payment
 * screenshot modal, short enough that leaked URLs expire quickly.
 */
export async function getSignedStorageUrl(
  bucket: 'payment-screenshots' | 'lead-photos',
  path: string,
  ttlSeconds: number = 900,
): Promise<string | null> {
  if (!path) return null;
  try {
    const { signedUrl } = createSignedUrl({ bucket, path, ttlSeconds });
    return signedUrl;
  } catch (err) {
    console.error('[storage-url]', bucket, path, err);
    return null;
  }
}
