import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { APP_ORIGIN, IS_PRODUCTION } from '../config.js';

export const allowedOrigin = origin => !origin || (IS_PRODUCTION ? origin === APP_ORIGIN : /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
export const securityHeaders = helmet({
  contentSecurityPolicy: IS_PRODUCTION ? { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:', 'https://media.api-sports.io'],
    connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: null
  } } : false,
  strictTransportSecurity: IS_PRODUCTION ? { maxAge: 31536000, includeSubDomains: true } : false
});
export const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: IS_PRODUCTION ? 20 : 120, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Trop de tentatives. Réessayez dans 15 minutes.' } });
export const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Trop de requêtes. Réessayez dans une minute.' } });
