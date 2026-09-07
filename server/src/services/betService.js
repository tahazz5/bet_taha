import * as userRepository from '../repositories/userRepository.js';
import * as groupRepository from '../repositories/groupRepository.js';
import * as betRepository from '../repositories/betRepository.js';
import { buildBetResponse, isMemberOfGroup, sanitizeUser } from './helpers.js';

export function createBet({ userId, groupId, title, description, odds, endsAt }) {
  const cleanTitle = (title || '').trim();
  const cleanDescription = (description || '').trim();
  if (!groupId || !cleanTitle || !cleanDescription) {
    throw Object.assign(new Error('Titre et description requis.'), { status: 400 });
  }

  const parsedGroupId = Number(groupId);
  if (!isMemberOfGroup(userId, parsedGroupId)) {
    throw Object.assign(new Error('Tu dois appartenir au groupe pour créer un pari.'), { status: 403 });
  }

  const bet = betRepository.addBet({
    groupId: parsedGroupId,
    creatorId: userId,
    title: cleanTitle,
    description: cleanDescription,
    odds: Number(odds || 1.8),
    endsAt: endsAt || null
  });

  return buildBetResponse(bet);
}

export function joinBet({ userId, betId, option, amount }) {
  const bet = betRepository.getBetById(betId);
  const user = userRepository.getUserById(userId);
  if (!bet) throw Object.assign(new Error('Pari introuvable.'), { status: 404 });
  if (bet.status !== 'open') throw Object.assign(new Error('Ce pari est déjà clôturé.'), { status: 400 });
  if (!user) throw Object.assign(new Error('Utilisateur introuvable.'), { status: 404 });
  if (!isMemberOfGroup(userId, bet.group_id)) throw Object.assign(new Error('Tu dois être membre du groupe.'), { status: 403 });
  if (!['yes', 'no'].includes(option)) throw Object.assign(new Error('Choix invalide.'), { status: 400 });

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw Object.assign(new Error('Montant invalide.'), { status: 400 });
  }

  if (user.credits < numericAmount) {
    throw Object.assign(new Error('Tu n\'as pas assez de crédits.'), { status: 400 });
  }

  const existing = betRepository.getParticipantForBet({ betId, userId });
  if (existing) {
    throw Object.assign(new Error('Tu as déjà rejoint ce pari.'), { status: 409 });
  }

  const updatedCredits = user.credits - numericAmount;
  userRepository.updateUserCredits(user.id, updatedCredits);
  betRepository.addParticipant({ betId, userId: user.id, option, amount: numericAmount });

  return {
    bet: buildBetResponse(betRepository.getBetById(betId)),
    user: sanitizeUser(userRepository.getUserById(user.id))
  };
}

export function addCommentToBet({ userId, betId, message }) {
  const bet = betRepository.getBetById(betId);
  const cleanMessage = (message || '').trim();

  if (!bet) throw Object.assign(new Error('Pari introuvable.'), { status: 404 });
  if (!cleanMessage || cleanMessage.length < 2) throw Object.assign(new Error('Message trop court.'), { status: 400 });
  if (!isMemberOfGroup(userId, bet.group_id)) throw Object.assign(new Error('Tu n\'es pas membre du groupe.'), { status: 403 });

  betRepository.addComment({ betId, userId, message: cleanMessage });
  return buildBetResponse(betRepository.getBetById(betId));
}

export function resolveBet({ userId, betId, winner }) {
  const bet = betRepository.getBetById(betId);
  const cleanWinner = (winner || '').toLowerCase();

  if (!bet) throw Object.assign(new Error('Pari introuvable.'), { status: 404 });
  if (bet.creator_id !== userId) throw Object.assign(new Error('Seul l\'organisateur peut clôturer le pari.'), { status: 403 });
  if (bet.status !== 'open') throw Object.assign(new Error('Ce pari est déjà clôturé.'), { status: 400 });
  if (!['yes', 'no'].includes(cleanWinner)) throw Object.assign(new Error('Choix gagnant invalide.'), { status: 400 });

  const participants = betRepository.getBetParticipants(betId);
  for (const participant of participants) {
    const currentUser = userRepository.getUserById(participant.user_id);
    if (!currentUser) continue;
    const newCredits = participant.option === cleanWinner
      ? currentUser.credits + (participant.amount * bet.odds)
      : currentUser.credits;
    userRepository.updateUserCredits(currentUser.id, Math.round(newCredits));
  }

  betRepository.updateBetStatus({
    betId,
    status: 'resolved',
    winningOption: cleanWinner,
    resolvedAt: new Date().toISOString()
  });

  return buildBetResponse(betRepository.getBetById(betId));
}
