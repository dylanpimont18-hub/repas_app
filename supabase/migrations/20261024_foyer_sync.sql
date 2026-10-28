-- Migration 2026-10-24 — Foyer partagé, ingrédients personnalisés synchronisés, temps réel

-- 1. Membres du foyer : seuls ces comptes accèdent aux données (même si quelqu'un crée un compte)
CREATE TABLE IF NOT EXISTS foyer_membres (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profil_nom TEXT NOT NULL CHECK (profil_nom IN ('dylan', 'femme'))
);
ALTER TABLE foyer_membres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture membres" ON foyer_membres FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Ajouter les comptes du foyer (adresses à remplacer ; elles ne sont pas versionnées) :
-- INSERT INTO foyer_membres (user_id, profil_nom)
-- SELECT id, CASE email WHEN 'adresse-de-dylan@exemple.fr' THEN 'dylan' ELSE 'femme' END
-- FROM auth.users WHERE email IN ('adresse-de-dylan@exemple.fr', 'adresse-de-sa-femme@exemple.fr')
-- ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.est_membre_foyer()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.foyer_membres WHERE user_id = auth.uid()) $$;
REVOKE EXECUTE ON FUNCTION public.est_membre_foyer() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.est_membre_foyer() TO authenticated;

-- 2. Ingrédients personnalisés partagés (auparavant en localStorage, donc invisibles pour l'autre)
CREATE TABLE IF NOT EXISTS ingredients_custom (
  id        TEXT PRIMARY KEY,
  nom       TEXT NOT NULL,
  categorie TEXT NOT NULL,
  emoji     TEXT DEFAULT '🍽️',
  cree_le   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE ingredients_custom ENABLE ROW LEVEL SECURITY;

-- 3. Politiques : accès réservé aux membres du foyer
ALTER POLICY "Accès authentifiés" ON preferences  USING ((SELECT public.est_membre_foyer())) WITH CHECK ((SELECT public.est_membre_foyer()));
ALTER POLICY "Accès authentifiés" ON recettes     USING ((SELECT public.est_membre_foyer())) WITH CHECK ((SELECT public.est_membre_foyer()));
ALTER POLICY "Accès authentifiés" ON planning     USING ((SELECT public.est_membre_foyer())) WITH CHECK ((SELECT public.est_membre_foyer()));
ALTER POLICY "Accès authentifiés" ON courses_etat USING ((SELECT public.est_membre_foyer())) WITH CHECK ((SELECT public.est_membre_foyer()));
CREATE POLICY "Accès authentifiés" ON ingredients_custom FOR ALL TO authenticated USING ((SELECT public.est_membre_foyer())) WITH CHECK ((SELECT public.est_membre_foyer()));

-- 4. Temps réel : diffuser les changements à l'autre téléphone
ALTER PUBLICATION supabase_realtime ADD TABLE planning, recettes, preferences, courses_etat, ingredients_custom;
