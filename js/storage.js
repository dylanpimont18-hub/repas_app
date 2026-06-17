// js/storage.js
export const KEYS = {
  profilDylan:  'repas_profil_dylan',
  profilFemme:  'repas_profil_femme',
  recettes:     'repas_recettes',
  planning:     'repas_planning',
  coursesEtat:  'repas_courses_etat',
  theme:        'repas_theme',
}

export function load(key, defaultValue = null) {
  try {
    const v = localStorage.getItem(key)
    return v !== null ? JSON.parse(v) : defaultValue
  } catch { return defaultValue }
}

export function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function remove(key) {
  localStorage.removeItem(key)
}
