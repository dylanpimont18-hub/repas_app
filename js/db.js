// js/db.js — Client Supabase + toutes les opérations base de données
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY)

const JOURS_ALL = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']

// ── Auth ─────────────────────────────────────────────────────────────
export async function dbGetSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function dbSignIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function dbSignOut() {
  await supabase.auth.signOut()
}

// ── Préférences ──────────────────────────────────────────────────────
export async function dbGetProfil(profilNom) {
  const { data, error } = await supabase
    .from('preferences')
    .select('ingredient_id, niveau')
    .eq('profil_nom', profilNom)
  if (error) throw error
  return Object.fromEntries(data.map(r => [r.ingredient_id, r.niveau]))
}

export async function dbSetPreference(profilNom, ingredientId, niveau) {
  const { error } = await supabase
    .from('preferences')
    .upsert(
      { profil_nom: profilNom, ingredient_id: ingredientId, niveau },
      { onConflict: 'profil_nom,ingredient_id' }
    )
  if (error) throw error
}

// ── Recettes ─────────────────────────────────────────────────────────
export async function dbGetRecettes() {
  const { data, error } = await supabase
    .from('recettes')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function dbGetRecetteById(id) {
  const { data, error } = await supabase
    .from('recettes')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}

export async function dbUpsertRecette(recette) {
  const id    = recette.id || `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const entry = { ...recette, id, date: recette.date || new Date().toISOString() }
  const { error } = await supabase
    .from('recettes')
    .upsert(entry, { onConflict: 'id' })
  if (error) throw error
  return id
}

export async function dbDeleteRecette(id) {
  const { error } = await supabase.from('recettes').delete().eq('id', id)
  if (error) throw error
}

// ── Planning ─────────────────────────────────────────────────────────
export async function dbGetPlanning(semaineKey) {
  const { data, error } = await supabase
    .from('planning')
    .select('jour, moment, recette_id, portions')
    .eq('semaine_key', semaineKey)
  if (error) throw error
  const planning = {}
  JOURS_ALL.forEach(j => { planning[j] = { midi: null, soir: null } })
  data.forEach(row => {
    planning[row.jour][row.moment] = row.recette_id
      ? { id: row.recette_id, portions: row.portions }
      : null
  })
  return planning
}

export async function dbUpsertPlanning(semaineKey, jour, moment, recetteId, portions) {
  if (!recetteId) {
    const { error } = await supabase.from('planning').delete()
      .eq('semaine_key', semaineKey)
      .eq('jour', jour)
      .eq('moment', moment)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('planning').upsert(
    { semaine_key: semaineKey, jour, moment, recette_id: recetteId, portions },
    { onConflict: 'semaine_key,jour,moment' }
  )
  if (error) throw error
}
