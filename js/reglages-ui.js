// js/reglages-ui.js — Modèle de semaine, réserve congélo, conversion des anciennes recettes
import { getModele, setModele } from './planning.js'
import { MODELE_DEFAUT, normaliserModele } from './cycle.js'
import { getRecettes } from './recettes.js'
import { convertirRecettes, genererImageRecette } from './ai.js'
import { dbGetReserve, dbDeleteReserve, dbUpsertRecettes, dbEcouter, dbSetImageRecette } from './db.js'
import { esc, debounce } from './utils.js'
import { icone } from './icones.js'
import { expliquerErreur, formatDollars, coutImage } from './credit-ia.js'
import { chargerCredit, setBudget, htmlJauge, htmlErreurIA } from './credit-ia-ui.js'
import { photosAutoActives, setPhotosAuto, invaliderPhotosAuto, ERREURS_BLOQUANTES } from './photos-auto.js'

const JOURS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
const LABEL = { lundi:'Lun', mardi:'Mar', mercredi:'Mer', jeudi:'Jeu', vendredi:'Ven', samedi:'Sam', dimanche:'Dim' }
const LABEL_LONG = { lundi:'Lundi', mardi:'Mardi', mercredi:'Mercredi', jeudi:'Jeudi', vendredi:'Vendredi', samedi:'Samedi', dimanche:'Dimanche' }
const QUI = [
  { id: 'famille', label: 'Famille', profils: ['dylan', 'femme'] },
  { id: 'femme',   label: 'Ma femme',      profils: ['femme'] },
  { id: 'dylan',   label: 'Dylan',         profils: ['dylan'] },
]
const LOT_CONVERSION = 5

const quiDe = profils => (profils.length > 1 ? 'famille' : profils[0])

// Un bloc par jour : lisible sur mobile, en grille sur ordinateur
function renderModele(modele) {
  const zone = document.getElementById('modeleTable')
  const repas = (jour, moment) => {
    const r = modele[jour][moment]
    return `<div class="modele-repas">
      <span class="modele-moment">${icone(moment === 'midi' ? 'soleil' : 'lune')}${moment === 'midi' ? 'Midi' : 'Soir'}</span>
      <select data-jour="${jour}" data-moment="${moment}" data-champ="qui" aria-label="${LABEL[jour]} ${moment} : qui mange">
        ${QUI.map(q => `<option value="${q.id}" ${quiDe(r.profils) === q.id ? 'selected' : ''}>${q.label}</option>`).join('')}
      </select>
      <input type="number" inputmode="numeric" min="1" max="12" value="${r.portions}" data-jour="${jour}" data-moment="${moment}" data-champ="portions" aria-label="${LABEL[jour]} ${moment} : portions">
    </div>`
  }
  zone.innerHTML = JOURS.map(jour => `<div class="modele-jour">
      <div class="modele-jour-tete">
        <span class="modele-jour-nom">${LABEL_LONG[jour]}</span>
        <label class="modele-cuisine">${icone('marmite')}<span>Cuisiné</span>
          <select data-jour="${jour}" data-champ="cuisineLe" aria-label="${LABEL_LONG[jour]} : jour de cuisine">
            ${JOURS.map(j => `<option value="${j}" ${modele[jour].cuisineLe === j ? 'selected' : ''}>${j === jour ? 'sur place' : `le ${LABEL_LONG[j].toLowerCase()}`}</option>`).join('')}
          </select>
        </label>
      </div>
      ${repas(jour, 'midi')}${repas(jour, 'soir')}
    </div>`).join('')
}

function lireModele() {
  const m = normaliserModele({})
  document.querySelectorAll('#modeleTable [data-champ]').forEach(el => {
    const { jour, moment, champ } = el.dataset
    if (champ === 'cuisineLe') m[jour].cuisineLe = el.value
    if (champ === 'portions')  m[jour][moment].portions = Math.max(1, parseInt(el.value, 10) || 1)
    if (champ === 'qui')       m[jour][moment].profils = QUI.find(q => q.id === el.value).profils
  })
  return m
}

