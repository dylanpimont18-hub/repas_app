// js/credit-ia.js — Crédit IA : coûts, période de facturation, estimations, explications d'erreur (pur, testé)

// Tarif public de claude-sonnet-5-5 en dollars par million de tokens (Mammouth peut appliquer un tarif proche)
export const TARIF = { entree: 2, sortie: 10 }
export const BUDGET_DEFAUT = { montant: 4, jour: 1, recalage: null } // formule Standard : 4 $ de crédit API par mois
export const TAILLE_LOT = 3 // recettes par appel : réponse courte → ni tronquée ni coupée, et lots en parallèle

// Valeurs de départ tant que le journal n'a pas assez d'appels réussis
const ENTREE_PAR_APPEL = 3000
const SORTIE_PAR_RECETTE = 900

export function coutTokens(entree, sortie) {
  return (entree * TARIF.entree + sortie * TARIF.sortie) / 1e6
}

// Photos : gemini-3.1-flash-image-preview chez Mammouth (0,5 $ / 3 $ par M tokens, ≈ 1 300 tokens par image)
export const TARIF_IMAGE = { entree: 0.5, sortie: 3, tokensParImage: 1300 }
export function coutImage(usage = null) {
  const entree = usage?.prompt_tokens ?? usage?.input_tokens ?? 200
  const sortie = usage?.completion_tokens ?? usage?.output_tokens ?? TARIF_IMAGE.tokensParImage
  return { entree, sortie, cout: (entree * TARIF_IMAGE.entree + sortie * TARIF_IMAGE.sortie) / 1e6, estime: !usage }
}

// Estimation grossière (≈ 3,5 caractères par token en français)
export function estimerTokens(texte) {
  return Math.ceil(String(texte || '').length / 3.5)
}

export function decouperLots(liste, taille = TAILLE_LOT) {
  const lots = []
  for (let i = 0; i < liste.length; i += taille) lots.push(liste.slice(i, i + taille))
  return lots
}

// Début de la période en cours : le crédit se recharge chaque mois le jour `jour`
export function debutPeriode(maintenant, jour = 1) {
  const j = Math.min(Math.max(1, jour), 28)
  const d = new Date(maintenant.getFullYear(), maintenant.getMonth(), j)
  if (maintenant.getDate() < j) d.setMonth(d.getMonth() - 1)
  return d
}

export function finPeriode(maintenant, jour = 1) {
  const d = debutPeriode(maintenant, jour)
  d.setMonth(d.getMonth() + 1)
  return d
}

// Moyennes observées dans le journal (appels réussis), sinon valeurs de départ
export function moyennes(lignes) {
  const ok = lignes.filter(l => l.action === 'generation' && l.statut === 'ok' && l.nb_recettes > 0 && l.tokens_sortie > 0 && !l.estime)
  if (ok.length < 3) return { entreeParAppel: ENTREE_PAR_APPEL, sortieParRecette: SORTIE_PAR_RECETTE, observe: false }
  const somme = (f) => ok.reduce((s, l) => s + f(l), 0)
  return {
    entreeParAppel:   Math.round(somme(l => l.tokens_entree) / ok.length),
    sortieParRecette: Math.round(somme(l => l.tokens_sortie) / somme(l => l.nb_recettes)),
    observe: true,
  }
}

// Coût estimé d'une génération de `nbRecettes` (le prompt est envoyé une fois par lot)
export function estimerGeneration(nbRecettes, lignes = []) {
  if (!nbRecettes) return { cout: 0, appels: 0 }
  const m = moyennes(lignes)
  const appels = Math.ceil(nbRecettes / TAILLE_LOT)
  return { cout: coutTokens(appels * m.entreeParAppel, nbRecettes * m.sortieParRecette), appels }
}

// Coût moyen d'une recette (pour « ≈ N recettes restantes »)
export function coutParRecette(lignes = []) {
  const m = moyennes(lignes)
  return coutTokens(m.entreeParAppel / TAILLE_LOT, m.sortieParRecette)
}

/**
 * Résumé du crédit sur la période en cours.
 * `recalage` = { reste, le } : crédit restant lu sur le site Mammouth à une date donnée ;
 * il remplace le budget si il date de cette période (prend en compte les usages hors appli).
 */
