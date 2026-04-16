import { createServerClient } from '@/lib/supabase';

/**
 * Generate a short-lived signed URL for an object in a private storage bucket.
 *
 * Context: migration 030 flips `payment-screenshots` and `lead-photos` from
 * public-read to private. Old rows stored `getPublicUrl()` output which 404s
 * after the flip; new rows store the storage path (e.g. `<salonId>/<uuid>.jpg`)
 * and mint a signed URL at render time.
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
  const supabase = createServerClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) {
    console.error('[storage-url]', bucket, path, error);
    return null;
  }
  return data.signedUrl;
}
