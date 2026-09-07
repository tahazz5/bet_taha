import { getGroupsForUser } from '../db.js';
import { buildGroupResponse } from '../services/helpers.js';
import { authRequired } from '../middleware/auth.js';
import { createGroup, getDashboardData, addMemberToGroup } from '../services/groupService.js';
import { notifyUsers } from '../services/helpers.js';

export function registerGroupRoutes(app, io) {
  app.get('/api/groups', authRequired, (req, res) => res.json({ groups: getGroupsForUser(req.user.id).map(buildGroupResponse) }));
  app.get('/api/dashboard', authRequired, (req, res) => {
    try {
      const payload = getDashboardData(req.user.id);
      return res.json(payload);
    } catch (error) {
      return res.status(error.status || 500).json({ message: error.message || 'Erreur interne.' });
    }
  });

  app.post('/api/groups', authRequired, (req, res) => {
    try {
      const group = createGroup({ userId: req.user.id, name: req.body?.name, startingBudget: req.body?.startingBudget });
      io.to(`user:${req.user.id}`).emit('groupCreated', group);
      return res.status(201).json({ group });
    } catch (error) {
      return res.status(error.status || 500).json({ message: error.message || 'Erreur interne.' });
    }
  });

  app.post('/api/groups/:groupId/members', authRequired, (req, res) => {
    try {
      const groupId = Number(req.params.groupId);
      const payload = addMemberToGroup({ userId: req.user.id, groupId, username: req.body?.username });
      const { group, member } = payload;
      notifyUsers(io, [member.id], `Tu as été ajouté au groupe ${group.name}.`);
      io.to(`group:${groupId}`).emit('groupUpdated', group);
      return res.status(201).json({ group, member });
    } catch (error) {
      return res.status(error.status || 500).json({ message: error.message || 'Erreur interne.' });
    }
  });
}