export function resumeCredit(lignes, budget = BUDGET_DEFAUT, maintenant = new Date()) {
  const debut = debutPeriode(maintenant, budget.jour)
  const fin   = finPeriode(maintenant, budget.jour)
  const dans  = lignes.filter(l => new Date(l.cree_le) >= debut)
  const depense = dans.reduce((s, l) => s + Number(l.cout || 0), 0)

  let reste = budget.montant - depense
  const rec = budget.recalage
  if (rec && new Date(rec.le) >= debut) {
    const depuis = dans.filter(l => new Date(l.cree_le) > new Date(rec.le)).reduce((s, l) => s + Number(l.cout || 0), 0)
    reste = rec.reste - depuis
  }
  reste = Math.max(0, reste)
  const parRecette = coutParRecette(lignes)
  return {
    debut, fin, depense, reste, budget: budget.montant,
    pourcentage: budget.montant > 0 ? Math.min(100, Math.round((1 - reste / budget.montant) * 100)) : 100,
    nbAppels: dans.length,
    nbErreurs: dans.filter(l => l.statut !== 'ok').length,
    recettesRestantes: parRecette > 0 ? Math.floor(reste / parRecette) : 0,
    estime: dans.some(l => l.estime),
  }
}

export function formatDollars(v) {
  if (v > 0 && v < 0.01) return '< 0,01 $'
  return `${v.toFixed(2).replace('.', ',')} $`
}

// ── Explications d'erreur ────────────────────────────────────────────
const ERREURS = {
  RESEAU: {
    titre: 'Pas de connexion',
    explication: 'Le téléphone n\'a pas réussi à joindre le serveur.',
    conseil: 'Vérifie le Wi-Fi ou la 4G, puis relance.',
  },
  SESSION: {
    titre: 'Session expirée',
    explication: 'Ta connexion à l\'appli a expiré.',
    conseil: 'Déconnecte-toi puis reconnecte-toi.',
  },
  FOYER: {
    titre: 'Compte non autorisé',
    explication: 'Ce compte n\'est pas enregistré comme membre du foyer.',
    conseil: 'Ajoute-le dans la table foyer_membres sur Supabase.',
  },
  CLE_MANQUANTE: {
    titre: 'Clé Mammouth absente',
    explication: 'Le secret MAMMOUTH_API_KEY n\'est pas configuré sur Supabase.',
    conseil: 'Ajoute-le dans Supabase → Edge Functions → Secrets.',
  },
  CLE_INVALIDE: {
    titre: 'Clé Mammouth refusée',
    explication: 'Mammouth ne reconnaît pas la clé API (révoquée ou mal copiée).',
    conseil: 'Crée une nouvelle clé sur mammouth.ai et remplace le secret MAMMOUTH_API_KEY.',
  },
  CREDIT_EPUISE: {
    titre: 'Crédit IA épuisé',
    explication: 'Le crédit API Mammouth de ce mois est entièrement utilisé.',
    conseil: 'Il se recharge à la date de renouvellement de l\'abonnement. D\'ici là, « Mes recettes » marche sans IA.',
  },
  LIMITE: {
    titre: 'Trop de demandes d\'un coup',
    explication: 'Mammouth limite le nombre d\'appels par minute.',
    conseil: 'Attends une minute puis relance.',
  },
  SURCHARGE: {
    titre: 'Service IA surchargé',
    explication: 'Mammouth ou le modèle est temporairement indisponible.',
    conseil: 'Réessaie dans quelques minutes. Rien n\'a été facturé pour cet appel.',
  },
  MAMMOUTH_INJOIGNABLE: {
    titre: 'Mammouth injoignable',
    explication: 'Le serveur Supabase n\'a pas réussi à contacter Mammouth.',
    conseil: 'Réessaie dans quelques minutes.',
  },
  REQUETE_REFUSEE: {
    titre: 'Demande refusée par Mammouth',
    explication: 'Mammouth a rejeté la demande (modèle indisponible ou paramètre invalide).',
    conseil: 'Si ça se répète, vérifie que le modèle claude-sonnet-5-5 est inclus dans ta formule.',
  },
  TRONQUEE: {
    titre: 'Réponse trop longue',
    explication: 'L\'IA a atteint la longueur maximale avant d\'avoir fini. Les recettes complètes ont été gardées.',
    conseil: 'Relance « Avec l\'IA » pour les repas restés vides.',
  },
  COUPEE: {
    titre: 'Réponse interrompue',
    explication: 'La connexion s\'est coupée pendant que l\'IA écrivait (réseau ou délai du serveur dépassé).',
    conseil: 'Relance pour les repas restés vides : les recettes déjà reçues sont enregistrées.',
  },
  ILLISIBLE: {
    titre: 'Réponse illisible',
    explication: 'L\'IA a répondu dans un format inattendu.',
    conseil: 'Relance : ça arrive rarement deux fois de suite.',
  },
  REFUSEE: {
    titre: 'Recette écartée',
    explication: 'L\'IA a proposé une recette qui ne respectait pas les contraintes (halal ou sélecteurs choisis) : elle n\'a pas été gardée.',
    conseil: 'Relance : la prochaine proposition sera différente.',
  },
  IMAGE_VIDE: {
    titre: 'Pas d\'image reçue',
    explication: 'Le modèle a répondu sans image (refus du sujet ou format inattendu).',
    conseil: 'Relance « Générer une photo » ; si ça persiste, le modèle d\'image a peut-être changé chez Mammouth.',
  },
  STOCKAGE: {
    titre: 'Photo non enregistrée',
    explication: 'L\'image a été créée mais n\'a pas pu être enregistrée dans Supabase.',
    conseil: 'Vérifie que l\'espace de stockage « recettes-images » existe, puis relance.',
  },
  INCONNUE: {
    titre: 'Erreur inattendue',
    explication: 'Le serveur IA a renvoyé une erreur non prévue.',
    conseil: 'Réessaie ; si ça persiste, regarde les journaux de l\'Edge Function sur Supabase.',
  },
}

