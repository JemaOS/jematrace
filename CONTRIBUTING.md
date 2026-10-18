# Contribuer à RouteScope

Merci de l'intérêt porté au projet. Ce document décrit comment proposer une modification
dans de bonnes conditions.

## Avant de commencer

- Node.js **≥ 20** et npm (le dépôt utilise les *workspaces* npm).
- `npm install` à la racine.
- `npm run dev` : API sur `127.0.0.1:8787`, interface sur `http://localhost:5173`.

## Signaler un problème

Ouvrez une issue en précisant :

1. ce que vous faisiez ;
2. ce que vous attendiez ;
3. ce qui s'est produit (message, capture) ;
4. votre navigateur et votre système ;
5. si possible, le traceroute utilisé (masquez les IP personnelles).

## Proposer du code

```bash
git checkout -b feat/ma-fonctionnalite
# ... modifications ...
npm run typecheck
npm test
git commit -m "feat: description courte"
git push origin feat/ma-fonctionnalite
```

Puis ouvrez une *pull request*. Décrivez le **pourquoi** autant que le **comment**.

### Règles de qualité

- `npm run typecheck` et `npm test` doivent passer (74 tests aujourd'hui).
- Pas de nouvelle dépendance sans justification : le projet vise à rester léger.
- TypeScript strict, pas de `any` non documenté.
- Les commentaires expliquent une intention ou une contrainte, pas la syntaxe.
- Toute modification de formule (vitesse, distance, seuils de routage) doit être
  accompagnée d'un test et d'une note dans le README.
- Respectez les licences des données : ne versionnez pas la base GeoIP (121 Mo) ni de
  données sous licence incompatible.

### Style

- Interface en **français** par défaut, clés i18n dans `apps/web/src/i18n.ts` (FR + EN).
- Couleur d'accent unique : `#5b5bf0`. La palette de latence (rouge → vert) est
  fonctionnelle et ne doit pas être modifiée sans raison.
- Les apparences sont décrites dans `apps/web/src/looks.ts` : une apparence = une entrée
  de la sphère **et** un fond de carte 2D cohérent.

## Commits

Format court et explicite, au présent :

```
feat: sélecteur de système pour la commande
fix: le photon traversait le globe
perf: arcs du globe fusionnés en deux draw calls
docs: README complet
```

## Licence des contributions

En proposant une *pull request*, vous acceptez que votre contribution soit publiée sous
la licence **MIT** du projet (© 2026 JemaTechnology).