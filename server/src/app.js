import { securityHeaders, allowedOrigin, authLimiter, apiLimiter } from './middleware/security.js';
import { IS_PRODUCTION, TRUST_PROXY_HOPS } from './config.js';
import { hasSession } from './authStore.js';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './config.js';
import { getGroupMembership } from './db.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerTicketRoutes } from './routes/ticketRoutes.js';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import { registerAuthRoutes } from './routes/authRoutes.js';
import { registerGroupRoutes } from './routes/groupRoutes.js';
import { registerBetRoutes } from './routes/betRoutes.js';
import { registerFootballRoutes } from './routes/footballRoutes.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, allowedOrigin(origin)),
    methods: ['GET', 'POST']
  }
});

app.disable('x-powered-by');
app.set('trust proxy', TRUST_PROXY_HOPS);
app.use(securityHeaders);
app.use(cors({ origin: (origin, callback) => callback(null, allowedOrigin(origin)) }));
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.headers.origin && !allowedOrigin(req.headers.origin)) return res.status(403).json({ message: 'Origine non autorisée.' });
  next();
});
app.use(express.json({ limit: '32kb' }));
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) return res.status(400).json({ message: 'Objet JSON requis.' });
  next();
}, apiLimiter);
app.use(['/api/login', '/api/register', '/api/refresh'], authLimiter);

registerAuthRoutes(app);
registerTicketRoutes(app);
registerGroupRoutes(app, io);
if (!IS_PRODUCTION) registerBetRoutes(app, io);
registerFootballRoutes(app, io);

const clientDist = fileURLToPath(new URL('../../client/dist/', import.meta.url));
app.use(express.static(clientDist, { setHeaders: (res, file) => { if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path === '/api' || req.path.startsWith('/api/')) return res.status(404).json({ message: 'Route introuvable.' });
  return res.sendFile(path.join(clientDist, 'index.html'));
});

app.use((error, req, res, _next) => {
  const status = error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError && 'body' in error ? 400 : error.status === 404 ? 404 : 500;
  if (status === 500) console.error('Request failed:', req.method, req.path, error.code || error.name);
  res.status(status).json({ message: status === 413 ? 'Requête trop volumineuse.' : status === 400 ? 'JSON invalide.' : status === 404 ? 'Ressource introuvable.' : 'Erreur interne. Réessayez plus tard.' });
});

io.on('connection', (socket) => {
  let user;
  try { user = jwt.verify(socket.handshake.auth?.token, JWT_SECRET); } catch { /* Public catalogue connections cannot join private rooms. */ }
  socket.on('registerUser', (userId) => {
    if (user && hasSession(user.sid, user.id) && user.exp * 1000 > Date.now() && Number(userId) === user.id) socket.join(`user:${user.id}`);
  });
  socket.on('joinGroup', (groupId) => {
    if (user && hasSession(user.sid, user.id) && user.exp * 1000 > Date.now() && getGroupMembership(Number(groupId), user.id)) socket.join(`group:${Number(groupId)}`);
  });
});

export { app, server, io };