async function renderReserve() {
  const list = document.getElementById('reserveList')
  const reserve = await dbGetReserve()
  list.innerHTML = reserve.length === 0
    ? '<p class="text-sm text-muted">Rien au congélo pour l\'instant.</p>'
    : reserve.map(x => `<div class="flex" style="align-items:center;gap:0.5rem;padding:0.4rem 0;border-bottom:1px solid var(--color-border-light);">
        <span style="flex:1;">${esc(x.recette?.nom || 'Recette supprimée')}</span>
        <span class="text-xs text-muted">${x.portions} parts, ${new Date(x.ajoute_le).toLocaleDateString('fr-FR')}</span>
        <button class="list-act-btn list-act-del" data-del="${esc(x.id)}" title="Retirer" aria-label="Retirer ${esc(x.recette?.nom || '')}">${icone('croix')}</button>
      </div>`).join('')
  list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    await dbDeleteReserve(b.dataset.del)
    await renderReserve()
  }))
}

// ── Crédit IA : jauge, réglages du budget, historique avec erreurs expliquées ──
const ACTIONS_IA = { generation: 'Génération', conversion: 'Mise à jour', image: 'Photo' }
let budgetActuel = null

async function renderCredit() {
  const { budget, lignes, resume } = await chargerCredit()
  budgetActuel = budget
  document.getElementById('creditJauge').innerHTML = htmlJauge(resume)
    + (resume.estime ? '<p class="text-xs text-muted">Certains coûts sont estimés (Mammouth n\'a pas renvoyé le décompte exact).</p>' : '')
  const montant = document.getElementById('creditMontant')
  if (![...montant.options].some(o => Number(o.value) === budget.montant)) montant.add(new Option(`${budget.montant} $`, budget.montant))
  montant.value = String(budget.montant)
  document.getElementById('creditJour').value = String(budget.jour)

  const recents = lignes.slice(0, 15)
  document.getElementById('creditHistorique').innerHTML = recents.length === 0
    ? '<p class="text-sm text-muted">Aucun appel IA pour l\'instant.</p>'
    : recents.map((l, i) => {
      const date = new Date(l.cree_le).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      const echec = l.statut !== 'ok'
      return `<div class="credit-appel${echec ? ' credit-appel-echec' : ''}">
        <span class="credit-appel-date">${esc(date)}</span>
        <span class="credit-appel-quoi">${ACTIONS_IA[l.action] || esc(l.action)}${l.action === 'image' ? '' : ` · ${l.nb_recettes} recette(s)`}</span>
        <span class="credit-appel-cout">${formatDollars(Number(l.cout))}${l.estime ? '*' : ''}</span>
        ${echec ? `<button class="btn btn-ghost btn-sm credit-appel-pourquoi" data-erreur="${i}">${icone('loupe')}${esc(expliquerErreur(l.erreur).titre)}</button>
          <div class="credit-appel-explication hidden" data-explication="${i}">${htmlErreurIA(expliquerErreur(l.erreur))}</div>` : ''}
      </div>`
    }).join('')
  document.querySelectorAll('[data-erreur]').forEach(b => b.addEventListener('click', () =>
    document.querySelector(`[data-explication="${b.dataset.erreur}"]`).classList.toggle('hidden')))
}

async function enregistrerBudget(changement, message) {
  const status = document.getElementById('creditStatus')
  try {
    await setBudget({ ...budgetActuel, ...changement })
    status.textContent = message
    await renderCredit()
  } catch (e) { status.textContent = e.message }
}

// ── Photos : réglage automatique + photos manquantes de toute la bibliothèque ──
let photosEnCours = false

async function renderPhotos() {
  document.getElementById('photoCout').textContent = formatDollars(coutImage().cout)
  document.getElementById('photosAuto').checked = await photosAutoActives()
  const sans = (await getRecettes()).filter(r => !r.image_url)
  const btn = document.getElementById('btnPhotosManquantes')
  if (!photosEnCours) {
    btn.innerHTML = sans.length
      ? `${icone('etincelle')}Photos manquantes (${sans.length}) · ≈ ${formatDollars(coutImage().cout * sans.length)}`
      : `${icone('check')}Toutes les recettes ont une photo`
    btn.disabled = sans.length === 0
  }
  return sans
}

async function photosManquantes() {
  const sans = await renderPhotos()
  if (!sans.length || photosEnCours) return
  if (!confirm(`Créer ${sans.length} photo(s) pour ≈ ${formatDollars(coutImage().cout * sans.length)} ? Reste sur cette page pendant la création.`)) return
  const btn = document.getElementById('btnPhotosManquantes')
  const status = document.getElementById('photosStatus')
  const zoneErreur = document.getElementById('photosErreur')
  photosEnCours = true
  btn.disabled = true
  zoneErreur.innerHTML = ''
  let faites = 0, echecs = 0
  for (const r of sans) {
    btn.innerHTML = `<span class="loader loader-mini"></span>Photo ${faites + echecs + 1} / ${sans.length}…`
    try {
      await dbSetImageRecette(r.id, await genererImageRecette(r))
      faites++
    } catch (e) {
      echecs++
      const info = e.info || expliquerErreur('INCONNUE', e.message)
      zoneErreur.innerHTML = htmlErreurIA(info)
      if (ERREURS_BLOQUANTES.includes(info.code)) break
    }
  }
  status.textContent = `${faites} photo(s) créée(s)` + (echecs ? ` · ${echecs} en échec` : '') + (faites + echecs < sans.length ? ' · arrêté' : '')
  photosEnCours = false
  await renderPhotos()
}

