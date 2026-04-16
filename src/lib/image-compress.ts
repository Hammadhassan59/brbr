/**
 * Client-side image downscale + JPEG re-encode for upload-bound photos.
 * Phone cameras produce 4–12 MB images; for a salon storefront snapshot we
 * need maybe ~150KB. Doing this in the browser saves bandwidth on slow rural
 * connections and keeps the storage bill small.
 *
 * No external deps — uses canvas + the structured DOM image decoder.
 */
export interface CompressOptions {
  /** Longest edge in pixels. Default 1280 (good for ~2x retina display). */
  maxEdge?: number;
  /** JPEG quality 0–1. Default 0.8. */
  quality?: number;
  /** Output MIME. Default image/jpeg (smaller than png/webp at this quality). */
  mime?: 'image/jpeg' | 'image/webp';
}

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const maxEdge = opts.maxEdge ?? 1280;
  const quality = opts.quality ?? 0.8;
  const mime = opts.mime ?? 'image/jpeg';

  // HEIC/HEIF from iPhones decoded by canvas only on Safari; on Android
  // Chrome these fail decode. If decode throws we return the original file —
  // the upload is still capped server-side at 5MB.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const { width, height } = bitmap;
  const longest = Math.max(width, height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mime, quality)
  );
  if (!blob) return file;

  const ext = mime === 'image/webp' ? 'webp' : 'jpg';
  const baseName = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.${ext}`, { type: mime, lastModified: Date.now() });
}
