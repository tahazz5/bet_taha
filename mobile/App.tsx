import React, { useMemo, useState } from 'react';
import { Alert, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

type Pick = 'home' | 'draw' | 'away';
type Tab = 'matches' | 'tickets' | 'friends';

type Player = {
  id: number;
  name: string;
  balance: number;
  role: string;
};

type Match = {
  id: string;
  league: string;
  home: string;
  away: string;
  date: string;
  bookmaker: string;
  updatedAt: string;
  odds: Record<Pick, number>;
  status: 'upcoming' | 'settled';
  result: Pick | null;
};

type Bet = {
  id: number;
  playerId: number;
  playerName: string;
  matchId: string;
  label: string;
  selection: Pick;
  stake: number;
  odds: number;
  potentialReturn: number;
  result: 'pending' | 'won' | 'lost';
};

const CURRENCY = 'MAD';
const STARTING_BALANCE = 500;
const ENTRY_FEE = 50;
const STAKES = [10, 25, 50, 100];
const ODDS_URL = Platform.OS === 'web'
  ? '/api/odds?sport=soccer_epl&region=eu'
  : 'http://localhost:8001/api/odds?sport=soccer_epl&region=eu';

const INITIAL_PLAYERS: Player[] = [
  { id: 1, name: 'Taha', balance: STARTING_BALANCE, role: 'Host' },
  { id: 2, name: 'Mina', balance: STARTING_BALANCE, role: 'Invitee' },
  { id: 3, name: 'Yassine', balance: STARTING_BALANCE, role: 'Invitee' },
];

const money = (value: number) => `${Math.round(value)} ${CURRENCY}`;

const pickLabel = (pick: Pick) => {
  if (pick === 'home') return 'Home';
  if (pick === 'away') return 'Away';
  return 'Draw';
};

const formatDate = (value?: string) => {
  const date = new Date(value ?? '');
  if (Number.isNaN(date.getTime())) return 'Live schedule';
  return `${date.toLocaleDateString('en', { weekday: 'short' })} ${date.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}`;
};

const mapApiMatch = (event: any): Match | null => {
  if (!event?.home_team || !event?.away_team) return null;

  const bookmaker = event.bookmakers?.find((book: any) => book?.markets?.some((market: any) => market?.key === 'h2h'));
  const market = bookmaker?.markets?.find((entry: any) => entry?.key === 'h2h');
  const outcomes = market?.outcomes ?? [];
  const prices = Object.fromEntries(outcomes.map((outcome: any) => [String(outcome.name ?? '').toLowerCase(), Number(outcome.price)]));

  const home = prices[event.home_team.toLowerCase()];
  const draw = prices.draw;
  const away = prices[event.away_team.toLowerCase()];
  if (!home || !draw || !away) return null;

  return {
    id: event.id ?? `${event.home_team}-${event.away_team}`,
    league: event.sport_title ?? 'Football',
    home: event.home_team,
    away: event.away_team,
    date: formatDate(event.commence_time),
    bookmaker: bookmaker?.title ?? 'Bookmaker',
    updatedAt: formatDate(bookmaker?.last_update ?? market?.last_update),
    odds: { home, draw, away },
    status: 'upcoming',
    result: null,
  };
};

export default function App() {
  const [players, setPlayers] = useState(INITIAL_PLAYERS);
  const [selectedPlayerId, setSelectedPlayerId] = useState(INITIAL_PLAYERS[0].id);
  const [matches, setMatches] = useState<Match[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);
  const [tab, setTab] = useState<Tab>('matches');
  const [stake, setStake] = useState(25);
  const [stakeInput, setStakeInput] = useState('25');
  const [friendName, setFriendName] = useState('');
  const [status, setStatus] = useState('Loading real odds...');

  const currentPlayer = players.find((player) => player.id === selectedPlayerId) ?? players[0];
  const openMatches = matches.filter((match) => match.status === 'upcoming');
  const pendingBets = bets.filter((bet) => bet.result === 'pending');
  const prizePool = players.length * ENTRY_FEE;

  const leaderboard = useMemo(() => [...players].sort((a, b) => b.balance - a.balance), [players]);

  React.useEffect(() => {
    const loadOdds = async () => {
      try {
        const response = await fetch(ODDS_URL, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const realMatches = (Array.isArray(data?.events) ? data.events : []).map(mapApiMatch).filter(Boolean) as Match[];
        setMatches(realMatches.slice(0, 8));
        setStatus(realMatches.length ? `${realMatches.length} real markets from ${data.source ?? 'odds feed'}` : 'No real markets available now');
      } catch (error) {
        setMatches([]);
        setStatus('Real odds unavailable. Configure EXPO_PUBLIC_ODDS_API_KEY on the proxy.');
      }
    };

    loadOdds();
  }, []);

  const selectStake = (value: number) => {
    setStake(value);
    setStakeInput(String(value));
  };

  const updateStake = (value: string) => {
    const next = value.replace(/[^0-9]/g, '');
    setStakeInput(next);
    setStake(Number(next || 0));
  };

  const addFriend = () => {
    const name = friendName.trim();
    if (!name) return;

    const player = { id: Date.now(), name, balance: STARTING_BALANCE, role: 'Invitee' };
    setPlayers((current) => [...current, player]);
    setSelectedPlayerId(player.id);
    setFriendName('');
  };

  const placeBet = (match: Match, selection: Pick) => {
    if (stake <= 0) {
      Alert.alert('Invalid stake', 'Choose a stake greater than zero.');
      return;
    }
    if (stake > currentPlayer.balance) {
      Alert.alert('Not enough balance', 'Choose a smaller stake or switch player.');
      return;
    }

    const odds = match.odds[selection];
    setPlayers((current) => current.map((player) => (
      player.id === currentPlayer.id ? { ...player, balance: player.balance - stake } : player
    )));
    setBets((current) => [{
      id: Date.now(),
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      matchId: match.id,
      label: `${match.home} vs ${match.away}`,
      selection,
      stake,
      odds,
      potentialReturn: stake * odds,
      result: 'pending',
    }, ...current]);
  };

  const resolveNextMatch = () => {
    const nextMatch = matches.find((match) => match.status === 'upcoming');
    if (!nextMatch) return;

    const roll = Math.random();
    const result: Pick = roll < 0.45 ? 'home' : roll < 0.7 ? 'draw' : 'away';
    setMatches((current) => current.map((match) => (
      match.id === nextMatch.id ? { ...match, status: 'settled', result } : match
    )));
    setBets((current) => current.map((bet) => {
      if (bet.matchId !== nextMatch.id || bet.result !== 'pending') return bet;
      const won = bet.selection === result;
      if (won) {
        setPlayers((playersNow) => playersNow.map((player) => (
          player.id === bet.playerId ? { ...player, balance: player.balance + Math.round(bet.potentialReturn) } : player
        )));
      }
      return { ...bet, result: won ? 'won' : 'lost' };
    }));
  };

  const renderMatch = (match: Match) => (
    <View key={match.id} style={styles.matchCard}>
      <View style={styles.matchHeader}>
        <View style={styles.grow}>
          <Text style={styles.league}>{match.league}</Text>
          <Text style={styles.matchTitle}>{match.home} vs {match.away}</Text>
          <Text style={styles.meta}>{match.date} - {match.bookmaker} - updated {match.updatedAt}</Text>
        </View>
        <Text style={styles.openBadge}>Open</Text>
      </View>
      <View style={styles.oddsRow}>
        {(['home', 'draw', 'away'] as Pick[]).map((pick) => (
          <TouchableOpacity key={pick} style={styles.oddButton} onPress={() => placeBet(match, pick)}>
            <Text style={styles.oddLabel}>{pickLabel(pick)}</Text>
            <Text style={styles.oddValue}>{match.odds[pick].toFixed(2)}x</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderMatches = () => (
    <View style={styles.panel}>
      <View style={styles.sectionHeader}>
        <View style={styles.grow}>
          <Text style={styles.sectionTitle}>Matchs ouverts</Text>
          <Text style={styles.meta}>Only real bookmaker odds are shown.</Text>
        </View>
        <TouchableOpacity style={styles.dangerButton} onPress={resolveNextMatch}>
          <Text style={styles.dangerText}>Resultat</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.stakeRow}>
        {STAKES.map((value) => (
          <TouchableOpacity key={value} style={[styles.stakeButton, stake === value && styles.activeStake]} onPress={() => selectStake(value)}>
            <Text style={[styles.stakeText, stake === value && styles.activeStakeText]}>{value}</Text>
          </TouchableOpacity>
        ))}
        <TextInput value={stakeInput} onChangeText={updateStake} keyboardType="numeric" style={styles.stakeInput} />
      </View>
      {openMatches.map(renderMatch)}
      {!openMatches.length && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>No real odds loaded</Text>
          <Text style={styles.emptyText}>Start the proxy with EXPO_PUBLIC_ODDS_API_KEY to load live bookmaker markets.</Text>
        </View>
      )}
    </View>
  );

  const renderTickets = () => (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Tickets</Text>
      {bets.map((bet) => (
        <View key={bet.id} style={styles.ticketRow}>
          <View style={styles.grow}>
            <Text style={styles.goldText}>{bet.playerName}</Text>
            <Text style={styles.ticketTitle}>{bet.label}</Text>
            <Text style={styles.meta}>{pickLabel(bet.selection)} - {bet.odds.toFixed(2)}x</Text>
          </View>
          <View style={styles.right}>
            <Text style={styles.ticketTitle}>{money(bet.stake)}</Text>
            <Text style={[styles.result, styles[bet.result]]}>{bet.result}</Text>
            <Text style={styles.meta}>Max {money(bet.potentialReturn)}</Text>
          </View>
        </View>
      ))}
      {!bets.length && <Text style={styles.emptyText}>Aucun ticket pour le moment.</Text>}
    </View>
  );

  const renderFriends = () => (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Competition amis</Text>
      <View style={styles.inputRow}>
        <TextInput value={friendName} onChangeText={setFriendName} placeholder="Nom du joueur" placeholderTextColor="#7f90a5" style={styles.input} />
        <TouchableOpacity style={styles.goldButton} onPress={addFriend}>
          <Text style={styles.goldButtonText}>Ajouter</Text>
        </TouchableOpacity>
      </View>
      {leaderboard.map((player, index) => (
        <TouchableOpacity key={player.id} style={[styles.friendRow, player.id === selectedPlayerId && styles.activeFriend]} onPress={() => setSelectedPlayerId(player.id)}>
          <View>
            <Text style={styles.ticketTitle}>#{index + 1} {player.name}</Text>
            <Text style={styles.meta}>{player.role} - entree {money(ENTRY_FEE)}</Text>
          </View>
          <Text style={styles.balance}>{money(player.balance)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.eyebrow}>Private sportsbook</Text>
              <Text style={styles.title}>Bet Taha</Text>
            </View>
            <Text style={styles.liveBadge}>Live</Text>
          </View>
          <Text style={styles.subtitle}>Competition de paris entre amis avec wallet, tickets, pot et classement.</Text>
          <Text style={styles.status}>{status}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{money(currentPlayer.balance)}</Text>
              <Text style={styles.meta}>Wallet actif</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{money(prizePool)}</Text>
              <Text style={styles.meta}>Pot amis</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{pendingBets.length}</Text>
              <Text style={styles.meta}>Tickets ouverts</Text>
            </View>
          </View>
        </View>

        <View style={styles.playerBar}>
          <Text style={styles.meta}>Joueur actif</Text>
          <Text style={styles.activePlayer}>{currentPlayer.name}</Text>
          <View style={styles.chipRow}>
            {players.map((player) => (
              <TouchableOpacity key={player.id} style={[styles.chip, player.id === selectedPlayerId && styles.activeChip]} onPress={() => setSelectedPlayerId(player.id)}>
                <Text style={[styles.chipText, player.id === selectedPlayerId && styles.activeChipText]}>{player.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.tabs}>
          {(['matches', 'tickets', 'friends'] as Tab[]).map((item) => (
            <TouchableOpacity key={item} style={[styles.tab, tab === item && styles.activeTab]} onPress={() => setTab(item)}>
              <Text style={[styles.tabText, tab === item && styles.activeTabText]}>{item === 'matches' ? 'Matchs' : item === 'tickets' ? 'Tickets' : 'Amis'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'matches' && renderMatches()}
        {tab === 'tickets' && renderTickets()}
        {tab === 'friends' && renderFriends()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#071018' },
  container: { padding: 16, paddingBottom: 40, backgroundColor: '#071018' },
  hero: { backgroundColor: '#101923', borderRadius: 18, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  eyebrow: { color: '#f4c542', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 34, fontWeight: '900' },
  subtitle: { color: '#aab7c7', fontSize: 14, lineHeight: 20, marginBottom: 8 },
  status: { color: '#46d7a5', fontSize: 12, fontWeight: '800', marginBottom: 12 },
  liveBadge: { overflow: 'hidden', backgroundColor: '#d71920', color: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, fontWeight: '900' },
  statsRow: { flexDirection: 'row', gap: 8 },
  statBox: { flex: 1, minHeight: 68, backgroundColor: '#182533', borderRadius: 12, padding: 10, justifyContent: 'center' },
  statValue: { color: '#fff', fontSize: 15, fontWeight: '900', marginBottom: 3 },
  playerBar: { backgroundColor: '#0e1721', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  activePlayer: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#1a2735', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  activeChip: { backgroundColor: '#f4c542' },
  chipText: { color: '#dce6f2', fontWeight: '800' },
  activeChipText: { color: '#111820' },
  tabs: { flexDirection: 'row', backgroundColor: '#0e1721', borderRadius: 12, padding: 4, marginBottom: 12 },
  tab: { flex: 1, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  activeTab: { backgroundColor: '#fff' },
  tabText: { color: '#9aaabc', fontWeight: '900' },
  activeTabText: { color: '#111820' },
  panel: { backgroundColor: '#0e1721', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '900', marginBottom: 4 },
  grow: { flex: 1 },
  meta: { color: '#9aaabc', fontSize: 12 },
  dangerButton: { backgroundColor: '#d71920', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  dangerText: { color: '#fff', fontWeight: '900' },
  stakeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stakeButton: { flex: 1, minHeight: 42, backgroundColor: '#192737', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  activeStake: { backgroundColor: '#f4c542' },
  stakeText: { color: '#dce6f2', fontWeight: '900' },
  activeStakeText: { color: '#111820' },
  stakeInput: { width: 64, minHeight: 42, backgroundColor: '#192737', borderRadius: 10, color: '#fff', fontWeight: '900', paddingHorizontal: 10, textAlign: 'center' },
  matchCard: { backgroundColor: '#142131', borderRadius: 12, padding: 12, marginBottom: 10 },
  matchHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  league: { color: '#f4c542', fontSize: 11, fontWeight: '900', marginBottom: 3 },
  matchTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  openBadge: { overflow: 'hidden', color: '#46d7a5', backgroundColor: 'rgba(70,215,165,0.15)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '900' },
  oddsRow: { flexDirection: 'row', gap: 8 },
  oddButton: { flex: 1, minHeight: 66, backgroundColor: '#0b141e', borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  oddLabel: { color: '#8999ac', fontSize: 11, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase' },
  oddValue: { color: '#fff', fontSize: 17, fontWeight: '900' },
  emptyBox: { backgroundColor: '#142131', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: 'rgba(244,197,66,0.28)' },
  emptyTitle: { color: '#f4c542', fontSize: 15, fontWeight: '900', marginBottom: 6 },
  emptyText: { color: '#aab7c7', fontSize: 13, lineHeight: 18 },
  ticketRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, backgroundColor: '#142131', borderRadius: 12, padding: 12, marginBottom: 10 },
  goldText: { color: '#f4c542', fontSize: 12, fontWeight: '900', marginBottom: 4 },
  ticketTitle: { color: '#fff', fontWeight: '900' },
  right: { alignItems: 'flex-end' },
  result: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', marginTop: 4 },
  pending: { color: '#f4c542' },
  won: { color: '#46d7a5' },
  lost: { color: '#ff5d73' },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  input: { flex: 1, backgroundColor: '#192737', borderRadius: 10, color: '#fff', paddingHorizontal: 12, minHeight: 44 },
  goldButton: { backgroundColor: '#f4c542', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  goldButtonText: { color: '#111820', fontWeight: '900' },
  friendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#142131', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'transparent' },
  activeFriend: { borderColor: '#f4c542' },
  balance: { color: '#46d7a5', fontWeight: '900' },
});
