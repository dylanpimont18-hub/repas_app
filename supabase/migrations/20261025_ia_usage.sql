-- Migration 2026-10-25 — Journal des appels IA (suivi du crédit Mammouth et des erreurs)

CREATE TABLE IF NOT EXISTS ia_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le       TIMESTAMPTZ NOT NULL DEFAULT now(),
  action        TEXT NOT NULL,              -- generation | conversion
  nb_recettes   INTEGER NOT NULL DEFAULT 0, -- recettes demandées dans l'appel
  tokens_entree INTEGER NOT NULL DEFAULT 0,
  tokens_sortie INTEGER NOT NULL DEFAULT 0,
  cout          NUMERIC(10,5) NOT NULL DEFAULT 0, -- en dollars, tarif du modèle
  estime        BOOLEAN NOT NULL DEFAULT false,   -- true si Mammouth n'a pas renvoyé le décompte
  statut        TEXT NOT NULL DEFAULT 'ok',       -- ok | tronque | erreur
  erreur        TEXT                              -- code d'erreur (voir js/credit-ia.js)
);
ALTER TABLE ia_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accès authentifiés" ON ia_usage FOR ALL TO authenticated
  USING ((SELECT public.est_membre_foyer())) WITH CHECK ((SELECT public.est_membre_foyer()));
CREATE INDEX IF NOT EXISTS ia_usage_date_idx ON ia_usage (cree_le DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE ia_usage;