async function majBoutonConversion() {
  const anciennes = (await getRecettes()).filter(r => !r.composants)
  const btn = document.getElementById('btnConvertir')
  btn.textContent = anciennes.length ? `Mettre à jour ${anciennes.length} recette(s)` : 'Toutes les recettes sont à jour'
  btn.disabled = anciennes.length === 0
  return anciennes
}

document.addEventListener('DOMContentLoaded', async () => {
  renderModele(await getModele())
  document.getElementById('creditJour').innerHTML = Array.from({ length: 28 }, (_, i) =>
    `<option value="${i + 1}">le ${i + 1}${i === 0 ? 'er' : ''} du mois</option>`).join('')
  await Promise.all([renderReserve(), majBoutonConversion(), renderCredit(), renderPhotos()])

  document.getElementById('photosAuto').addEventListener('change', async (e) => {
    const status = document.getElementById('photosStatus')
    try {
      await setPhotosAuto(e.target.checked)
      status.textContent = e.target.checked ? 'Photos automatiques activées.' : 'Photos automatiques désactivées.'
    } catch (err) {
      e.target.checked = !e.target.checked
      status.textContent = err.message
    }
  })
  document.getElementById('btnPhotosManquantes').addEventListener('click', photosManquantes)
  window.addEventListener('beforeunload', (e) => { if (photosEnCours) { e.preventDefault(); e.returnValue = '' } })

  document.getElementById('creditMontant').addEventListener('change', (e) =>
    enregistrerBudget({ montant: Number(e.target.value) }, 'Crédit mensuel enregistré.'))
  document.getElementById('creditJour').addEventListener('change', (e) =>
    enregistrerBudget({ jour: Number(e.target.value) }, 'Date de recharge enregistrée.'))
  document.getElementById('btnRecaler').addEventListener('click', () => {
    const v = parseFloat(document.getElementById('creditRecalage').value.replace(',', '.'))
    if (!Number.isFinite(v) || v < 0) { document.getElementById('creditStatus').textContent = 'Indique le montant restant affiché par Mammouth.'; return }
    document.getElementById('creditRecalage').value = ''
    enregistrerBudget({ recalage: { reste: v, le: new Date().toISOString() } }, `Recalé sur ${formatDollars(v)}.`)
  })

  document.getElementById('btnSaveModele').addEventListener('click', async () => {
    const status = document.getElementById('modeleStatus')
    try {
      await setModele(lireModele())
      status.textContent = 'Enregistré. Le planning utilise ce modèle.'
    } catch (e) { status.textContent = e.message }
  })
  document.getElementById('btnResetModele').addEventListener('click', () => {
    renderModele(normaliserModele(MODELE_DEFAUT))
    document.getElementById('modeleStatus').textContent = 'Valeurs par défaut affichées — pense à enregistrer.'
  })

  document.getElementById('btnConvertir').addEventListener('click', async (e) => {
    const btn = e.currentTarget, status = document.getElementById('convertirStatus')
    const anciennes = await majBoutonConversion()
    btn.disabled = true
    let faites = 0
    try {
      for (let i = 0; i < anciennes.length; i += LOT_CONVERSION) {
        status.textContent = `${faites} / ${anciennes.length}…`
        const converties = await convertirRecettes(anciennes.slice(i, i + LOT_CONVERSION))
        await dbUpsertRecettes(converties)
        faites += converties.length
      }
      status.textContent = `${faites} recette(s) mises à jour.`
    } catch (err) {
      status.textContent = `${err.message} (${faites} déjà faites)`
    }
    await majBoutonConversion()
  })

  dbEcouter(['reserve'], debounce(renderReserve, 300))
  dbEcouter(['ia_usage'], debounce(renderCredit, 500))
  dbEcouter(['reglages'], debounce(async () => { renderModele(await getModele()); invaliderPhotosAuto(); await renderPhotos() }, 300))
  dbEcouter(['recettes'], debounce(renderPhotos, 500))
})
