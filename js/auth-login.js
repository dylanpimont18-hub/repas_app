// js/auth-login.js — Logique de la page de connexion
import { dbSignIn, dbGetSession } from './db.js'

document.addEventListener('DOMContentLoaded', async () => {
  // Déjà connecté → rediriger vers l'accueil
  const session = await dbGetSession()
  if (session) { window.location.href = 'index.html'; return }

  const btnLogin   = document.getElementById('btnLogin')
  const emailInput = document.getElementById('loginEmail')
  const passInput  = document.getElementById('loginPassword')
  const errorEl    = document.getElementById('loginError')

  async function tenterConnexion() {
    const email    = emailInput.value.trim()
    const password = passInput.value
    errorEl.textContent = ''

    if (!email || !password) {
      errorEl.textContent = 'Remplis tous les champs.'
      return
    }

    btnLogin.disabled    = true
    btnLogin.textContent = 'Connexion…'

    try {
      await dbSignIn(email, password)
      window.location.href = 'index.html'
    } catch {
      errorEl.textContent  = 'Email ou mot de passe incorrect.'
      btnLogin.disabled    = false
      btnLogin.textContent = 'Se connecter'
    }
  }

  btnLogin.addEventListener('click', tenterConnexion)
  document.addEventListener('keydown', e => { if (e.key === 'Enter') tenterConnexion() })
})
