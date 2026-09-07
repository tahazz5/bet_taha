import './config.js';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbDir = path.resolve(__dirname, '../data');
fs.mkdirSync(dbDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dbDir, 'betting.db');
if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    credits INTEGER NOT NULL DEFAULT 1000,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, user_id),
    FOREIGN KEY(group_id) REFERENCES groups(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    creator_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    odds REAL NOT NULL DEFAULT 1.8,
    status TEXT NOT NULL DEFAULT 'open',
    winning_option TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ends_at TEXT,
    resolved_at TEXT,
    FOREIGN KEY(group_id) REFERENCES groups(id),
    FOREIGN KEY(creator_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS bet_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bet_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    option TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bet_id, user_id),
    FOREIGN KEY(bet_id) REFERENCES bets(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bet_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(bet_id) REFERENCES bets(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    related_bet_id INTEGER,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(related_bet_id) REFERENCES bets(id)
  );
`);

// Additive migration preserves existing accounts, groups and memberships.
if (!db.prepare('PRAGMA table_info(groups)').all().some(column => column.name === 'starting_budget')) {
  db.exec('ALTER TABLE groups ADD COLUMN starting_budget INTEGER NOT NULL DEFAULT 1000');
}
if (!db.prepare('PRAGMA table_info(group_members)').all().some(column => column.name === 'competition_credits')) {
  db.exec('ALTER TABLE group_members ADD COLUMN competition_credits REAL NOT NULL DEFAULT 1000');
}

export function getDb() {
  return db;
}

export function createUser(username, passwordHash) {
  const stmt = db.prepare(`
    INSERT INTO users (username, password_hash, credits)
    VALUES (?, ?, 1000)
  `);
  const result = stmt.run(username, passwordHash);
  return getUserById(result.lastInsertRowid);
}

export function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

export function createGroup(name, createdByUserId, startingBudget = 1000) {
  return db.transaction(() => {
    const result = db.prepare('INSERT INTO groups (name, created_by, starting_budget) VALUES (?, ?, ?)').run(name, createdByUserId, startingBudget);
    addGroupMember(result.lastInsertRowid, createdByUserId);
    return getGroupById(result.lastInsertRowid);
  })();
}

export function getGroupById(id) {
  return db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
}

export function getGroupMembers(groupId) {
  return db.prepare(`
    SELECT u.id, u.username, u.credits, gm.competition_credits, gm.joined_at
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY gm.joined_at ASC
  `).all(groupId);
}

export function addGroupMember(groupId, userId) {
  const existing = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  if (existing) return existing;
  return db.prepare(`
    INSERT INTO group_members (group_id, user_id, competition_credits)
    VALUES (?, ?, ?)
  `).run(groupId, userId, getGroupById(groupId).starting_budget);
}

export function getGroupsForUser(userId) {
  return db.prepare(`
    SELECT g.*
    FROM group_members gm
    JOIN groups g ON g.id = gm.group_id
    WHERE gm.user_id = ?
    ORDER BY g.created_at DESC
  `).all(userId);
}

export function addBet({ groupId, creatorId, title, description, odds, endsAt }) {
  const stmt = db.prepare(`
    INSERT INTO bets (group_id, creator_id, title, description, odds, ends_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(groupId, creatorId, title, description, odds, endsAt || null);
  return getBetById(result.lastInsertRowid);
}

export function getBetById(id) {
  return db.prepare('SELECT * FROM bets WHERE id = ?').get(id);
}

export function getBetParticipants(betId) {
  return db.prepare(`
    SELECT bp.*, u.username
    FROM bet_participants bp
    JOIN users u ON u.id = bp.user_id
    WHERE bp.bet_id = ?
    ORDER BY bp.created_at ASC
  `).all(betId);
}

export function getBetComments(betId) {
  return db.prepare(`
    SELECT c.*, u.username
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.bet_id = ?
    ORDER BY c.created_at ASC
  `).all(betId);
}

export function addParticipant({ betId, userId, option, amount }) {
  return db.prepare(`
    INSERT INTO bet_participants (bet_id, user_id, option, amount)
    VALUES (?, ?, ?, ?)
  `).run(betId, userId, option, amount);
}

export function addComment({ betId, userId, message }) {
  return db.prepare(`
    INSERT INTO comments (bet_id, user_id, message)
    VALUES (?, ?, ?)
  `).run(betId, userId, message);
}

export function createNotification({ userId, message, relatedBetId = null }) {
  return db.prepare(`
    INSERT INTO notifications (user_id, message, related_bet_id)
    VALUES (?, ?, ?)
  `).run(userId, message, relatedBetId);
}

export function getNotificationsForUser(userId) {
  return db.prepare(`
    SELECT *
    FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 10
  `).all(userId);
}

export function listBetsForUser(userId) {
  return db.prepare(`
    SELECT b.*, g.name AS group_name, u.username AS creator_name
    FROM bets b
    JOIN groups g ON g.id = b.group_id
    JOIN users u ON u.id = b.creator_id
    JOIN group_members gm ON gm.group_id = b.group_id
    WHERE gm.user_id = ?
    ORDER BY b.created_at DESC
  `).all(userId);
}

export function getLeaderboard() {
  return db.prepare(`
    SELECT id, username, credits
    FROM users
    ORDER BY credits DESC, username ASC
    LIMIT 8
  `).all();
}

export function updateUserCredits(userId, newCredits) {
  return db.prepare('UPDATE users SET credits = ? WHERE id = ?').run(newCredits, userId);
}

export function updateBetStatus({ betId, status, winningOption, resolvedAt }) {
  return db.prepare(`
    UPDATE bets
    SET status = ?, winning_option = ?, resolved_at = ?
    WHERE id = ?
  `).run(status, winningOption, resolvedAt, betId);
}

export function getUserByIdNoPassword(id) {
  return db.prepare('SELECT id, username, credits, created_at FROM users WHERE id = ?').get(id);
}

export function getUsersByIds(ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM users WHERE id IN (${placeholders})`).all(...ids);
}

export function getGroupMembership(groupId, userId) {
  return db.prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
}

export function getParticipantForBet({ betId, userId }) {
  return db.prepare('SELECT * FROM bet_participants WHERE bet_id = ? AND user_id = ?').get(betId, userId);
}

export default db;
