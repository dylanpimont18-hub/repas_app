-- Migration 2026-10-24 (b) — Planning famille, cuisine en avance, recettes structurées, réserve congélo

-- 1. Recettes au format structuré (toutes colonnes nullable : les anciennes recettes restent valides)
ALTER TABLE recettes ADD COLUMN IF NOT EXISTS description        TEXT;
ALTER TABLE recettes ADD COLUMN IF NOT EXISTS cuisine            TEXT;
ALTER TABLE recettes ADD COLUMN IF NOT EXISTS composants         JSONB;
ALTER TABLE recettes ADD COLUMN IF NOT EXISTS legumes_caches     JSONB DEFAULT '[]';
ALTER TABLE recettes ADD COLUMN IF NOT EXISTS tags               TEXT[] DEFAULT '{}';
ALTER TABLE recettes ADD COLUMN IF NOT EXISTS conservation_jours INTEGER;

-- 2. Origine d'un créneau du planning (étiquette biblio / ia / reste / reserve / manuel)
ALTER TABLE planning ADD COLUMN IF NOT EXISTS source TEXT;

-- 3. Réglages partagés du foyer (modèle de semaine…)
CREATE TABLE IF NOT EXISTS reglages (
  cle    TEXT PRIMARY KEY,
  valeur JSONB NOT NULL
);
ALTER TABLE reglages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accès authentifiés" ON reglages FOR ALL TO authenticated
  USING ((SELECT public.est_membre_foyer())) WITH CHECK ((SELECT public.est_membre_foyer()));

-- 4. Réserve congélo
CREATE TABLE IF NOT EXISTS reserve (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recette_id TEXT NOT NULL REFERENCES recettes(id) ON DELETE CASCADE,
  portions   INTEGER NOT NULL DEFAULT 4,
  ajoute_le  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE reserve ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accès authentifiés" ON reserve FOR ALL TO authenticated
  USING ((SELECT public.est_membre_foyer())) WITH CHECK ((SELECT public.est_membre_foyer()));
CREATE INDEX IF NOT EXISTS reserve_recette_idx ON reserve (recette_id);

-- 5. Temps réel
ALTER PUBLICATION supabase_realtime ADD TABLE reglages, reserve;
