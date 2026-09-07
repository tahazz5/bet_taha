import { hasSession } from '../authStore.js';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';

export function authRequired(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token manquant' });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (!Number.isSafeInteger(decoded.id) || !hasSession(decoded.sid, decoded.id)) return res.status(401).json({ message: 'Session expirée. Reconnectez-vous.' });
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalide' });
  }
}
