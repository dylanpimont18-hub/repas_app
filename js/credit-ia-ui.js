// js/credit-ia-ui.js — Chargement et affichage du crédit IA (jauge, estimation, erreurs expliquées)
import { dbGetUsageIA, dbGetReglage, dbSetReglage } from './db.js'
import { BUDGET_DEFAUT, resumeCredit, estimerGeneration, formatDollars, debutPeriode } from './credit-ia.js'
import { esc } from './utils.js'
import { icone } from './icones.js'

const CLE_BUDGET = 'ia_budget'
export const PAGE_MAMMOUTH = 'https://mammouth.ai/app/account/settings/api'

export async function getBudget() {
  return { ...BUDGET_DEFAUT, ...(await dbGetReglage(CLE_BUDGET).catch(() => null) || {}) }
}
export async function setBudget(b) {
  await dbSetReglage(CLE_BUDGET, b)
}

// Journal des 3 derniers mois (moyennes) + résumé de la période en cours
export async function chargerCredit() {
  const budget = await getBudget()
  const depuis = debutPeriode(new Date(), budget.jour)
  depuis.setMonth(depuis.getMonth() - 2)
  const lignes = await dbGetUsageIA(depuis).catch(() => [])
  return { budget, lignes, resume: resumeCredit(lignes, budget) }
}

// Niveau de la jauge : ok → attention (< 25 %) → vide
function niveau(r) {
  if (r.reste <= 0) return 'vide'
  return r.reste / (r.budget || 1) < 0.25 ? 'bas' : 'ok'
}

export function htmlJauge(r, { compacte = false } = {}) {
  const reste = Math.max(0, Math.min(100, 100 - r.pourcentage))
  const fin = r.fin.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  return `<div class="credit-jauge credit-${niveau(r)}${compacte ? ' credit-compacte' : ''}">
    <div class="credit-ligne">
      <span class="credit-reste">${formatDollars(r.reste)}<span class="credit-sur"> / ${formatDollars(r.budget)}</span></span>
      <span class="credit-label">${compacte ? 'crédit IA restant' : `restant jusqu'au ${fin}`}</span>
    </div>
    <div class="credit-barre" role="meter" aria-valuemin="0" aria-valuemax="${r.budget}" aria-valuenow="${r.reste.toFixed(2)}"
      aria-label="Crédit IA restant : ${formatDollars(r.reste)} sur ${formatDollars(r.budget)}">
      <div class="credit-rempli" style="width:${reste}%"></div>
    </div>
    ${compacte ? '' : `<div class="credit-ligne credit-details">
      <span>${formatDollars(r.depense)} utilisés · ${r.nbAppels} appel(s)${r.nbErreurs ? ` dont ${r.nbErreurs} en échec` : ''}</span>
      <span>≈ ${r.recettesRestantes} recettes possibles</span>
    </div>`}
  </div>`
}

// « ≈ 0,04 $ pour 6 recettes » ; prévient si le crédit ne suffit pas
export function htmlEstimation(nbRecettes, credit) {
  if (!nbRecettes) return ''
  const { cout, appels } = estimerGeneration(nbRecettes, credit.lignes)
  const r = credit.resume
  const alerte = cout > r.reste
    ? `<span class="credit-alerte">${icone('flamme')}Crédit probablement insuffisant</span>` : ''
  return `<div class="credit-estimation">
    ${icone('etincelle')}<span>Avec l'IA : <strong>≈ ${formatDollars(cout)}</strong> pour ${nbRecettes} recette(s)
    <span class="text-muted">(${appels} envoi(s)) · reste ${formatDollars(r.reste)}</span></span>${alerte}
  </div>`
}

// Bandeau de suivi d'une génération en arrière-plan : etat = encours | fini | partiel | erreur
export function majBandeau(b, { etat, texte, detail = '', pct = 0 }) {
  const fill = b.querySelector('.gen-progress-fill')
  // Pendant la génération : on ne met à jour que le texte et la barre (pas de clignotement)
  if (etat === 'encours' && b.dataset.etat === 'encours' && fill) {
    b.querySelector('.bandeau-ia-texte').textContent = texte
    fill.style.width = `${pct}%`
    return
  }
  b.dataset.etat = etat
  b.className = `bandeau-ia bandeau-ia-${etat}`
  b.innerHTML = `<div class="bandeau-ia-tete">
      ${etat === 'encours' ? '<span class="loader loader-mini"></span>' : icone(etat === 'fini' ? 'check' : 'flamme')}
      <span class="bandeau-ia-texte">${esc(texte)}</span>
      ${etat === 'encours' ? '' : `<button class="bandeau-ia-fermer" aria-label="Fermer">${icone('croix')}</button>`}
    </div>
    ${etat === 'encours' ? `<div class="gen-progress-bar"><div class="gen-progress-fill" style="width:${pct}%"></div></div>
      <p class="text-xs text-muted">Tu peux continuer à utiliser l'appli, mais reste sur cette page jusqu'à la fin.</p>` : ''}
    ${detail}`
  b.querySelector('.bandeau-ia-fermer')?.addEventListener('click', () => b.classList.add('hidden'))
}

// Encadré d'erreur : quoi, pourquoi, que faire (+ détail technique repliable)
export function htmlErreurIA(info, { titre = null } = {}) {
  return `<div class="ia-erreur" role="alert">
    <p class="ia-erreur-titre">${icone('flamme')}${esc(titre || info.titre)}</p>
    <p>${esc(info.explication)}</p>
    <p class="ia-erreur-conseil"><strong>Que faire :</strong> ${esc(info.conseil)}</p>
    ${info.code === 'CREDIT_EPUISE' || info.code === 'CLE_INVALIDE'
      ? `<p><a href="${PAGE_MAMMOUTH}" target="_blank" rel="noopener">Voir mon compte Mammouth</a></p>` : ''}
    ${info.detail ? `<details><summary>Détail technique</summary><code>${esc(info.detail)}</code></details>` : ''}
  </div>`
}
