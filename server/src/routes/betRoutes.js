import * as db from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { notifyUsers } from '../services/helpers.js';
import { createBet, joinBet, addCommentToBet, resolveBet } from '../services/betService.js';

export function registerBetRoutes(app, io) {
  app.post('/api/bets', authRequired, (req, res) => {
    try {
      const bet = createBet({
        userId: req.user.id,
        groupId: req.body?.groupId,
        title: req.body?.title,
        description: req.body?.description,
        odds: req.body?.odds,
        endsAt: req.body?.endsAt
      });

      const groupMembers = db.getGroupMembers(Number(req.body.groupId)).map((member) => member.id);
      notifyUsers(io, groupMembers, `Nouveau pari : ${req.body.title.trim()}`, bet.id);
      io.to(`group:${Number(req.body.groupId)}`).emit('betCreated', bet);
      return res.status(201).json({ bet });
    } catch (error) {
      return res.status(error.status || 500).json({ message: error.message || 'Erreur interne.' });
    }
  });

  app.post('/api/bets/:betId/join', authRequired, (req, res) => {
    try {
      const { bet, user } = joinBet({
        userId: req.user.id,
        betId: Number(req.params.betId),
        option: req.body?.option,
        amount: req.body?.amount
      });

      io.to(`group:${bet.group_id}`).emit('betUpdated', bet);
      return res.json({ message: 'Mise enregistrée.', bet, user });
    } catch (error) {
      return res.status(error.status || 500).json({ message: error.message || 'Erreur interne.' });
    }
  });

  app.post('/api/bets/:betId/comment', authRequired, (req, res) => {
    try {
      const bet = addCommentToBet({
        userId: req.user.id,
        betId: Number(req.params.betId),
        message: req.body?.message
      });

      io.to(`group:${bet.group_id}`).emit('betUpdated', bet);
      return res.status(201).json({ bet });
    } catch (error) {
      return res.status(error.status || 500).json({ message: error.message || 'Erreur interne.' });
    }
  });

  app.post('/api/bets/:betId/resolve', authRequired, (req, res) => {
    try {
      const bet = resolveBet({
        userId: req.user.id,
        betId: Number(req.params.betId),
        winner: req.body?.winner
      });

      const groupMembers = db.getGroupMembers(bet.group_id).map((member) => member.id);
      notifyUsers(io, groupMembers, `Pari terminé : ${bet.title}. Résultat ${bet.winning_option}.`, bet.id);
      io.to(`group:${bet.group_id}`).emit('betUpdated', bet);
      return res.json({ bet, message: 'Pari clôturé et gains distribués.' });
    } catch (error) {
      return res.status(error.status || 500).json({ message: error.message || 'Erreur interne.' });
    }
  });
}
