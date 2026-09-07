import * as db from '../db.js';

export function createGroup(name, createdByUserId, startingBudget) {
  return db.createGroup(name, createdByUserId, startingBudget);
}

export function getGroupById(id) {
  return db.getGroupById(id);
}

export function getGroupMembers(groupId) {
  return db.getGroupMembers(groupId);
}

export function addGroupMember(groupId, userId) {
  return db.addGroupMember(groupId, userId);
}

export function getGroupsForUser(userId) {
  return db.getGroupsForUser(userId);
}

export function getGroupMembership(groupId, userId) {
  return db.getGroupMembership(groupId, userId);
}
