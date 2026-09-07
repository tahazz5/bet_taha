import * as userRepository from '../repositories/userRepository.js';
import * as groupRepository from '../repositories/groupRepository.js';
import * as betRepository from '../repositories/betRepository.js';
import { buildBetResponse, buildGroupResponse, isMemberOfGroup, sanitizeUser } from './helpers.js';

export function getDashboardData(userId) {
  const user = userRepository.getUserById(userId);
  if (!user) {
    throw Object.assign(new Error('Utilisateur introuvable.'), { status: 404 });
  }

  const groups = groupRepository.getGroupsForUser(user.id).map(buildGroupResponse);
  const bets = betRepository.listBetsForUser(user.id).map(buildBetResponse);
  const notifications = betRepository.getNotificationsForUser(user.id);
  const leaderboard = userRepository.getLeaderboard();

  return {
    user: sanitizeUser(user),
    groups,
    bets,
    notifications,
    leaderboard
  };
}

export function createGroup({ userId, name, startingBudget = 1000 }) {
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!Number.isSafeInteger(startingBudget) || startingBudget < 10 || startingBudget > 1000000) throw Object.assign(new Error('Budget requis : un entier entre 10 et 1 000 000 crédits.'), { status: 400 });
  if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 60) {
    throw Object.assign(new Error('Nom du groupe requis (2+ caractères).'), { status: 400 });
  }

  const group = groupRepository.createGroup(trimmedName, userId, startingBudget);
  return buildGroupResponse(group);
}

export function addMemberToGroup({ userId, groupId, username }) {
  const targetUsername = typeof username === 'string' ? username.trim() : '';
  if (!targetUsername) {
    throw Object.assign(new Error('Nom d\'utilisateur requis.'), { status: 400 });
  }

  const group = groupRepository.getGroupById(groupId);
  if (!group) {
    throw Object.assign(new Error('Groupe introuvable.'), { status: 404 });
  }

  if (group.created_by !== userId) {
    throw Object.assign(new Error('Seul le créateur peut ajouter des amis.'), { status: 403 });
  }

  const member = userRepository.getUserByUsername(targetUsername);
  if (!member) {
    throw Object.assign(new Error('Utilisateur introuvable.'), { status: 404 });
  }

  if (isMemberOfGroup(member.id, groupId)) {
    throw Object.assign(new Error('Cet ami est déjà dans le groupe.'), { status: 409 });
  }

  groupRepository.addGroupMember(groupId, member.id);
  return { group: buildGroupResponse(group), member: sanitizeUser(member) };
}
