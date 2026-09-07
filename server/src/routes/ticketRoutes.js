import { getDemoFixture, canBetOnDemoFixture } from '../services/demoFootballMarkets.js';
import db, { getUserByIdNoPassword, getGroupMembership, getGroupById } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { matches } from './footballRoutes.js';

db.exec(`CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
  request_id TEXT NOT NULL, stake REAL NOT NULL, odds REAL NOT NULL,
  selections TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, request_id)
)`);
for (const [name, definition] of [['group_id', 'INTEGER'], ['status', "TEXT NOT NULL DEFAULT 'pending'"], ['payout', 'REAL NOT NULL DEFAULT 0']]) {
  if (!db.prepare('PRAGMA table_info(tickets)').all().some(column => column.name === name)) db.exec(`ALTER TABLE tickets ADD COLUMN ${name} ${definition}`);
}
const list = userId => db.prepare('SELECT t.*, g.name AS group_name FROM tickets t LEFT JOIN groups g ON g.id = t.group_id WHERE t.user_id = ? ORDER BY t.id DESC').all(userId).map(ticket => ({ ...ticket, selections: JSON.parse(ticket.selections) }));
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export function registerTicketRoutes(app) {
  app.get('/api/groups/:groupId/tickets', authRequired, (req, res) => {
    const id = Number(req.params.groupId);
    if (!getGroupMembership(id, req.user.id)) return res.status(403).json({ message: 'Groupe privé.' });
    const tickets = db.prepare('SELECT t.*, u.username FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.group_id = ? ORDER BY t.id DESC').all(id).map(ticket => ({ ...ticket, selections: JSON.parse(ticket.selections) }));
    res.json({ tickets });
  });
  app.post('/api/tickets/:ticketId/settle', authRequired, (req, res) => {
    try {
      const ticket = db.transaction(() => {
        const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(Number(req.params.ticketId));
        if (!ticket || !ticket.group_id) fail('Coupon de groupe introuvable.', 404);
        if (getGroupById(ticket.group_id)?.created_by !== req.user.id) fail('Seul le créateur du groupe valide les résultats démo.', 403);
        if (ticket.status !== 'pending') fail('Ce coupon a déjà été réglé.', 409);
        const outcome = req.body?.outcome;
        if (!['won', 'lost', 'void'].includes(outcome)) fail('Résultat invalide.');
        const payout = outcome === 'won' ? Math.round(ticket.stake * ticket.odds * 100) / 100 : outcome === 'void' ? ticket.stake : 0;
        if (!Number.isFinite(payout)) fail('Gain invalide.');
        db.prepare('UPDATE group_members SET competition_credits = ROUND(competition_credits + ?, 2) WHERE group_id = ? AND user_id = ?').run(payout, ticket.group_id, ticket.user_id);
        db.prepare('UPDATE tickets SET status = ?, payout = ? WHERE id = ?').run(outcome, payout, ticket.id);
        return { id: ticket.id, status: outcome, payout };
      })();
      res.json({ ticket });
    } catch (error) { res.status(error.status || 500).json({ message: error.status ? error.message : 'Impossible de régler ce coupon.' }); }
  });
  app.get('/api/account', authRequired, (req, res) => {
    const user = getUserByIdNoPassword(req.user.id);
    if (!user) return res.status(401).json({ message: 'Compte introuvable.' });
    res.json({ user, tickets: list(user.id) });
  });
  app.post('/api/tickets', authRequired, (req, res) => {
    try {
      const result = db.transaction(() => {
        const { selections, stake, requestId, betType, groupId } = req.body;
        const user = getUserByIdNoPassword(req.user.id);
        if (!user) fail('Compte introuvable.', 401);
        if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 100) fail('Identifiant du coupon requis.');
        const existing = db.prepare('SELECT * FROM tickets WHERE user_id = ? AND request_id = ?').get(user.id, requestId);
        if (existing) {
          const stored = JSON.parse(existing.selections);
          const sameSelections = Array.isArray(selections) && selections.length === stored.length && stored.every((old, index) => {
            const next = selections[index];
            return next && old.matchId === next.matchId && old.odd === Number(next.odd) && (!old.marketId || old.marketId === next.marketId) && (!old.selectionId || old.selectionId === next.selectionId);
          });
          if (existing.stake !== stake || existing.group_id !== (groupId ?? null) || !sameSelections) fail('Ce coupon a déjà été envoyé avec un autre contenu.', 409);
          return { user, tickets: list(user.id) };
        }
        const contestId = groupId == null ? null : groupId;
        if (contestId !== null && (!Number.isSafeInteger(contestId) || contestId < 1)) fail('Groupe invalide.');
        const membership = contestId === null ? null : getGroupMembership(contestId, user.id);
        if (contestId !== null && !membership) fail('Tu dois être membre de ce groupe.', 403);
        const balance = membership ? membership.competition_credits : user.credits;
        if (typeof stake !== 'number' || !Number.isFinite(stake) || stake < 1 || stake > balance || Math.abs(stake * 100 - Math.round(stake * 100)) > 0.00001) fail('Mise invalide ou solde insuffisant.');
        if (!Array.isArray(selections) || !selections.length || selections.length > 20) fail('Sélectionnez entre 1 et 20 matchs.');
        if (betType !== undefined && !['simple', 'combined'].includes(betType)) fail('Type de pari invalide.');
        if (betType === 'combined' && selections.length < 2) fail('Un combiné nécessite au moins deux matchs.');
        if (betType === 'simple' && selections.length !== 1) fail('Un pari simple contient un seul match.');
        const seen = new Set();
        const checked = selections.map(item => {
          if (!item || typeof item.matchId !== 'string' || typeof item.marketId !== 'string' || typeof item.selectionId !== 'string') fail('Sélection invalide.');
          const match = matches.find(m => m.id === item?.matchId) || getDemoFixture(item?.matchId);
          if (item?.matchId?.startsWith('api-football-') && !canBetOnDemoFixture(match)) fail('Ce match est commencé ou indisponible. Actualisez le calendrier.', 409);
          const market = match?.markets.find(m => m.id === item.marketId && m.status === 'open');
          const selection = market?.selections.find(s => s.id === item.selectionId);
          if (!selection || !['live', 'scheduled'].includes(match.status) || seen.has(match.id)) fail('Sélection indisponible ou plusieurs choix sur le même match.');
          if (selection.odd !== Number(item.odd)) fail('Une cote a changé. Actualisez votre coupon.', 409);
          seen.add(match.id);
          return { matchId: match.id, game: `${match.home.name} — ${match.away.name}`, label: selection.name, market: market.name, marketId: market.id, selectionId: selection.id, odd: selection.odd, oddsSource: match.oddsSource || 'demo' };
        });
        const odds = checked.reduce((n, item) => n * item.odd, 1);
        if (!Number.isFinite(odds) || odds <= 1) fail('Cote invalide.');
        if (membership) db.prepare('UPDATE group_members SET competition_credits = ROUND(competition_credits - ?, 2) WHERE id = ?').run(stake, membership.id);
        else db.prepare('UPDATE users SET credits = ROUND(credits - ?, 2) WHERE id = ?').run(stake, user.id);
        db.prepare('INSERT INTO tickets (user_id, request_id, stake, odds, selections, group_id) VALUES (?, ?, ?, ?, ?, ?)').run(user.id, requestId, stake, odds, JSON.stringify(checked), contestId);
        return { user: getUserByIdNoPassword(user.id), tickets: list(user.id) };
      })();
      res.status(201).json(result);
    } catch (error) { res.status(error.status || 500).json({ message: error.status ? error.message : 'Impossible d’enregistrer le coupon.' }); }
  });
}
