# Bet Taha

Prototype mobile de paris entre amis inspire d'un sportsbook : wallet en MAD, tickets, pot de competition, classement et matchs avec cotes reelles.

## Lancer le projet

```bash
cd mobile
npm install
npm run web
```

La version actuelle d'Expo/React Native demande Node.js 20.19.4 ou plus.

## Backend

Le backend fournit l'API de cotes et le stockage du jeu dans `mobile/server.js`.

### Démarrage

```bash
cd mobile
npm install
EXPO_PUBLIC_ODDS_API_KEY="your_key" npm run server
```

### Endpoints disponibles

- `GET /api/odds?sport=<sport>&region=<region>` — proxifie The Odds API
- `GET /api/health` — vérifie que le serveur est en ligne
- `GET /api/state` — récupère l'état actuel du jeu
- `POST /api/state` — remplace l'état du jeu et le persiste
- `POST /api/state/reset` — réinitialise l'état du jeu aux valeurs par défaut

### Exemple de configuration

Le serveur proxy lit la clé depuis `EXPO_PUBLIC_ODDS_API_KEY`.

Le proxy utilise The Odds API v4 avec :

- sport par défaut : `soccer_epl`
- region par défaut : `eu`
- marché : `h2h`
- format : `decimal`

Exemple :

```text
http://localhost:8001/api/odds?sport=soccer_epl&region=eu
```

## Argent reel

Ce prototype suit des soldes et tickets en MAD pour une competition privee entre amis. Il ne gere pas les paiements reels, les retraits, le KYC, ni les obligations legales liees aux jeux d'argent.
