# Dépendances copiées localement

`supabase-2.118.0.js` : `@supabase/supabase-js` épinglé, en un seul fichier ESM (≈ 58 Ko gzip), servi avec l'appli
et mis en cache par le service worker (fonctionne hors connexion, plus de requêtes en cascade vers esm.sh).

Mise à jour (outil utilisé une seule fois, rien n'est ajouté au projet) :

```sh
mkdir /tmp/sb && cd /tmp/sb && npm init -y && npm i @supabase/supabase-js@<version> esbuild
echo "export * from '@supabase/supabase-js'" > entree.js
npx esbuild entree.js --bundle --format=esm --minify --target=es2020 --legal-comments=eof --outfile=supabase.js
```

Puis copier le fichier ici sous `supabase-<version>.js`, changer l'import dans `js/db.js` et la liste de `sw.js`.
