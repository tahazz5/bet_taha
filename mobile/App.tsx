import React, { useMemo, useState } from 'react';
import { Animated, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

type Player = {
  id: number;
  name: string;
  balance: number;
};

type Match = {
  id: string;
  home: string;
  away: string;
  date: string;
  odds: { home: number; draw: number; away: number };
  status: 'upcoming' | 'settled';
  result: 'home' | 'draw' | 'away' | null;
};

type Bet = {
  id: number;
  playerId: number;
  playerName: string;
  matchId: string;
  home: string;
  away: string;
  selection: 'home' | 'draw' | 'away';
  stake: number;
  result: 'pending' | 'won' | 'lost';
};

type BetSelection = 'home' | 'draw' | 'away';

const STARTING_BANKROLL = 1000;
const INITIAL_PLAYERS: Player[] = [
  { id: 1, name: 'You', balance: STARTING_BANKROLL },
  { id: 2, name: 'Mina', balance: STARTING_BANKROLL },
  { id: 3, name: 'Leo', balance: STARTING_BANKROLL },
];

const INITIAL_MATCHES: Match[] = [
  { id: 'm1', home: 'Liverpool', away: 'Arsenal', date: 'Tonight • 20:00', odds: { home: 1.83, draw: 3.6, away: 4.2 }, status: 'upcoming', result: null },
  { id: 'm2', home: 'Inter Milan', away: 'Napoli', date: 'Tomorrow • 19:45', odds: { home: 2.05, draw: 3.3, away: 3.5 }, status: 'upcoming', result: null },
  { id: 'm3', home: 'Real Madrid', away: 'Villarreal', date: 'Friday • 20:30', odds: { home: 1.42, draw: 4.7, away: 6.8 }, status: 'upcoming', result: null },
  { id: 'm4', home: 'Bayern Munich', away: 'Borussia Dortmund', date: 'Sunday • 17:30', odds: { home: 1.55, draw: 4.1, away: 5.8 }, status: 'upcoming', result: null },
  { id: 'm5', home: 'PSG', away: 'Marseille', date: 'Sunday • 20:45', odds: { home: 1.68, draw: 3.9, away: 4.8 }, status: 'upcoming', result: null },
];

const STAKE_OPTIONS = [10, 25, 50];
const ODDS_API_KEY = process.env.EXPO_PUBLIC_ODDS_API_KEY ?? '';
const ODDS_API_URL = Platform.OS === 'web'
  ? (typeof window !== 'undefined' && window.location?.origin ? `${window.location.origin}/api/odds` : '/api/odds')
  : 'http://localhost:8001/api/odds';

const formatKickoff = (isoDate: string) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'Today';
  return `${date.toLocaleDateString('en', { weekday: 'short' })} • ${date.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}`;
};

const toMatchFromApi = (event: any): Match | null => {
  if (!event?.home_team || !event?.away_team) return null;

  const bookmaker = event.bookmakers?.find((entry: any) => entry?.markets?.some((market: any) => market?.key === 'h2h'));
  const market = bookmaker?.markets?.find((entry: any) => entry?.key === 'h2h');
  const outcomes = market?.outcomes ?? [];
  const outcomeMap = Object.fromEntries(outcomes.map((outcome: any) => [outcome.name?.toLowerCase?.() ?? '', outcome.price]));

  const home = outcomeMap[event.home_team.toLowerCase()] ?? outcomeMap['home'] ?? 1.8;
  const draw = outcomeMap['draw'] ?? 3.5;
  const away = outcomeMap[event.away_team.toLowerCase()] ?? outcomeMap['away'] ?? 4.2;

  return {
    id: `${event.id ?? event.home_team}-${event.away_team}`,
    home: event.home_team,
    away: event.away_team,
    date: formatKickoff(event.commence_time),
    odds: { home, draw, away },
    status: 'upcoming',
    result: null,
  };
};

