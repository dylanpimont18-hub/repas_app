-- Migration 2026-10-25 (b) — Livres de recettes (ex. « Air fryer ») avec consigne de génération IA

CREATE TABLE IF NOT EXISTS livres (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom      TEXT NOT NULL,
  consigne TEXT,                         -- règle du livre, envoyée à l'IA (« uniquement à l'air fryer »)
  cree_le  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE livres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accès authentifiés" ON livres FOR ALL TO authenticated
  USING ((SELECT public.est_membre_foyer())) WITH CHECK ((SELECT public.est_membre_foyer()));

-- Une recette appartient à au plus un livre ; supprimer le livre garde ses recettes
ALTER TABLE recettes ADD COLUMN IF NOT EXISTS livre_id UUID REFERENCES livres(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS recettes_livre_idx ON recettes (livre_id);

ALTER PUBLICATION supabase_realtime ADD TABLE livres;
