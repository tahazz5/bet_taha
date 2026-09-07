import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(serverRoot, '.env') });

export const PORT = Number(process.env.PORT || 4000);
export const JWT_SECRET = process.env.JWT_SECRET || 'betfriends-secret';
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'betfriends-refresh-secret';
export const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || '';
export const FOOTBALL_API_BASE_URL = process.env.FOOTBALL_API_BASE_URL || 'https://v3.football.api-sports.io';

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const APP_ORIGIN = process.env.APP_ORIGIN || '';
export const TRUST_PROXY_HOPS = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT invalide.');
if (IS_PRODUCTION && process.env.DB_PATH === ':memory:') throw new Error('DB_PATH ne peut pas être :memory: en production.');
if (IS_PRODUCTION) {
  for (const name of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    if (!process.env[name] || process.env[name].length < 32 || /change.?me|replace|example/i.test(process.env[name])) throw new Error(`${name} doit contenir un secret aléatoire d’au moins 32 caractères.`);
  }
  if (JWT_SECRET === JWT_REFRESH_SECRET) throw new Error('Les deux secrets JWT doivent être différents.');
  if (!APP_ORIGIN || new URL(APP_ORIGIN).protocol !== 'https:') throw new Error('APP_ORIGIN doit être une origine HTTPS en production.');
}
if (!Number.isInteger(TRUST_PROXY_HOPS) || TRUST_PROXY_HOPS < 0 || TRUST_PROXY_HOPS > 3) throw new Error('TRUST_PROXY_HOPS invalide.');
