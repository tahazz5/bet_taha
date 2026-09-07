import { useEffect, useState } from 'react';

const format = value => Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const statusLabel = { pending: 'En attente', won: 'Gagné', lost: 'Perdu', void: 'Annulé' };

export default function Friends({ user, groups, api, reloadGroups, login, play, initialGroupId }) {
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('1000');
  const [selected, setSelected] = useState(initialGroupId || '');
  const [friend, setFriend] = useState('');
  const [tickets, setTickets] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [outcomes, setOutcomes] = useState({});
  const group = groups.find(item => item.id === Number(selected)) || groups[0];
  useEffect(() => {
    if (!group) return;
    let active = true;
    const refresh = async () => {
      try { const data = await api(`/api/groups/${group.id}/tickets`); if (active) setTickets(data.tickets); }
      catch (error) { if (active) setMessage(error.message); }
      finally { if (active) setLoading(false); }
    };
    setTickets([]); setLoading(true); refresh();
    const timer = setInterval(refresh, 30000);
    return () => { active = false; clearInterval(timer); };
  }, [group?.id, revision]);
  const perform = async action => {
    setBusy(true); setMessage('');
    try { await action(); await reloadGroups(); setRevision(value => value + 1); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  if (!user) return <section className="simple-page"><p className="eyebrow">ENTRE AMIS</p><h1>Votre groupe. Votre compétition.</h1><p>Créez un groupe privé et choisissez le même budget de départ pour tous.</p><button className="login-button" onClick={login}>Se connecter pour commencer</button></section>;
  const leaderboard = (group?.members || []).map(member => {
    const pending = tickets.filter(ticket => ticket.user_id === member.id && ticket.status === 'pending').reduce((sum, ticket) => sum + ticket.stake, 0);
    return { ...member, pending, capital: Math.round((member.competition_credits + pending) * 100) / 100 };
  }).sort((a,b) => b.capital - a.capital || a.username.localeCompare(b.username));
  return <section className="friends-page"><p className="eyebrow">COMPÉTITIONS PRIVÉES</p><h1>Le défi entre amis.</h1><p className="friends-intro">Un budget identique pour tous, des paris simples ou combinés et votre classement.</p>
    <form className="friends-panel friends-create" onSubmit={event => { event.preventDefault(); perform(async () => { const data = await api('/api/groups', { name, startingBudget: Number(budget) }); setSelected(String(data.group.id)); setName(''); setMessage('Groupe créé. Ajoutez vos amis par leur identifiant.'); }); }}>
      <h2>Créer une compétition</h2><label>Nom du groupe<input required minLength={2} maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder="Les champions du dimanche"/></label><label>Budget de départ par personne<input required type="number" min="10" max="1000000" step="1" value={budget} onChange={event => setBudget(event.target.value)}/></label><p>Crédits fictifs, séparés du portefeuille personnel. Le budget est fixé à la création et reste identique pour les nouveaux membres.</p><button className="login-button" disabled={busy}>Créer le groupe</button>
    </form>
    {message && <p role="status" className="calendar-info">{message}</p>}
    {group && <><label className="friends-select">Mes groupes<select value={group.id} onChange={event => { setSelected(event.target.value); setMessage(''); setFriend(''); }}>{groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <article className="friends-panel"><div className="friends-heading"><div><p className="eyebrow">{group.members.length} MEMBRE{group.members.length > 1 ? 'S' : ''}</p><h2>{group.name}</h2><p>Départ : {format(group.starting_budget)} crédits chacun</p></div><button className="login-button" onClick={() => play(group.id)}>Parier dans ce groupe →</button></div>
        {group.created_by === user.id && <form className="friend-invite" onSubmit={event => { event.preventDefault(); perform(async () => { await api(`/api/groups/${group.id}/members`, { username: friend }); setFriend(''); setMessage('Ami ajouté avec le budget de départ du groupe.'); }); }}><label>Ajouter un ami déjà inscrit<input required value={friend} onChange={event => setFriend(event.target.value)} placeholder="Identifiant de votre ami"/></label><button className="login-button" disabled={busy}>Ajouter</button></form>}
        <h3>Classement</h3><p className="friends-explanation">Capital = crédits disponibles + mises en attente. Les gains potentiels ne comptent pas avant validation du résultat.</p>
        {loading ? <p role="status">Chargement du classement…</p> : <ol className="friends-ranking">{leaderboard.map((member,index) => <li key={member.id}><span className="ranking-position">{index > 0 && member.capital === leaderboard[index-1].capital ? leaderboard.findIndex(item => item.capital === member.capital) + 1 : index + 1}</span><div><strong>{member.username}{member.id === user.id ? ' (vous)' : ''}</strong><small>Disponible : {format(member.competition_credits)} · En jeu : {format(member.pending)}</small></div><b>{format(member.capital)} <small>crédits</small></b></li>)}</ol>}
      </article>
      <article className="friends-panel"><h2>Paris du groupe</h2><p className="friends-explanation">Compétition démo : le créateur valide manuellement chaque résultat. Un coupon réglé ne peut pas être modifié.</p>{!loading && !tickets.length && <p>Aucun pari pour le moment. Lancez le premier défi !</p>}{tickets.map(ticket => <div className="friend-ticket" key={ticket.id}><div className="friends-heading"><strong>{ticket.username} · {ticket.selections.length > 1 ? 'Combiné' : 'Simple'} #{ticket.id}</strong><span>{statusLabel[ticket.status]}</span></div>{ticket.selections.map(selection => <p key={selection.matchId}>{selection.game} · {selection.label} @ {selection.odd}</p>)}<p>Mise : {format(ticket.stake)} · Cote : {ticket.odds.toFixed(2)} · {ticket.status === 'pending' ? `Gain potentiel : ${format(ticket.stake * ticket.odds)}` : `Crédits versés : ${format(ticket.payout)}`}</p>{group.created_by === user.id && ticket.status === 'pending' && <div className="friend-settlement"><select aria-label={`Résultat du coupon ${ticket.id}`} value={outcomes[ticket.id] || ''} onChange={event => setOutcomes(values => ({ ...values, [ticket.id]: event.target.value }))}><option value="">Choisir le résultat</option><option value="won">Gagné : verser le gain</option><option value="lost">Perdu : aucun gain</option><option value="void">Annulé : rembourser la mise</option></select><button className="login-button" disabled={busy || !outcomes[ticket.id]} onClick={() => perform(async () => { await api(`/api/tickets/${ticket.id}/settle`, { outcome: outcomes[ticket.id] }); setMessage('Résultat validé, classement mis à jour.'); })}>Valider le résultat</button></div>}</div>)}</article>
    </>}
  </section>;
}
