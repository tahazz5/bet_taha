import * as db from '../db.js';

export function getUserById(id) {
  return db.getUserById(id);
}

export function getUserByUsername(username) {
  return db.getUserByUsername(username);
}

export function createUser(username, passwordHash) {
  return db.createUser(username, passwordHash);
}

export function getUserByIdNoPassword(id) {
  return db.getUserByIdNoPassword(id);
}

export function updateUserCredits(userId, newCredits) {
  return db.updateUserCredits(userId, newCredits);
}

export function getLeaderboard() {
  return db.getLeaderboard();
}
