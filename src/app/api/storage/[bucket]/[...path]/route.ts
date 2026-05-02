// Signed-URL backed read endpoint for /opt/storage/<bucket>/<path>.
// Used by listPaymentRequests / listMyLeads / admin payments page after we
// dropped the Supabase Storage container — those callers mint a signed URL
// via createSignedUrl() in @/lib/file-storage and the browser hits this
// route, which validates HMAC + expiry before streaming the file bytes.

import { NextRequest, NextResponse } from 'next/server';
import { readFile, verifySignedUrl } from '@/lib/file-storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ bucket: string; path: string[] }> },
) {
  const { bucket, path: pathSegs } = await ctx.params;
  // Path segments come URL-decoded by Next; rejoin with '/' to reconstitute.
  const objectPath = pathSegs.join('/');

  const url = new URL(req.url);
  const verdict = verifySignedUrl({
    bucket,
    path: objectPath,
    exp: url.searchParams.get('exp'),
    nonce: url.searchParams.get('n'),
    sig: url.searchParams.get('sig'),
  });
  if (!verdict.ok) {
    return new NextResponse(`storage: ${verdict.reason}`, { status: 403 });
  }

  const file = await readFile(bucket, objectPath);
  if (!file) {
    return new NextResponse('not found', { status: 404 });
  }

  // NextResponse takes BodyInit; convert Buffer to a fresh Uint8Array view
  // (Buffer extends Uint8Array but TS's lib.dom.d.ts doesn't accept it directly).
  return new NextResponse(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.bytes.length),
      'Cache-Control': 'private, no-store',
    },
  });
}
