# Bet Taha

Prototype mobile de paris entre amis inspire d'un sportsbook : wallet en MAD, tickets, pot de competition, classement et matchs avec cotes reelles.

## Lancer le projet

```bash
cd mobile
npm install
npm run web
```

La version actuelle d'Expo/React Native demande Node.js 20.19.4 ou plus.

## Odds API

Le serveur proxy lit la cle depuis `EXPO_PUBLIC_ODDS_API_KEY`.

```bash
cd mobile
$env:EXPO_PUBLIC_ODDS_API_KEY="your_key"
npm run server
```

Sans cle API, l'app n'affiche pas de cotes. Elle demande de configurer le proxy pour charger les vraies cotes bookmaker.

Le proxy utilise The Odds API v4 avec :

- sport par defaut : `soccer_epl`
- region par defaut : `eu`
- marche : `h2h`
- format : `decimal`

Exemple :

```text
http://localhost:8001/api/odds?sport=soccer_epl&region=eu
```

## Argent reel

Ce prototype suit des soldes et tickets en MAD pour une competition privee entre amis. Il ne gere pas les paiements reels, les retraits, le KYC, ni les obligations legales liees aux jeux d'argent.
