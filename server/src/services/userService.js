import db from '../db.js';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_REFRESH_SECRET } from '../config.js';
import * as userRepository from '../repositories/userRepository.js';
import * as groupRepository from '../repositories/groupRepository.js';
import { addRefreshToken } from '../authStore.js';
import { buildGroupResponse, sanitizeUser } from './helpers.js';

export function signToken(user, secret = JWT_SECRET, expiresIn = '15m', sessionId) {
  return jwt.sign({ id: user.id, username: user.username, ...(sessionId ? { sid: sessionId } : {}) }, secret, {
    expiresIn, jwtid: randomUUID()
  });
}

export function signRefreshToken(user) {
  return signToken(user, JWT_REFRESH_SECRET, '30d');
}

export async function registerUser({ username, password }) {
  const normalized = typeof username === 'string' ? username.trim() : '';
  if (typeof password !== 'string') throw Object.assign(new Error('Mot de passe requis.'), { status: 400 });
  if (!/^[\p{L}\p{N}_-]{3,30}$/u.test(normalized) || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    throw Object.assign(new Error('Identifiant : 3 à 30 lettres, chiffres, tirets. Mot de passe : au moins 8 caractères, au plus 72 octets.'), { status: 400 });
  }

  const existing = userRepository.getUserByUsername(normalized);
  if (existing) {
    throw Object.assign(new Error('Ce nom d\'utilisateur existe déjà.'), { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    return db.transaction(() => {
      const user = userRepository.createUser(normalized, passwordHash);
      const refreshToken = signRefreshToken(user);
      const token = signToken(user, JWT_SECRET, '15m', jwt.decode(refreshToken).jti);
      addRefreshToken(refreshToken, user.id);
      const firstGroup = groupRepository.createGroup('Mon groupe', user.id);
      return { token, refreshToken, user: sanitizeUser(user), group: buildGroupResponse(firstGroup) };
    })();
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') throw Object.assign(new Error('Ce nom d’utilisateur existe déjà.'), { status: 409 });
    throw error;
  }

}

export async function loginUser({ username, password }) {
  const normalized = typeof username === 'string' ? username.trim() : '';
  if (typeof password !== 'string') throw Object.assign(new Error('Mot de passe requis.'), { status: 400 });
  if (!normalized || normalized.length > 30 || !password || Buffer.byteLength(password, 'utf8') > 72) {
    throw Object.assign(new Error('Identifiants requis.'), { status: 400 });
  }

  const user = userRepository.getUserByUsername(normalized);
  if (!user) {
    await bcrypt.compare(password, '$2a$10$abcdefghijklmnopqrstuuGqWULlwNA5Vjy2VVzmHVapSY/qAa.K');
    throw Object.assign(new Error('Identifiants incorrects.'), { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw Object.assign(new Error('Identifiants incorrects.'), { status: 401 });
  }

  const refreshToken = signRefreshToken(user);
  addRefreshToken(refreshToken, user.id);

  return {
    token: signToken(user, JWT_SECRET, '15m', jwt.decode(refreshToken).jti),
    refreshToken,
    user: sanitizeUser(user)
  };
}
