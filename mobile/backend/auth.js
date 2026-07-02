const crypto = require('crypto');
const { AUTH_SECRET } = require('./config');

const createToken = (playerId) => {
  const payload = JSON.stringify({ playerId, exp: Date.now() + 1000 * 60 * 60 * 24 });
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
};

const verifyToken = (token) => {
  try {
    const [encoded, signature] = String(token).split('.');
    if (!encoded || !signature) return null;
    const payloadRaw = Buffer.from(encoded, 'base64url').toString('utf-8');
    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payloadRaw).digest('base64url');
    if (expected !== signature) return null;
    const payload = JSON.parse(payloadRaw);
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch (error) {
    return null;
  }
};

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.auth = payload;
  next();
};

module.exports = {
  createToken,
  verifyToken,
  authMiddleware,
};
