// js/preferences-ui.js
import { CATEGORIES, getParCategorie } from './data/ingredients.js'
import { setPreference, getANoter, getProgression, getProfil } from './preferences.js'

let profilActif     = 'dylan'
let categorieActive = Object.keys(CATEGORIES)[0]
let fileAttente     = []
let vueActive       = localStorage.getItem('repas_pref_view_mode') || 'cartes'

const NIVEAUX = [
  { id: 'j_aime_pas', label: '✗ Non',    cls: 'active-naime'  },
  { id: 'neutre',     label: '○ Neutre', cls: 'active-neutre' },
  { id: 'j_aime',     label: '♥ J\'aime', cls: 'active-aime'   },
  { id: 'j_adore',    label: '★ J\'adore', cls: 'active-adore'  },
]

function renderCatChips() {
  const c = document.getElementById('catChips')
  if (!c) return
  c.innerHTML = Object.entries(CATEGORIES).map(([id, cat]) =>
    `<button class="chip ${id === categorieActive ? 'active' : ''}" data-cat="${id}">${cat.emoji} ${cat.label}</button>`
  ).join('')
  c.querySelectorAll('[data-cat]').forEach(btn => {
    btn.addEventListener('click', async () => {
      categorieActive = btn.dataset.cat
      renderCatChips()
      await chargerFile()
    })
  })
}

async function chargerFile() {
  fileAttente = await getANoter(profilActif, categorieActive)
  afficherProchain()
  await updateProgress()
}

function afficherProchain() {
  const finished = document.getElementById('catFinished')
  const card     = document.getElementById('ingredientCard')
  const btns     = document.getElementById('prefButtons')
  if (!card || !btns || !finished) return
  if (fileAttente.length === 0) {
    card.style.display = 'none'
    btns.style.display = 'none'
    finished.style.display = 'block'
    return
  }
  card.style.display = ''
  btns.style.display = ''
  finished.style.display = 'none'
  const ing      = fileAttente[0]
  const cardEmoji = document.getElementById('cardEmoji')
  const cardNom   = document.getElementById('cardNom')
  const cardCat   = document.getElementById('cardCat')
  if (cardEmoji) cardEmoji.textContent = ing.emoji
  if (cardNom)   cardNom.textContent   = ing.nom
  if (cardCat)   cardCat.textContent   = CATEGORIES[ing.categorie]?.label || ''
}

async function updateProgress() {
  const ratio = await getProgression(profilActif, categorieActive)
  const fill  = document.getElementById('progressFill')
  const label = document.getElementById('progressLabel')
  if (fill)  fill.style.width = `${Math.round(ratio * 100)}%`
  const total = getParCategorie(categorieActive).length
  const done  = Math.round(ratio * total)
  if (label) label.textContent =
    `${CATEGORIES[categorieActive].label} — ${done} / ${total} notés`
}

async function renderTableau() {
  const profil = await getProfil(profilActif)
  const table  = document.getElementById('prefTable')
  if (!table) return

  let html = `<thead><tr>
    <th style="min-width:160px;">Ingrédient</th>
    ${NIVEAUX.map(n => `<th>${n.label}</th>`).join('')}
  </tr></thead><tbody>`

  for (const [catId, cat] of Object.entries(CATEGORIES)) {
    const ings = getParCategorie(catId)
    if (!ings.length) continue
    html += `<tr class="cat-header"><td colspan="${1 + NIVEAUX.length}">${cat.emoji} ${cat.label}</td></tr>`
    for (const ing of ings) {
      const niveauActuel = profil[ing.id] || null
      html += `<tr data-ing-id="${ing.id}">`
      html += `<td><span class="ing-name"><span>${ing.emoji}</span><span>${ing.nom}</span></span></td>`
      for (const n of NIVEAUX) {
        const actif = niveauActuel === n.id
        html += `<td style="text-align:center;"><button class="pref-radio-btn ${actif ? n.cls : ''}" data-ing="${ing.id}" data-niveau="${n.id}">${actif ? '●' : '○'}</button></td>`
      }
      html += `</tr>`
    }
  }
  html += '</tbody>'
  table.innerHTML = html

  table.addEventListener('click', async (e) => {
    const btn = e.target.closest('.pref-radio-btn')
    if (!btn) return
    const ingId  = btn.dataset.ing
    const niveau = btn.dataset.niveau
    const row    = table.querySelector(`tr[data-ing-id="${ingId}"]`)
    if (!row) return

    // Déterminer si on désélectionne (clic sur l'actif)
    const niveauDef = NIVEAUX.find(x => x.id === niveau)
    const estActif  = niveauDef && btn.classList.contains(niveauDef.cls)
    if (estActif) {
      // Suppression de la préférence (on passe null — on re-sauvegarde comme vide)
      await setPreference(profilActif, ingId, null)
    } else {
      await setPreference(profilActif, ingId, niveau)
    }

    // Mettre à jour visuellement la ligne sans re-rendre tout le tableau
    row.querySelectorAll('.pref-radio-btn').forEach(b => {
      const n = NIVEAUX.find(x => x.id === b.dataset.niveau)
      if (!n) return
      b.className = 'pref-radio-btn'
      b.textContent = '○'
    })
    if (!estActif) {
      const activeCls = NIVEAUX.find(x => x.id === niveau)?.cls
      btn.classList.add(activeCls)
      btn.textContent = '●'
    }
  })
}

function basculerVue(vue) {
  vueActive = vue
  localStorage.setItem('repas_pref_view_mode', vue)
  document.getElementById('vueCartes').style.display  = vue === 'cartes'  ? '' : 'none'
  document.getElementById('vueTableau').style.display = vue === 'tableau' ? '' : 'none'
  document.getElementById('btnVueCartes').classList.toggle('active',  vue === 'cartes')
  document.getElementById('btnVueTableau').classList.toggle('active', vue === 'tableau')
}

document.addEventListener('DOMContentLoaded', async () => {
  renderCatChips()

  document.querySelectorAll('[data-profil]').forEach(btn => {
    btn.addEventListener('click', async () => {
      profilActif = btn.dataset.profil
      document.querySelectorAll('[data-profil]').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      await chargerFile()
      if (vueActive === 'tableau') await renderTableau()
    })
  })

  document.getElementById('prefButtons')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-niveau]')
    if (!btn || fileAttente.length === 0) return
    const ing = fileAttente.shift()
    await setPreference(profilActif, ing.id, btn.dataset.niveau)
    afficherProchain()
    await updateProgress()
  })

  document.getElementById('btnVueCartes')?.addEventListener('click', () => basculerVue('cartes'))
  document.getElementById('btnVueTableau')?.addEventListener('click', async () => {
    basculerVue('tableau')
    await renderTableau()
  })

  basculerVue(vueActive)
  await chargerFile()
  if (vueActive === 'tableau') await renderTableau()
})
