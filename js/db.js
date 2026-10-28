// js/db.js — Client Supabase + toutes les opérations base de données
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY)

const JOURS_ALL = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']

function nouvelIdRecette() {
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

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
// Une seule requête pour les deux profils : { dylan: { id: niveau }, femme: { ... } }
export async function dbGetToutesPreferences() {
  const { data, error } = await supabase
    .from('preferences')
    .select('profil_nom, ingredient_id, niveau')
  if (error) throw error
  const res = { dylan: {}, femme: {} }
  data.forEach(r => { res[r.profil_nom][r.ingredient_id] = r.niveau })
  return res
}

export async function dbSetPreference(profilNom, ingredientId, niveau) {
  if (niveau === null) {
    const { error } = await supabase.from('preferences').delete()
      .eq('profil_nom', profilNom).eq('ingredient_id', ingredientId)
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from('preferences')
    .upsert(
      { profil_nom: profilNom, ingredient_id: ingredientId, niveau },
      { onConflict: 'profil_nom,ingredient_id' }
    )
  if (error) throw error
}

// ── Ingrédients personnalisés (partagés dans le foyer) ───────────────
export async function dbGetCustomIngredients() {
  const { data, error } = await supabase
    .from('ingredients_custom')
    .select('id, nom, categorie, emoji')
    .order('nom')
  if (error) throw error
  return data.map(i => ({ ...i, custom: true }))
}

export async function dbAddCustomIngredients(ingredients) {
  const { error } = await supabase.from('ingredients_custom').upsert(
    ingredients.map(({ id, nom, categorie, emoji }) => ({ id, nom, categorie, emoji })),
    { onConflict: 'id' }
  )
  if (error) throw error
}

export async function dbDeleteCustomIngredient(id) {
  const { error } = await supabase.from('ingredients_custom').delete().eq('id', id)
  if (error) throw error
  // Nettoyer les préférences orphelines
  await supabase.from('preferences').delete().eq('ingredient_id', id)
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

// Charge plusieurs recettes en une requête → { id: recette }
export async function dbGetRecettesByIds(ids) {
  const uniques = [...new Set(ids.filter(Boolean))]
  if (!uniques.length) return {}
  const { data, error } = await supabase.from('recettes').select('*').in('id', uniques)
  if (error) throw error
  return Object.fromEntries(data.map(r => [r.id, r]))
}

export async function dbUpsertRecette(recette) {
  const [id] = await dbUpsertRecettes([recette])
  return id
}

// Enregistre plusieurs recettes en une requête, retourne les ids dans le même ordre
export async function dbUpsertRecettes(recettes) {
  if (!recettes.length) return []
  const now = new Date().toISOString()
  const entries = recettes.map(r => ({ ...r, id: r.id || nouvelIdRecette(), date: r.date || now }))
  const { error } = await supabase.from('recettes').upsert(entries, { onConflict: 'id' })
  if (error) throw error
  return entries.map(e => e.id)
}

// Photo d'une recette (mise à jour partielle : le reste de la recette n'est pas touché)
export async function dbSetImageRecette(id, imageUrl) {
  const { error } = await supabase.from('recettes').update({ image_url: imageUrl }).eq('id', id)
  if (error) throw error
}

// Étapes écrites après coup (mise à jour partielle)
export async function dbSetEtapesRecette(id, etapes) {
  const { error } = await supabase.from('recettes').update({ etapes }).eq('id', id)
  if (error) throw error
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

// Lignes brutes du planning pour plusieurs semaines ISO : [{ semaine_key, jour, moment, recette_id, portions, source, avis }]
export async function dbGetPlanningSemaines(semaineKeys) {
  const { data, error } = await supabase
    .from('planning')
    .select('semaine_key, jour, moment, recette_id, portions, source, avis')
    .in('semaine_key', semaineKeys)
  if (error) throw error
  return data
}

export async function dbUpsertPlanning(semaineKey, jour, moment, recetteId, portions, source = 'manuel') {
  if (!recetteId) {
    const { error } = await supabase.from('planning').delete()
      .eq('semaine_key', semaineKey)
      .eq('jour', jour)
      .eq('moment', moment)
    if (error) throw error
    return
  }
  await dbUpsertPlanningLot([{ semaine_key: semaineKey, jour, moment, recette_id: recetteId, portions, source }])
}

// Vide plusieurs créneaux : [{ semaine_key, jour, moment }]
export async function dbViderCreneaux(creneaux) {
  await Promise.all(creneaux.map(({ semaine_key, jour, moment }) =>
    supabase.from('planning').delete().eq('semaine_key', semaine_key).eq('jour', jour).eq('moment', moment)
      .then(({ error }) => { if (error) throw error })))
}

// Assigne plusieurs créneaux en une requête : [{ semaine_key, jour, moment, recette_id, portions, source }]
// Un créneau réécrit perd son avis (il portait sur le plat d'avant)
export async function dbUpsertPlanningLot(lignes) {
  if (!lignes.length) return
  const { error } = await supabase.from('planning')
    .upsert(lignes.map(l => ({ avis: null, ...l })), { onConflict: 'semaine_key,jour,moment' })
  if (error) throw error
}

// ── Courses état ─────────────────────────────────────────────────────
export async function dbGetCoursesEtat(semaineKey) {
  const { data, error } = await supabase
    .from('courses_etat')
    .select('ingredient_nom, checked')
    .eq('semaine_key', semaineKey)
  if (error) throw error
  return Object.fromEntries(data.map(r => [r.ingredient_nom.toLowerCase().trim(), r.checked]))
}

export async function dbToggleCourse(semaineKey, nom, checked) {
  const { error } = await supabase
    .from('courses_etat')
    .upsert(
      { semaine_key: semaineKey, ingredient_nom: nom.toLowerCase().trim(), checked },
      { onConflict: 'semaine_key,ingredient_nom' }
    )
  if (error) throw error
}

export async function dbResetCourses(semaineKey) {
  const { error } = await supabase
    .from('courses_etat')
    .delete()
    .eq('semaine_key', semaineKey)
  if (error) throw error
}

// Avis après le repas (1 / -1) sur les créneaux où la recette a été mangée, et dernier avis sur la recette
export async function dbSetAvis(creneaux, recetteId, avis) {
  await Promise.all(creneaux.map(({ semaine_key, jour, moment }) =>
    supabase.from('planning').update({ avis }).eq('semaine_key', semaine_key).eq('jour', jour).eq('moment', moment)
      .then(({ error }) => { if (error) throw error })))
  const { error } = await supabase.from('recettes').update({ avis }).eq('id', recetteId)
  if (error) throw error
}

// ── Courses : articles ajoutés à la main ─────────────────────────────
export async function dbGetCoursesLibres(semaineKey) {
  const { data, error } = await supabase.from('courses_libres')
    .select('id, nom, partie').eq('semaine_key', semaineKey).order('cree_le')
  if (error) throw error
  return data
}

export async function dbAddCourseLibre(semaineKey, nom, partie) {
  const { error } = await supabase.from('courses_libres').insert({ semaine_key: semaineKey, nom, partie })
  if (error) throw error
}

export async function dbDeleteCourseLibre(id) {
  const { error } = await supabase.from('courses_libres').delete().eq('id', id)
  if (error) throw error
}

// ── Réglages partagés du foyer ───────────────────────────────────────
export async function dbGetReglage(cle) {
  const { data, error } = await supabase.from('reglages').select('valeur').eq('cle', cle).maybeSingle()
  if (error) throw error
  return data?.valeur ?? null
}

export async function dbSetReglage(cle, valeur) {
  const { error } = await supabase.from('reglages').upsert({ cle, valeur }, { onConflict: 'cle' })
  if (error) throw error
}

// ── Réserve congélo ──────────────────────────────────────────────────
export async function dbGetReserve() {
  const { data, error } = await supabase.from('reserve')
    .select('id, recette_id, portions, ajoute_le, recette:recettes(*)')
    .order('ajoute_le')
  if (error) throw error
  return data
}

export async function dbAddReserve(recetteId, portions) {
  const { error } = await supabase.from('reserve').insert({ recette_id: recetteId, portions })
  if (error) throw error
}

export async function dbDeleteReserve(id) {
  const { error } = await supabase.from('reserve').delete().eq('id', id)
  if (error) throw error
}

// ── Temps réel ───────────────────────────────────────────────────────
// Appelle onChange à chaque modification (par n'importe quel membre du foyer) sur les tables données
export function dbEcouter(tables, onChange) {
  const canal = supabase.channel(`sync_${tables.join('_')}_${Math.random().toString(36).slice(2, 6)}`)
  tables.forEach(table => {
    canal.on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
  })
  canal.subscribe()
  return canal
}

// ── Edge Function "ai" (proxy IA, clé côté serveur) ──────────────────
// ── Livres de recettes ───────────────────────────────────────────────
export async function dbGetLivres() {
  const { data, error } = await supabase.from('livres').select('*').order('nom')
  if (error) throw error
  return data
}

// Crée ou met à jour un livre, retourne son id
export async function dbUpsertLivre(livre) {
  const { data, error } = await supabase.from('livres').upsert(livre).select('id').single()
  if (error) throw error
  return data.id
}

export async function dbDeleteLivre(id) {
  const { error } = await supabase.from('livres').delete().eq('id', id)
  if (error) throw error
}

// ── Journal des appels IA (crédit) ───────────────────────────────────
export async function dbAjouterUsageIA(ligne) {
  const { error } = await supabase.from('ia_usage').insert(ligne)
  if (error) throw error
}

export async function dbGetUsageIA(depuis, limite = 500) {
  const { data, error } = await supabase.from('ia_usage').select('*')
    .gte('cree_le', depuis.toISOString()).order('cree_le', { ascending: false }).limit(limite)
  if (error) throw error
  return data
}

export async function dbAppelFonctionIA(body) {
  const session = await dbGetSession()
  if (!session) throw new Error('Session expirée — reconnecte-toi.')
  return fetch(`${CONFIG.SUPABASE_URL}/functions/v1/ai`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': CONFIG.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}
