# TahaBet Football — MVP démo

Application football de démonstration avec catalogue, comptes et coupons persistants.

> Cette application n'accepte pas de monnaie réelle. Les cotes et les données de matchs sont mockées. Une mise en production exige un fournisseur de données licencié, un moteur d'odds audité, KYC/AML, géolocalisation, paiement conforme, limites de jeu responsable et les autorisations réglementaires applicables.

## Flux de scores live sous licence

Pour recevoir les scores de matchs réellement en direct, créez une clé chez API-Football/API-Sports puis ajoutez-la dans `server/.env` :

```env
FOOTBALL_API_KEY=votre_cle_api_football
```

`GET /api/live` utilise alors le flux officiel API-Football, mis en cache 15 secondes. `GET /api/matches` utilise la date du jour par défaut et accepte `?date=YYYY-MM-DD` (ex. `GET /api/matches?date=2026-09-07`), avec fuseau `Europe/Paris`. Les cotes restent volontairement démo : il faut un contrat séparé couvrant les données d'odds avant de les montrer ou de les utiliser pour des paris.

## Stack

- Frontend: React + Vite + Socket.IO client
- Backend: Node.js + Express + Socket.IO
- Base de données: SQLite via better-sqlite3

## Compétitions affichées

Le calendrier et le live sont limités à la Premier League anglaise, La Liga, la Serie A italienne, la Bundesliga allemande, la Ligue 1 française, la Champions League, l’Europa League et la Conference League. Le filtrage utilise les identifiants du fournisseur afin d’exclure les championnats homonymes, les coupes nationales et les autres compétitions.

## Fonctionnalités MVP

- Dashboard football responsive et coupon interactif
- Match vedette, cotes, marchés et statistiques live démo
- Portefeuille synchronisé avec les crédits du compte et historique personnel des coupons
- Validation serveur des sélections et cotes, débit transactionnel et protection contre les doubles soumissions
- Recherche, filtres par compétition, fiches match et rafraîchissement toutes les 15 secondes
- Profil connecté et déconnexion
- Catalogue REST : `GET /api/matches`, `GET /api/live`, `GET /api/matches/:id/markets`
- Événement WebSocket `odds:update` disponible pour tester le contrat live

## Démarrage rapide

1. Installer les dépendances :
   npm install

2. Lancer le backend et le frontend en mode dev :
   npm run dev

3. Ouvrir l'application :
   http://localhost:5173

4. API backend :
   http://localhost:4000

## Comptes de démonstration

Créez un compte depuis l’interface pour recevoir 1 000 crédits fictifs. Sélectionnez une cote, saisissez une mise et enregistrez votre coupon. Le portefeuille affiche le solde et l’historique après rechargement. Le coupon propose les modes Simple et Combiné. Un combiné contient de 2 à 20 matchs, avec un seul choix par match et une mise unique. Le bouton « Ajouter un autre match » ramène au calendrier en conservant les sélections ; les cotes se multiplient et toutes les sélections doivent gagner.

Les coupons football personnels ne sont pas réglés automatiquement : le gain affiché reste potentiel. Les matchs à venir du fournisseur disposent de trois marchés de simulation (résultat, total de buts 2.5, les deux équipes marquent). Les cotes sont fixes et fictives, sans rapport avec les probabilités ou un bookmaker. Les mises sont fermées dès le coup d’envoi ; un calendrier non actualisé depuis dix minutes exige un rafraîchissement. L’onglet Amis permet de créer des compétitions privées.

## Scripts

- npm run dev : lance les services API + frontend
- npm run build : construit le frontend pour la production
- npm start : sert l’API et le frontend compilé sur http://localhost:4000 (après npm run build)
- npm test : vérifie les comptes et coupons avec une base en mémoire indépendante, ainsi que le renouvellement de session côté client

Les tests navigateur (`npm run test:e2e`) couvrent les parcours sur ordinateur et mobile. Avant leur première exécution, installez Chromium et ses dépendances avec `npx playwright install --with-deps chromium` ; l’installation des bibliothèques système sous Linux nécessite les droits administrateur.


## Compétitions entre amis

Dans **Amis**, créez un groupe avec un budget de départ de 10 à 1 000 000 crédits fictifs par personne. Le créateur ajoute les amis déjà inscrits par leur identifiant. Tous reçoivent le budget choisi, y compris ceux ajoutés plus tard ; ce budget reste fixe pour le groupe.

Cliquez sur **Parier dans ce groupe**, puis composez votre coupon. Le sélecteur **Budget utilisé** permet de choisir le portefeuille personnel ou un groupe. Une mise de groupe ne débite jamais le portefeuille personnel ni les autres groupes.

Le classement compare le capital : crédits disponibles + mises en attente. En mode démo, le créateur valide manuellement chaque coupon comme gagné, perdu ou annulé ; les gains ou remboursements sont crédités une seule fois au solde du groupe. Les résultats ne sont pas vérifiés automatiquement auprès du fournisseur.

Les données sont conservées dans SQLite. Les migrations ajoutent les champs nécessaires sans effacer les comptes, groupes ou coupons existants. Les connexions Socket.IO doivent transmettre le jeton dans `auth.token` pour accéder aux salons privés.

## Préparation au déploiement

Le chemin recommandé est Docker avec un volume persistant pour SQLite : copiez `server/.env.example` vers `server/.env`, renseignez deux secrets JWT différents de 32 caractères minimum, `APP_ORIGIN` en HTTPS et la clé API Football, puis lancez `docker compose up -d --build`. Le serveur sert l’interface compilée et l’API sur le port 4000 ; placez un reverse proxy HTTPS (Nginx, Caddy ou le proxy de votre hébergeur) devant ce port.

Avant la mise en ligne : `npm ci`, `npm run check`, puis `npm audit` doivent passer. Configurez des sauvegardes régulières du volume `betting-data`, la rotation des secrets et les logs de la plateforme. Cette version reste une démonstration de crédits fictifs : elle ne doit pas accepter d’argent réel sans fournisseur d’odds licencié, KYC/AML, paiements conformes, contrôle d’âge, limites responsables et autorisations réglementaires.
