import * as db from '../db.js';

export function addBet({ groupId, creatorId, title, description, odds, endsAt }) {
  return db.addBet({ groupId, creatorId, title, description, odds, endsAt });
}

export function getBetById(id) {
  return db.getBetById(id);
}

export function getBetParticipants(betId) {
  return db.getBetParticipants(betId);
}

export function getBetComments(betId) {
  return db.getBetComments(betId);
}

export function addParticipant({ betId, userId, option, amount }) {
  return db.addParticipant({ betId, userId, option, amount });
}

export function addComment({ betId, userId, message }) {
  return db.addComment({ betId, userId, message });
}

export function createNotification({ userId, message, relatedBetId = null }) {
  return db.createNotification({ userId, message, relatedBetId });
}

export function getNotificationsForUser(userId) {
  return db.getNotificationsForUser(userId);
}

export function listBetsForUser(userId) {
  return db.listBetsForUser(userId);
}

export function updateBetStatus({ betId, status, winningOption, resolvedAt }) {
  return db.updateBetStatus({ betId, status, winningOption, resolvedAt });
}

export function getParticipantForBet({ betId, userId }) {
  return db.getParticipantForBet({ betId, userId });
}
