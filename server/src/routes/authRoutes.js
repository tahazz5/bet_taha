import jwt from 'jsonwebtoken';
import { JWT_REFRESH_SECRET, JWT_SECRET } from '../config.js';
import { addRefreshToken, getUserIdFromRefreshToken, hasRefreshToken, removeRefreshToken } from '../authStore.js';
import { registerUser, loginUser, signToken, signRefreshToken } from '../services/userService.js';
import * as userRepository from '../repositories/userRepository.js';

export function registerAuthRoutes(app) {
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, message: 'BetFriends API active' });
  });

  app.post('/api/register', async (req, res) => {
    try {
      const payload = await registerUser(req.body || {});
      return res.status(201).json(payload);
    } catch (error) {
      return res.status(error.status || 500).json({ message: error.status ? error.message : 'Erreur interne.' });
    }
  });

  app.post('/api/login', async (req, res) => {
    try {
      const payload = await loginUser(req.body || {});
      return res.json(payload);
    } catch (error) {
      return res.status(error.status || 500).json({ message: error.status ? error.message : 'Erreur interne.' });
    }
  });

  app.post('/api/logout', (req, res) => {
    const refreshToken = req.body?.refreshToken;
    if (typeof refreshToken !== 'string' || refreshToken.length > 2048) {
      return res.status(400).json({ message: 'Refresh token requis.' });
    }

    try {
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
      const userId = getUserIdFromRefreshToken(refreshToken) ?? decoded.id;

      if (!userId || !hasRefreshToken(refreshToken)) {
        return res.status(401).json({ message: 'Session déjà fermée.' });
      }

      removeRefreshToken(refreshToken);
      return res.json({ ok: true, message: 'Déconnexion réussie.' });
    } catch (error) {
      if (refreshToken) {
        removeRefreshToken(refreshToken);
      }
      return res.status(401).json({ message: 'Refresh token invalide ou expiré.' });
    }
  });

  app.post('/api/refresh', (req, res) => {
    const refreshToken = req.body?.refreshToken;
    if (typeof refreshToken !== 'string' || refreshToken.length > 2048) {
      return res.status(400).json({ message: 'Refresh token requis.' });
    }

    if (!hasRefreshToken(refreshToken)) {
      return res.status(401).json({ message: 'Refresh token invalide.' });
    }

    try {
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
      const user = userRepository.getUserById(decoded.id);
      if (!user) {
        removeRefreshToken(refreshToken);
        return res.status(404).json({ message: 'Utilisateur introuvable.' });
      }

      const nextRefreshToken = signRefreshToken(user);
      const newAccessToken = signToken(user, JWT_SECRET, '15m', jwt.decode(nextRefreshToken).jti);
      removeRefreshToken(refreshToken);
      addRefreshToken(nextRefreshToken, user.id);

      return res.json({
        token: newAccessToken,
        refreshToken: nextRefreshToken,
        user: { id: user.id, username: user.username, credits: user.credits, created_at: user.created_at }
      });
    } catch (error) {
      removeRefreshToken(refreshToken);
      return res.status(401).json({ message: 'Refresh token invalide ou expiré.' });
    }
  });
}
