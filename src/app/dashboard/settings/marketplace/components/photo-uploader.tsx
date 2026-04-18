'use client';

import { useRef, useState } from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { compressImage } from '@/lib/image-compress';
import {
  uploadBranchPhoto,
  deleteBranchPhoto,
} from '@/app/actions/marketplace-settings';
import type { BranchPhoto } from '@/lib/marketplace/settings-shared';
import { showActionError } from '@/components/paywall-dialog';

/**
 * Multi-file upload for the branch-photos bucket (migration 041).
 *
 * - Limits: 5 MB + image/jpeg|png|webp, enforced client AND server side.
 * - Runs files through the existing `compressImage` helper so phone-camera
 *   originals (~8 MB) drop to ~250 KB at 1280px. Saves the salon's data.
 * - Shows a 3-across grid with a delete cross on hover. First photo is
 *   visually marked as the "cover" — that convention is enforced later by
 *   the public marketplace profile page.
 */

interface Props {
  branchId: string;
  photos: BranchPhoto[];
  onChange: (next: BranchPhoto[]) => void;
  disabled?: boolean;
}

const ACCEPTED_MIMES = 'image/jpeg,image/png,image/webp';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export function PhotoUploader({
  branchId,
  photos,
  onChange,
  disabled = false,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    const added: BranchPhoto[] = [];

    for (const file of Array.from(files)) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        toast.error(`Skipped "${file.name}": unsupported type (use JPEG / PNG / WebP)`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`Skipped "${file.name}": larger than 5 MB`);
        continue;
      }

      try {
        // Compress first so upstream size pressure is minimal. The helper
        // re-encodes to JPEG at quality 0.8; that's still well inside the
        // 5 MB cap but ~10× smaller than a raw iPhone capture.
        const compressed = await compressImage(file, { maxEdge: 1600, quality: 0.85 });
        const form = new FormData();
        form.append('branchId', branchId);
        form.append('file', compressed);
        const { data, error } = await uploadBranchPhoto(form);
        if (showActionError(error)) continue;
        if (data) added.push(data);
      } catch (err) {
        toast.error(
          `Upload failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    }

    if (added.length > 0) {
      onChange([...photos, ...added]);
      toast.success(
        `${added.length} photo${added.length === 1 ? '' : 's'} uploaded`,
      );
    }
    setBusy(false);
    // Reset the native input so re-picking the same file fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleRemove(photo: BranchPhoto) {
    if (disabled) return;
    if (!confirm('Remove this photo?')) return;
    setBusy(true);
    const { error } = await deleteBranchPhoto({
      branchId,
      path: photo.path,
    });
    setBusy(false);
    if (showActionError(error)) return;
    onChange(photos.filter((p) => p.path !== photo.path));
    toast.success('Photo removed');
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            Photos
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              {photos.length}/3 minimum
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            JPEG / PNG / WebP, up to 5 MB each. The first photo is the cover.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || busy}
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              Uploading
            </>
          ) : (
            <>
              <ImagePlus className="w-4 h-4 mr-1.5" />
              Add photos
            </>
          )}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_MIMES}
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {photos.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-8 text-center text-xs text-muted-foreground">
          No photos yet — add at least 3 before you can list this branch.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <div
              key={p.path}
              className="relative aspect-square border border-border rounded-md overflow-hidden bg-secondary/30 group"
            >
              {/* Using next/image here would require a remotePatterns entry
                  for the Supabase storage host — fall back to a plain <img>
                  so this component is drop-in regardless of next.config. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={`Branch photo ${i + 1}`}
                className="w-full h-full object-cover"
              />
              {i === 0 && (
                <span className="absolute top-1 left-1 text-[10px] font-medium bg-gold/90 text-black px-1.5 py-0.5 rounded">
                  Cover
                </span>
              )}
              {!disabled && (
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => handleRemove(p)}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/70 text-white flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

