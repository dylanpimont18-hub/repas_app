// js/reglages-ui.js — Modèle de semaine, réserve congélo, conversion des anciennes recettes
import { getModele, setModele } from './planning.js'
import { MODELE_DEFAUT, normaliserModele } from './cycle.js'
import { getRecettes } from './recettes.js'
import { convertirRecettes } from './ai.js'
import { dbGetReserve, dbDeleteReserve, dbUpsertRecettes, dbEcouter } from './db.js'
import { esc, debounce } from './utils.js'
import { icone } from './icones.js'

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

async function majBoutonConversion() {
  const anciennes = (await getRecettes()).filter(r => !r.composants)
  const btn = document.getElementById('btnConvertir')
  btn.textContent = anciennes.length ? `Mettre à jour ${anciennes.length} recette(s)` : 'Toutes les recettes sont à jour'
  btn.disabled = anciennes.length === 0
  return anciennes
}

document.addEventListener('DOMContentLoaded', async () => {
  renderModele(await getModele())
  await Promise.all([renderReserve(), majBoutonConversion()])

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
  dbEcouter(['reglages'], debounce(async () => renderModele(await getModele()), 300))
})
