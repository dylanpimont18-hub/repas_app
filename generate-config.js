// Exécuté par Netlify au build pour créer config.js depuis les variables d'environnement
const fs = require('fs')

const config = `const CONFIG = {
  CLAUDE_API_KEY:      '${process.env.CLAUDE_API_KEY      || ''}',
  OPENWEATHER_API_KEY: '${process.env.OPENWEATHER_API_KEY || ''}',
  SUPABASE_URL:        '${process.env.SUPABASE_URL        || ''}',
  SUPABASE_ANON_KEY:   '${process.env.SUPABASE_ANON_KEY   || ''}',
}
`

fs.writeFileSync('config.js', config)
console.log('config.js généré depuis les variables d\'environnement')
