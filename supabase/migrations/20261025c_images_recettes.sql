-- Migration 2026-10-25 (c) — Photos des recettes générées par l'IA

ALTER TABLE recettes ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Stockage des photos : lecture publique (balises <img>, impression) ;
-- l'écriture passe uniquement par l'Edge Function `ai` (clé de service), après vérification du foyer
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('recettes-images', 'recettes-images', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
