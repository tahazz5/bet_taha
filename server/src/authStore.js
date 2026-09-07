import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import db from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, session_id TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
)`);
const hash = token => createHash('sha256').update(String(token)).digest('hex');
export function addRefreshToken(token, userId) {
  const decoded = jwt.decode(token);
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, session_id, user_id, expires_at) VALUES (?, ?, ?, ?)').run(hash(token), decoded.jti, userId, decoded.exp * 1000);
}
export function removeRefreshToken(token) { db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(token)); }
export function revokeUserRefreshTokens(userId) { db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId); }
export function hasRefreshToken(token) { return Boolean(getUserIdFromRefreshToken(token)); }
export function getUserIdFromRefreshToken(token) { return db.prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?').get(hash(token), Date.now())?.user_id; }
export function hasSession(sessionId, userId) { return typeof sessionId === 'string' && Boolean(db.prepare('SELECT 1 FROM sessions WHERE session_id = ? AND user_id = ? AND expires_at > ?').get(sessionId, userId, Date.now())); }
