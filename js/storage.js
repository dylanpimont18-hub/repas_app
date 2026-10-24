// js/storage.js — Helpers localStorage (préférences d'affichage propres à chaque appareil)
export const KEYS = {
  theme: 'repas_theme',
}

export function load(key, defaultValue = null) {
  try {
    const v = localStorage.getItem(key)
    return v !== null ? JSON.parse(v) : defaultValue
  } catch { return defaultValue }
}

export function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* navigation privée */ }
}

export function remove(key) {
  try { localStorage.removeItem(key) } catch { /* navigation privée */ }
}
