-- 20260731000003_storage_buckets.sql
-- Creates the game-assets bucket and sets up RLS policies

INSERT INTO storage.buckets (id, name, public)
VALUES ('game-assets', 'game-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Public read access for everyone
CREATE POLICY "Public read access for game-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'game-assets');

-- Policy: Authenticated users can upload (or Dashboard admins bypass this anyway)
CREATE POLICY "Authenticated users can upload to game-assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'game-assets' AND auth.role() = 'authenticated');
