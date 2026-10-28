// js/import-recette.js — Fenêtre « Importer une recette » : lien d'un site de recettes ou texte collé.
// Le résultat s'ouvre dans le formulaire pour vérification (rien n'est enregistré sans « Enregistrer »).
// L'IA n'est utilisée qu'en dernier recours (« Mettre en forme avec l'IA ») si la lecture automatique échoue.
import { dbAppelFonctionIA } from './db.js'
import { recetteDepuisJsonLd, recetteDepuisTexte, trouverRecette } from './import-pur.js'
import { esc } from './utils.js'
import { icone } from './icones.js'
import { signalerErreur, informer } from './dialogue.js'

function fenetre() {
  let ov = document.getElementById('modalImport')
  if (ov) return ov
  ov = document.createElement('div')
  ov.id = 'modalImport'
  ov.className = 'modal-overlay hidden'
  ov.innerHTML = `<div class="modal">
    <button class="modal-close" data-fermer aria-label="Fermer">${icone('croix')}</button>
    <p class="modal-title">Importer une recette</p>
    <form data-url class="import-bloc">
      <label class="form-label" for="importUrl">Lien d'une page de recette</label>
      <div class="courses-ajout-ligne">
        <input id="importUrl" class="form-input" type="url" inputmode="url" placeholder="https://www.marmiton.org/…" autocomplete="off">
        <button class="btn btn-primary btn-sm" type="submit">Lire</button>
      </div>
      <p class="text-xs text-muted">Marche avec la plupart des sites de recettes (Marmiton, 750g, Cuisine AZ, blogs…).</p>
    </form>
    <form data-texte class="import-bloc">
      <label class="form-label" for="importTexte">Ou colle le texte de la recette</label>
      <textarea id="importTexte" class="form-input" rows="7" placeholder="Nom de la recette&#10;Pour 4 personnes&#10;Ingrédients :&#10;- 400 g de tomates&#10;…&#10;Préparation :&#10;1. …"></textarea>
      <div class="import-actions">
        <button class="btn btn-primary btn-sm" type="submit">Lire le texte</button>
        <button class="btn btn-ghost btn-sm" type="button" data-ia>${icone('etincelle')}Mettre en forme avec l'IA</button>
      </div>
    </form>
    <p class="import-etat text-sm" role="status" aria-live="polite"></p>
  </div>`
  document.body.appendChild(ov)
  ov.querySelector('[data-fermer]').addEventListener('click', () => ov.classList.add('hidden'))
  return ov
}

/** Ouvre la fenêtre ; `ouvrir(recette)` reçoit la recette lue (formulaire de l'appli) */
export function ouvrirImport(ouvrir) {
  const ov = fenetre()
  const etat = ov.querySelector('.import-etat')
  const occupe = (texte) => { etat.innerHTML = texte ? `<span class="loader loader-mini"></span>${esc(texte)}` : '' }
  const terminer = (recette, source) => {
    occupe('')
    if (!recette?.nom || !recette.ingredients?.length) {
      etat.textContent = 'Je n\'ai pas trouvé de recette complète. Colle le texte, ou essaie la mise en forme par l\'IA.'
      return
    }
    ov.classList.add('hidden')
    ouvrir({ ...recette, description: recette.description || (source ? `Importée de ${source}` : null) })
    informer('Vérifie la recette (quantités, halal) puis « Enregistrer ».', { duree: 6000 })
  }

  // Remplace les écouteurs à chaque ouverture (la fenêtre est réutilisée)
  const formUrl = ov.querySelector('[data-url]'), formTexte = ov.querySelector('[data-texte]')
  formUrl.onsubmit = async e => {
    e.preventDefault()
    const url = ov.querySelector('#importUrl').value.trim()
    if (!/^https:\/\//i.test(url)) { etat.textContent = 'Colle un lien complet qui commence par https://'; return }
    occupe('Lecture de la page…')
    try {
      const res = await dbAppelFonctionIA({ action: 'importer', url })
      const corps = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(corps.detail || corps.error || `Erreur ${res.status}`)
      const brute = corps.recettes?.map(trouverRecette).find(Boolean)
      if (brute) return terminer(recetteDepuisJsonLd(brute), new URL(url).hostname.replace(/^www\./, ''))
      // Pas de données de recette dans la page : on propose le texte lu, à mettre en forme
      if (corps.texte) ov.querySelector('#importTexte').value = corps.texte.slice(0, 6000)
      occupe('')
      etat.textContent = 'Cette page ne décrit pas sa recette de façon lisible : son texte a été copié ci-dessous. « Mettre en forme avec l\'IA » pour le structurer.'
    } catch (err) {
      occupe('')
      signalerErreur(err, 'Import du lien')
    }
  }
  formTexte.onsubmit = e => {
    e.preventDefault()
    terminer(recetteDepuisTexte(ov.querySelector('#importTexte').value))
  }
  ov.querySelector('[data-ia]').onclick = async () => {
    const texte = ov.querySelector('#importTexte').value.trim()
    if (!texte) { etat.textContent = 'Colle d\'abord le texte de la recette.'; return }
    occupe('L\'IA met la recette en forme…')
    try {
      const { structurerRecette } = await import('./ai.js')
      terminer(await structurerRecette(texte))
    } catch (err) {
      occupe('')
      signalerErreur(err, 'Mise en forme')
    }
  }
  etat.textContent = ''
  ov.classList.remove('hidden')
}