export default function App() {
  const [players, setPlayers] = useState<Player[]>(INITIAL_PLAYERS);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number>(INITIAL_PLAYERS[0].id);
  const [matches, setMatches] = useState<Match[]>(INITIAL_MATCHES);
  const [bets, setBets] = useState<Bet[]>([]);
  const [selectedStake, setSelectedStake] = useState<number>(25);
  const [playerName, setPlayerName] = useState('');
  const [isLoadingOdds, setIsLoadingOdds] = useState(true);
  const [dataSource, setDataSource] = useState<'live' | 'fallback'>('fallback');
  const [apiMessage, setApiMessage] = useState('');
  const [pulseAnim] = useState(new Animated.Value(1));
  const [cardAnim] = useState(new Animated.Value(0));

  const currentPlayer = players.find((player) => player.id === selectedPlayerId) ?? players[0];
  const openMatches = matches.filter((match) => match.status === 'upcoming');

  const leaderboard = useMemo(() => {
    return [...players].sort((a, b) => b.balance - a.balance);
  }, [players]);

  React.useEffect(() => {
    const loadLiveMatches = async () => {
      setIsLoadingOdds(true);

      try {
        const response = await fetch(ODDS_API_URL, {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }
        const data = await response.json();
        const liveMatches = (Array.isArray(data) ? data : []).map(toMatchFromApi).filter(Boolean) as Match[];
        if (liveMatches.length > 0) {
          setMatches(liveMatches.slice(0, 5));
          setDataSource('live');
          setApiMessage(`Loaded ${liveMatches.length} live matches`);
        } else {
          setMatches(INITIAL_MATCHES);
          setDataSource('fallback');
          setApiMessage('No live matches available');
        }
      } catch (error) {
        setMatches(INITIAL_MATCHES);
        setDataSource('fallback');
        setApiMessage('Live feed unavailable');
      } finally {
        setIsLoadingOdds(false);
      }
    };

    Animated.timing(cardAnim, {
      toValue: 1,
      duration: 700,
      useNativeDriver: false,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.03, duration: 900, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: false }),
      ])
    ).start();

    loadLiveMatches();
  }, []);

  const addPlayer = () => {
    const trimmed = playerName.trim();
    if (!trimmed) return;

    const newPlayer: Player = {
      id: Date.now(),
      name: trimmed,
      balance: STARTING_BANKROLL,
    };

    setPlayers((prev) => [...prev, newPlayer]);
    setSelectedPlayerId(newPlayer.id);
    setPlayerName('');
  };

  const placeBet = (match: Match, selection: BetSelection) => {
    if (!currentPlayer) return;
    if (selectedStake > currentPlayer.balance) {
      alert('Not enough fake coins for that bet.');
      return;
    }

    setPlayers((prev) => prev.map((player) => (player.id === currentPlayer.id ? { ...player, balance: player.balance - selectedStake } : player)));

    setBets((prev) => [
      ...prev,
      {
        id: Date.now(),
        playerId: currentPlayer.id,
        playerName: currentPlayer.name,
        matchId: match.id,
        home: match.home,
        away: match.away,
        selection,
        stake: selectedStake,
        result: 'pending',
      },
    ]);
  };

  const resolveNextMatch = () => {
    const nextMatch = matches.find((match) => match.status === 'upcoming');
    if (!nextMatch) return;

    const roll = Math.random();
    let result: BetSelection = 'home';
    if (roll < 0.45) {
      result = 'home';
    } else if (roll < 0.7) {
      result = 'draw';
    } else {
      result = 'away';
    }

    setMatches((prev) => prev.map((match) => (match.id === nextMatch.id ? { ...match, status: 'settled', result } : match)));

    setBets((prev) => {
      const updated = prev.map((bet) => {
        if (bet.matchId !== nextMatch.id || bet.result !== 'pending') return bet;
        const player = players.find((entry) => entry.id === bet.playerId);
        if (!player) return bet;
        const odds = nextMatch.odds[bet.selection];
        const won = bet.selection === result;
        if (won) {
          const updatedBalance = Math.round(bet.stake * odds);
          setPlayers((currentPlayers) => currentPlayers.map((entry) => (entry.id === player.id ? { ...entry, balance: entry.balance + updatedBalance } : entry)));
          return { ...bet, result: 'won' };
        }
        return { ...bet, result: 'lost' };
      });
      return updated;
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <Animated.View style={[styles.heroCard, { transform: [{ scale: pulseAnim }, { translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroTextWrap}>
              <Text style={styles.eyebrow}>Sportsbook • Premium</Text>
              <Text style={styles.title}>Bet Taha</Text>
            </View>
            <View style={styles.liveChip}>
              <Text style={styles.liveChipText}>● Live</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>Pick football fixtures with live-style odds, build your ticket, and chase the leaderboard.</Text>
          <Text style={styles.statusText}>{isLoadingOdds ? 'Loading live markets…' : apiMessage || (dataSource === 'live' ? 'Live odds feed active' : 'Add your odds API key for live matches')}</Text>
          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatBox}>
              <Text style={styles.heroStatValue}>4</Text>
              <Text style={styles.heroStatLabel}>Real fixtures</Text>
            </View>
            <View style={styles.heroStatBox}>
              <Text style={styles.heroStatValue}>Top</Text>
              <Text style={styles.heroStatLabel}>Odds</Text>
            </View>
            <View style={styles.heroStatBox}>
              <Text style={styles.heroStatValue}>1000</Text>
              <Text style={styles.heroStatLabel}>Starting bankroll</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View style={[styles.card, { opacity: cardAnim, transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}> 
          <Text style={styles.cardTitle}>My bankroll</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Selected player</Text>
              <Text style={styles.statValue}>{currentPlayer?.name}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Balance</Text>
              <Text style={styles.statValue}>{currentPlayer?.balance} coins</Text>
            </View>
          </View>
          <View style={styles.playerRow}>
            {players.map((player) => (
              <TouchableOpacity key={player.id} style={[styles.playerChip, selectedPlayerId === player.id && styles.playerChipActive]} onPress={() => setSelectedPlayerId(player.id)}>
                <Text style={[styles.playerChipText, selectedPlayerId === player.id && styles.playerChipTextActive]}>{player.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.inputRow}>
            <TextInput value={playerName} onChangeText={setPlayerName} placeholder="Add a player" placeholderTextColor="#7ca7c8" style={styles.input} />
            <TouchableOpacity style={styles.addButton} onPress={addPlayer}>
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        <Animated.View style={[styles.card, { opacity: cardAnim, transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>Featured matches</Text>
              <Text style={styles.sectionHint}>Live-style odds for the next fixtures</Text>
            </View>
            <TouchableOpacity style={styles.resolveButton} onPress={resolveNextMatch}>
              <Text style={styles.resolveButtonText}>Resolve next</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.stakeRow}>
            {STAKE_OPTIONS.map((stake) => (
              <TouchableOpacity key={stake} style={[styles.stakeButton, selectedStake === stake && styles.stakeButtonActive]} onPress={() => setSelectedStake(stake)}>
                <Text style={[styles.stakeText, selectedStake === stake && styles.stakeTextActive]}>{stake} coins</Text>
              </TouchableOpacity>
            ))}
          </View>
          {openMatches.map((match) => (
            <View key={match.id} style={styles.matchCard}>
              <View style={styles.matchHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.matchTitle}>{match.home} vs {match.away}</Text>
                  <Text style={styles.matchDate}>{match.date}</Text>
                </View>
                <View style={styles.badge}><Text style={styles.badgeText}>Live bet</Text></View>
              </View>
              <View style={styles.oddsRow}>
                <TouchableOpacity style={styles.oddCard} onPress={() => placeBet(match, 'home')}>
                  <Text style={styles.oddLabel}>Home</Text>
                  <Text style={styles.oddValue}>{match.odds.home.toFixed(2)}x</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.oddCard} onPress={() => placeBet(match, 'draw')}>
                  <Text style={styles.oddLabel}>Draw</Text>
                  <Text style={styles.oddValue}>{match.odds.draw.toFixed(2)}x</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.oddCard} onPress={() => placeBet(match, 'away')}>
                  <Text style={styles.oddLabel}>Away</Text>
                  <Text style={styles.oddValue}>{match.odds.away.toFixed(2)}x</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.betHint}><Text style={styles.betHintText}>Tap any odds to place a {selectedStake} coin bet</Text></View>
            </View>
          ))}
        </Animated.View>

        <Animated.View style={[styles.card, { opacity: cardAnim, transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }] }]}>
          <Text style={styles.cardTitle}>Leaderboard</Text>
          {leaderboard.map((player, index) => (
            <View key={player.id} style={styles.leaderRow}>
              <Text style={styles.leaderName}>#{index + 1} {player.name}</Text>
              <Text style={styles.leaderValue}>{player.balance} coins</Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View style={[styles.card, { opacity: cardAnim, transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [32, 0] }) }] }]}>
          <Text style={styles.cardTitle}>Recent bets</Text>
          {bets.slice(-5).reverse().map((bet) => (
            <View key={bet.id} style={styles.historyRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyName}>{bet.playerName}</Text>
                <Text style={styles.historyMeta}>{bet.home} vs {bet.away}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.historyValue}>{bet.stake} coins</Text>
                <Text style={[styles.historyResult, bet.result === 'won' ? styles.won : bet.result === 'lost' ? styles.lost : styles.pending]}>{bet.result}</Text>
              </View>
            </View>
          ))}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#060b12',
  },
  container: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: '#060b12',
  },
  heroCard: {
    backgroundColor: '#0f1724',
    borderRadius: 24,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,138,91,0.22)',
    shadowColor: '#ff8a5b',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  heroTextWrap: {
    gap: 6,
    flex: 1,
  },
  eyebrow: {
    color: '#4dd4b8',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 11,
  },
  title: {
    color: '#f3f7ff',
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: '#8cb4d9',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 6,
  },
  statusText: {
    color: '#4dd4b8',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  liveChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,138,91,0.16)',
  },
  liveChipText: {
    color: '#ff8a5b',
    fontWeight: '700',
    fontSize: 12,
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  heroStatBox: {
    flex: 1,
    backgroundColor: '#111c2c',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  heroStatValue: {
    color: '#f3f7ff',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  heroStatLabel: {
    color: '#8cb4d9',
    fontSize: 11,
  },
  card: {
    backgroundColor: '#0f1724',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  cardTitle: {
    color: '#f3f7ff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  sectionHint: {
    color: '#8cb4d9',
    fontSize: 12,
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#15324f',
    borderRadius: 14,
    padding: 12,
  },
  statLabel: {
    color: '#8cb4d9',
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    color: '#f3f7ff',
    fontSize: 16,
    fontWeight: '700',
  },
  playerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  playerChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#15324f',
    borderRadius: 999,
  },
  playerChipActive: {
    backgroundColor: '#4dd4b8',
  },
  playerChipText: {
    color: '#f3f7ff',
    fontWeight: '600',
  },
  playerChipTextActive: {
    color: '#07131f',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#0c1b2a',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f3f7ff',
  },
  addButton: {
    backgroundColor: '#4dd4b8',
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#07131f',
    fontWeight: '700',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  resolveButton: {
    backgroundColor: '#ff8a5b',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#ff8a5b',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  resolveButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  stakeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  stakeButton: {
    flex: 1,
    backgroundColor: '#15324f',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  stakeButtonActive: {
    backgroundColor: '#4dd4b8',
  },
  stakeText: {
    color: '#f3f7ff',
    fontWeight: '700',
  },
  stakeTextActive: {
    color: '#07131f',
  },
  matchCard: {
    backgroundColor: '#13253c',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  matchTitle: {
    color: '#f3f7ff',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  matchDate: {
    color: '#8cb4d9',
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    backgroundColor: 'rgba(255,138,91,0.18)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#ff8a5b',
    fontSize: 11,
    fontWeight: '700',
  },
  oddsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  oddCard: {
    flex: 1,
    backgroundColor: '#0f2237',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  oddLabel: {
    color: '#8cb4d9',
    fontSize: 11,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  oddValue: {
    color: '#f3f7ff',
    fontSize: 16,
    fontWeight: '800',
  },
  betHint: {
    alignItems: 'center',
  },
  betHintText: {
    color: '#8cb4d9',
    fontSize: 12,
  },
  leaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  leaderName: {
    color: '#f3f7ff',
    fontWeight: '600',
  },
  leaderValue: {
    color: '#4dd4b8',
    fontWeight: '700',
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  historyName: {
    color: '#f3f7ff',
    fontWeight: '600',
  },
  historyMeta: {
    color: '#8cb4d9',
    fontSize: 12,
    marginTop: 2,
  },
  historyValue: {
    color: '#f3f7ff',
    fontWeight: '700',
  },
  historyResult: {
    fontSize: 12,
    textTransform: 'capitalize',
    marginTop: 2,
  },
  won: {
    color: '#4dd4b8',
  },
  lost: {
    color: '#ff5d73',
  },
  pending: {
    color: '#8cb4d9',
  },
});
