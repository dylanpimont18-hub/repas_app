-- Migration 2026-10-28 (b) — Journal IA écrit uniquement par l'Edge Function
-- À appliquer APRÈS avoir déployé la nouvelle version de supabase/functions/ai (qui écrit le journal avec la clé de service).
-- Les téléphones lisent le journal (jauge de crédit) mais ne peuvent plus l'écrire, le modifier ni l'effacer :
-- le plafond mensuel vérifié par la fonction repose sur ce journal.

DROP POLICY IF EXISTS "Accès authentifiés" ON ia_usage;
CREATE POLICY "Lecture foyer" ON ia_usage FOR SELECT TO authenticated
  USING ((SELECT public.est_membre_foyer()));
