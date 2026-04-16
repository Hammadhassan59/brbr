-- 029_storage_buckets_private.sql
--
-- Flip `payment-screenshots` and `lead-photos` from public-read to private.
-- Before this migration, anyone who had (or guessed) the object URL could
-- fetch the image for the life of the bucket. Random UUID paths made brute
-- force impractical but shared/leaked URLs (e.g. in a screenshot, a log line,
-- or a pasted chat link) were still a durable data leak vector.
--
-- Paired server-action change (payment-requests.ts / leads.ts) swaps
-- `getPublicUrl()` for `createSignedUrl(path, 900)` so browsers get a
-- 15-minute signed URL instead of a permanent one.
--
-- Uploads and downloads still happen through the service_role client in
-- server actions; service_role bypasses storage RLS, so no explicit
-- storage.objects policies are needed. We spell out an explicit allow policy
-- anyway to make intent obvious and defend against an accidental future
-- storage.objects policy that DENIES service_role.

UPDATE storage.buckets
   SET public = false
 WHERE id IN ('payment-screenshots', 'lead-photos');

-- Explicit service_role policies on storage.objects (defense in depth). These
-- are no-ops as long as the service_role key is used, because service_role
-- bypasses RLS — but they survive any future tightening of the default.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND policyname = 'service_role_rw_private_buckets'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY service_role_rw_private_buckets
        ON storage.objects
        FOR ALL
        TO service_role
        USING (bucket_id IN ('payment-screenshots', 'lead-photos'))
        WITH CHECK (bucket_id IN ('payment-screenshots', 'lead-photos'));
    $pol$;
  END IF;
END
$$;
