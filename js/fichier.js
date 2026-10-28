// js/fichier.js — Donner un fichier à l'utilisateur (export .md) :
// sur iPhone, la feuille de partage (« Enregistrer dans Fichiers », Notes, Mail…) ; ailleurs, un téléchargement
import { informer, signalerErreur } from './dialogue.js'

// « Courses · Sam 24/10 » → « courses-sam-24-10 »
export function nomDeFichier(texte, extension = 'md') {
  const base = String(texte ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'export'
  return `${base}.${extension}`
}

function telecharger(nom, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/** Exporte `contenu` dans un fichier `nom` (type Markdown par défaut) */
export async function exporterFichier(nom, contenu, type = 'text/markdown') {
  const blob = new Blob([contenu], { type: `${type};charset=utf-8` })
  const fichier = new File([blob], nom, { type })
  // Téléphone : feuille de partage avec le fichier (une PWA installée sur iPhone ne sait pas « télécharger »)
  if (navigator.canShare?.({ files: [fichier] }) && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ files: [fichier], title: nom })
      return
    } catch (e) {
      if (e?.name === 'AbortError') return
      console.warn('Partage du fichier impossible, téléchargement', e)
    }
  }
  try {
    telecharger(nom, blob)
    informer(`${nom} enregistré dans tes téléchargements.`, { type: 'ok' })
  } catch (e) { signalerErreur(e, 'Export') }
}
