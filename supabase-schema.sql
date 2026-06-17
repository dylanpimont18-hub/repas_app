-- Schéma Supabase — Application Repas
-- À coller dans l'éditeur SQL de Supabase (SQL Editor → New query)

-- Préférences d'ingrédients par profil (dylan / femme)
CREATE TABLE preferences (
  profil_nom    TEXT NOT NULL CHECK (profil_nom IN ('dylan', 'femme')),
  ingredient_id TEXT NOT NULL,
  niveau        TEXT NOT NULL CHECK (niveau IN ('j_adore', 'j_aime', 'neutre', 'j_aime_pas')),
  PRIMARY KEY (profil_nom, ingredient_id)
);

-- Bibliothèque de recettes (partagée)
CREATE TABLE recettes (
  id            TEXT PRIMARY KEY,
  nom           TEXT NOT NULL,
  vegetarien    BOOLEAN DEFAULT false,
  temps_prep    INTEGER DEFAULT 0,
  temps_cuisson INTEGER DEFAULT 0,
  portions      INTEGER DEFAULT 2,
  ingredients   JSONB DEFAULT '[]',
  etapes        JSONB DEFAULT '[]',
  nutrition     JSONB,
  date          TIMESTAMPTZ DEFAULT now()
);

-- Planning hebdomadaire (partagé)
CREATE TABLE planning (
  semaine_key TEXT NOT NULL,
  jour        TEXT NOT NULL CHECK (jour IN ('lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche')),
  moment      TEXT NOT NULL CHECK (moment IN ('midi', 'soir')),
  recette_id  TEXT REFERENCES recettes(id) ON DELETE SET NULL,
  portions    INTEGER DEFAULT 2,
  PRIMARY KEY (semaine_key, jour, moment)
);

-- Row Level Security : seuls les utilisateurs connectés peuvent accéder aux données
ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE recettes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accès authentifiés" ON preferences FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Accès authentifiés" ON recettes    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Accès authentifiés" ON planning    FOR ALL TO authenticated USING (true) WITH CHECK (true);
