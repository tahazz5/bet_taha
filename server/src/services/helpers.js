import * as userRepository from '../repositories/userRepository.js';
import * as groupRepository from '../repositories/groupRepository.js';
import * as betRepository from '../repositories/betRepository.js';

export function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    credits: user.credits,
    created_at: user.created_at
  };
}

export function isMemberOfGroup(userId, groupId) {
  return !!groupRepository.getGroupMembership(groupId, userId);
}

export function buildGroupResponse(group) {
  const members = groupRepository.getGroupMembers(group.id);
  return {
    ...group,
    members: members.map(({ credits, ...member }) => member)
  };
}

export function buildBetResponse(bet) {
  const participants = betRepository.getBetParticipants(bet.id);
  const comments = betRepository.getBetComments(bet.id);
  const creator = userRepository.getUserByIdNoPassword(bet.creator_id) || { username: 'Inconnu' };
  const group = groupRepository.getGroupById(bet.group_id);

  return {
    ...bet,
    participants,
    comments,
    creator_name: creator.username,
    group_name: group?.name || 'Groupe'
  };
}

export function notifyUsers(io, userIds, message, betId = null) {
  userIds.forEach((userId) => {
    betRepository.createNotification({ userId, message, relatedBetId: betId });
    io.to(`user:${userId}`).emit('notification', {
      userId,
      message,
      relatedBetId: betId,
      created_at: new Date().toISOString()
    });
  });
}
