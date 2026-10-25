// js/impression-recette.js — Impression d'une recette seule (fiche A4 : photo, infos, ingrédients, étapes, astuces)
import { esc } from './utils.js'

function htmlFiche(r) {
  const temps = [
    r.temps_prep ? `Préparation ${r.temps_prep} min` : '',
    r.temps_cuisson ? `Cuisson ${r.temps_cuisson} min` : '',
    r.portions ? `${r.portions} personne(s)` : '',
    r.vegetarien ? 'Végétarien' : '',
  ].filter(Boolean)
  const n = r.nutrition
  return `<article class="fiche">
    <header class="fiche-tete${r.image_url ? ' fiche-tete-photo' : ''}">
      ${r.image_url ? `<img class="fiche-photo" src="${esc(r.image_url)}" alt="">` : ''}
      <div>
        <h1 class="fiche-titre">${esc(r.nom)}</h1>
        ${r.cuisine ? `<p class="fiche-cuisine">Cuisine ${esc(r.cuisine)}</p>` : ''}
        ${temps.length ? `<p class="fiche-infos">${temps.map(esc).join(' · ')}</p>` : ''}
        ${r.description ? `<p class="fiche-description">${esc(r.description)}</p>` : ''}
        ${n?.calories ? `<p class="fiche-nutrition">Par portion : ${esc(n.calories)} kcal · ${esc(n.proteines)} g protéines · ${esc(n.glucides)} g glucides · ${esc(n.lipides)} g lipides</p>` : ''}
      </div>
    </header>
    <div class="fiche-corps">
      <section class="fiche-ingredients">
        <h2>Ingrédients</h2>
        <ul>${(r.ingredients || []).map(i => `<li><span class="fiche-case"></span>${esc(`${i.quantite || ''} ${i.nom || ''}`.trim())}</li>`).join('')}</ul>
      </section>
      <section class="fiche-etapes">
        <h2>Préparation</h2>
        ${r.etapes?.length
          ? `<ol>${r.etapes.map(e => `<li>${esc(e)}</li>`).join('')}</ol>`
          : `<p>${esc(r.description || 'Étapes non renseignées.')}</p>`}
      </section>
    </div>
    ${(r.legumes_caches || []).length ? `<section class="fiche-astuces"><h2>Astuces</h2>
      <ul>${r.legumes_caches.map(l => `<li><strong>${esc(l.legume)}</strong> : ${esc(l.astuce)}</li>`).join('')}</ul></section>` : ''}
    ${r.conservation_jours != null ? `<p class="fiche-conservation">Se conserve ${esc(r.conservation_jours)} jour(s) au réfrigérateur.</p>` : ''}
  </article>`
}

// Attend le chargement de la photo (sinon elle manque à l'impression), au plus 4 s
function photosChargees(zone) {
  const imgs = [...zone.querySelectorAll('img')]
  return Promise.race([
    Promise.all(imgs.map(img => img.complete ? null : new Promise(ok => { img.onload = img.onerror = ok }))),
    new Promise(ok => setTimeout(ok, 4000)),
  ])
}

export async function imprimerRecette(r) {
  let zone = document.getElementById('impressionRecette')
  if (!zone) {
    zone = document.createElement('div')
    zone.id = 'impressionRecette'
    document.body.appendChild(zone)
  }
  zone.innerHTML = htmlFiche(r)
  await photosChargees(zone)
  const titre = document.title
  document.title = r.nom // nom proposé pour « Enregistrer en PDF »
  document.body.classList.add('impression-recette')
  const fin = () => {
    document.body.classList.remove('impression-recette')
    document.title = titre
    window.removeEventListener('afterprint', fin)
  }
  window.addEventListener('afterprint', fin)
  window.print()
}