const MOTS_CREDIT = /credit|crédit|budget|quota|insufficient|exceed|billing|balance|limit reached|payment/i

// Code d'erreur depuis la réponse HTTP de l'Edge Function `ai`
export function codeErreurHttp(status, corps = {}) {
  const detail = String(corps.detail || '')
  if (corps.error === 'CLE_MANQUANTE') return 'CLE_MANQUANTE'
  if (corps.error === 'MAMMOUTH_INJOIGNABLE') return 'MAMMOUTH_INJOIGNABLE'
  if (corps.error === 'IMAGE_VIDE') return 'IMAGE_VIDE'
  if (corps.error === 'STOCKAGE') return 'STOCKAGE'
  if (corps.error === 'ERREUR_IA') {
    if (status === 402 || MOTS_CREDIT.test(detail)) return 'CREDIT_EPUISE'
    if (status === 401 || status === 403) return 'CLE_INVALIDE'
    if (status === 429) return 'LIMITE'
    if (status >= 500) return 'SURCHARGE'
    if (status === 400 || status === 404 || status === 422) return 'REQUETE_REFUSEE'
    return 'INCONNUE'
  }
  if (status === 401) return 'SESSION'
  if (status === 403) return 'FOYER'
  if (status === 429) return 'LIMITE'
  if (status >= 500) return 'SURCHARGE'
  return 'INCONNUE'
}

export function expliquerErreur(code, detail = '') {
  return { code, ...(ERREURS[code] || ERREURS.INCONNUE), detail: detail || '' }
}

// ── Réponse tronquée : récupère les repas complets ───────────────────
// Parcourt le texte et renvoie chaque objet { "id": …, "recette": {…} } entièrement reçu
export function extraireRepasComplets(texte) {
  const debut = texte.indexOf('[', texte.indexOf('"repas"'))
  if (debut < 0) return []
  const repas = []
  let profondeur = 0, ouverture = -1, chaine = false, echappe = false
  for (let i = debut + 1; i < texte.length; i++) {
    const c = texte[i]
    if (chaine) {
      if (echappe) echappe = false
      else if (c === '\\') echappe = true
      else if (c === '"') chaine = false
      continue
    }
    if (c === '"') chaine = true
    else if (c === '{') { if (profondeur++ === 0) ouverture = i }
    else if (c === '}' && --profondeur === 0) {
      try { repas.push(JSON.parse(texte.slice(ouverture, i + 1))) } catch { /* objet abîmé, ignoré */ }
    } else if (c === ']' && profondeur === 0) break
  }
  return repas
}
