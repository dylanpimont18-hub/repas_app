-- Migration 2026-10-28 — Avis après le repas + articles libres de la liste de courses

-- Avis du foyer sur un repas mangé (1 = on a aimé, -1 = pas aimé) ;
-- recettes.avis garde le dernier avis donné, utilisé par la sélection de la bibliothèque
ALTER TABLE planning ADD COLUMN IF NOT EXISTS avis SMALLINT CHECK (avis IN (-1, 1));
ALTER TABLE recettes ADD COLUMN IF NOT EXISTS avis SMALLINT CHECK (avis IN (-1, 1));

-- Articles ajoutés à la main (pain, lessive…) dans une partie de la liste du cycle ;
-- leur case cochée passe par courses_etat comme les ingrédients des recettes
CREATE TABLE IF NOT EXISTS courses_libres (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semaine_key TEXT NOT NULL,                                   -- clé du cycle (cleCycle)
  nom         TEXT NOT NULL,
  partie      TEXT NOT NULL DEFAULT 'samedi' CHECK (partie IN ('samedi', 'mercredi')),
  cree_le     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE courses_libres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accès authentifiés" ON courses_libres FOR ALL TO authenticated
  USING ((SELECT public.est_membre_foyer())) WITH CHECK ((SELECT public.est_membre_foyer()));
CREATE INDEX IF NOT EXISTS courses_libres_cycle_idx ON courses_libres (semaine_key);

ALTER PUBLICATION supabase_realtime ADD TABLE courses_libres;
