import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Animated,
  Dimensions,
  Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Pick = 'home' | 'draw' | 'away';
type Tab = 'matches' | 'tickets' | 'friends' | 'history' | 'stats';
type BetType = 'simple' | 'combine';

type League = { key: string; label: string; short: string };

type Player = {
  id: number;
  name: string;
  balance: number;
  role: string;
  pin?: string;
  createdAt: string;
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
  status: 'upcoming' | 'settled' | 'live';
  result: Pick | null;
  score?: { home: number; away: number };
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
  placedAt: string;
  settledAt?: string;
  type: BetType;
  combineId?: string;
};

type CombineBet = {
  id: string;
  playerId: number;
  playerName: string;
  selections: { matchId: string; label: string; selection: Pick; odds: number }[];
  stake: number;
  totalOdds: number;
  potentialReturn: number;
  result: 'pending' | 'won' | 'lost';
  placedAt: string;
  settledAt?: string;
};

type ToastItemType = { id: number; message: string; type: 'success' | 'error' | 'info' };

const CURRENCY = 'MAD';
const STARTING_BALANCE = 500;
const ENTRY_FEE = 50;
const STAKES = [10, 25, 50, 100, 200];
const PIN_CODE = '1234';

const LEAGUES: League[] = [
  { key: 'soccer_epl', label: 'Premier League', short: 'EPL' },
  { key: 'soccer_spain_la_liga', label: 'La Liga', short: 'ESP' },
  { key: 'soccer_italy_serie_a', label: 'Serie A', short: 'ITA' },
  { key: 'soccer_germany_bundesliga', label: 'Bundesliga', short: 'GER' },
  { key: 'soccer_france_ligue_one', label: 'Ligue 1', short: 'FRA' },
  { key: 'soccer_uefa_champs_league', label: 'Champions League', short: 'UCL' },
  { key: 'soccer_fifa_world_cup', label: 'Coupe du Monde', short: 'FIFA' },
];

const STORAGE_KEYS = {
  PLAYERS: '@bet_taha_players',
  BETS: '@bet_taha_bets',
  COMBINES: '@bet_taha_combines',
  MATCHES: '@bet_taha_matches',
  SELECTED_PLAYER: '@bet_taha_selected_player',
};

const AUTH_STORAGE_KEY = '@bet_taha_auth_token';
const BACKEND_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8001' : 'http://localhost:8001';

const buildApiUrl = (path: string) => {
  return Platform.OS === 'web' ? `/api/${path}` : `${BACKEND_URL}/api/${path}`;
};

const buildOddsUrl = (sport: string) => {
  const query = `sport=${sport}&region=eu`;
  return buildApiUrl(`odds?${query}`);
};

const INITIAL_PLAYERS: Player[] = [
  { id: 1, name: 'Taha', balance: STARTING_BALANCE, role: 'Host', pin: PIN_CODE, createdAt: new Date().toISOString() },
  { id: 2, name: 'Mina', balance: STARTING_BALANCE, role: 'Invitee', pin: PIN_CODE, createdAt: new Date().toISOString() },
  { id: 3, name: 'Yassine', balance: STARTING_BALANCE, role: 'Invitee', pin: PIN_CODE, createdAt: new Date().toISOString() },
];

const money = (value: number) => `${Math.round(value)} ${CURRENCY}`;

const pickLabel = (pick: Pick) => {
  if (pick === 'home') return 'Domicile';
  if (pick === 'away') return 'Exterieur';
  return 'Nul';
};

const pickEmoji = (pick: Pick) => {
  if (pick === 'home') return '🏠';
  if (pick === 'away') return '✈️';
  return '🤝';
};

const formatDate = (value?: string) => {
  const date = new Date(value ?? '');
  if (Number.isNaN(date.getTime())) return 'Live schedule';
  return `${date.toLocaleDateString('fr', { weekday: 'short', day: '2-digit', month: 'short' })} - ${date.toLocaleTimeString('fr', { hour: 'numeric', minute: '2-digit' })}`;
};

const formatShortDate = (value?: string) => {
  const date = new Date(value ?? '');
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('fr', { day: '2-digit', month: 'short' });
};

const mapApiMatch = (event: any, leagueLabel: string): Match | null => {
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
    league: event.sport_title ?? leagueLabel,
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

// ===================== TOAST =====================
function ToastItem({ toast, onRemove }: { toast: ToastItemType; onRemove: (id: number) => void }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: -50, duration: 300, useNativeDriver: true }),
      ]).start(() => onRemove(toast.id));
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const bgColor = toast.type === 'success' ? '#46d7a5' : toast.type === 'error' ? '#ff5d73' : '#f4c542';
  return (
    <Animated.View style={[toastStyles.toast, { backgroundColor: bgColor, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <Text style={toastStyles.toastText}>{toast.message}</Text>
    </Animated.View>
  );
}

const toastStyles = StyleSheet.create({
  toast: { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, minWidth: 200, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  toastText: { color: '#111820', fontWeight: '900', fontSize: 14 },
});

// ===================== PIN MODAL =====================
function PinModal({ visible, onVerify, onCancel, playerName }: { visible: boolean; onVerify: (pin: string) => void; onCancel: () => void; playerName: string }) {
  const [pin, setPin] = useState('');
  useEffect(() => { if (visible) setPin(''); }, [visible]);

  const handlePress = (digit: string) => {
    if (pin.length < 4) {
      const next = pin + digit;
      setPin(next);
      if (next.length === 4) setTimeout(() => onVerify(next), 200);
    }
  };
  const handleDelete = () => setPin(pin.slice(0, -1));

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={pinStyles.pinOverlay}>
        <View style={pinStyles.pinContainer}>
          <Text style={pinStyles.pinTitle}>🔐 Code PIN</Text>
          <Text style={pinStyles.pinSubtitle}>Acces au compte de {playerName}</Text>
          <View style={pinStyles.pinDots}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[pinStyles.pinDot, pin.length > i && pinStyles.pinDotFilled]} />
            ))}
          </View>
          <View style={pinStyles.pinKeypad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, i) => (
              <TouchableOpacity key={i} style={[pinStyles.pinKey, key === '' && pinStyles.pinKeyEmpty]} onPress={() => key === '⌫' ? handleDelete() : key && handlePress(key)} disabled={!key}>
                <Text style={pinStyles.pinKeyText}>{key}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={pinStyles.pinCancel} onPress={onCancel}>
            <Text style={pinStyles.pinCancelText}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const pinStyles = StyleSheet.create({
  pinOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
  pinContainer: { backgroundColor: '#111d2b', borderRadius: 24, padding: 32, width: SCREEN_WIDTH * 0.85, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(244,197,66,0.2)' },
  pinTitle: { color: '#f4c542', fontSize: 28, fontWeight: '900', marginBottom: 8 },
  pinSubtitle: { color: '#94a5ba', fontSize: 14, marginBottom: 24 },
  pinDots: { flexDirection: 'row', gap: 16, marginBottom: 32 },
  pinDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#1a2735', borderWidth: 2, borderColor: '#f4c542' },
  pinDotFilled: { backgroundColor: '#f4c542' },
  pinKeypad: { flexDirection: 'row', flexWrap: 'wrap', width: 240, justifyContent: 'center', gap: 12 },
  pinKey: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#1a2735', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(244,197,66,0.15)' },
  pinKeyEmpty: { backgroundColor: 'transparent', borderColor: 'transparent' },
  pinKeyText: { color: '#fff', fontSize: 24, fontWeight: '900' },
  pinCancel: { marginTop: 20 },
  pinCancelText: { color: '#ff5d73', fontSize: 16, fontWeight: '800' },
});

// ===================== SPLASH SCREEN =====================
function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.1, duration: 600, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(800),
      Animated.timing(fadeAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => onFinish());
  }, []);

  return (
    <Animated.View style={[splashStyles.splash, { opacity: fadeAnim }]}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Text style={splashStyles.splashEmoji}>🎰</Text>
        <Text style={splashStyles.splashTitle}>Bet Taha</Text>
        <Text style={splashStyles.splashSubtitle}>Competition de paris entre amis</Text>
      </Animated.View>
    </Animated.View>
  );
}

const splashStyles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: '#080e16', alignItems: 'center', justifyContent: 'center' },
  splashEmoji: { fontSize: 80, marginBottom: 20 },
  splashTitle: { color: '#f4c542', fontSize: 42, fontWeight: '900', letterSpacing: -1, marginBottom: 8 },
  splashSubtitle: { color: '#94a5ba', fontSize: 16, fontWeight: '600' },
});

// ===================== MAIN APP =====================
export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [players, setPlayers] = useState<Player[]>(INITIAL_PLAYERS);
  const [selectedPlayerId, setSelectedPlayerId] = useState(INITIAL_PLAYERS[0].id);
  const [matches, setMatches] = useState<Match[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);
  const [combines, setCombines] = useState<CombineBet[]>([]);
  const [tab, setTab] = useState<Tab>('matches');
  const [league, setLeague] = useState<League>(LEAGUES[0]);
  const [stake, setStake] = useState(25);
  const [stakeInput, setStakeInput] = useState('25');
  const [friendName, setFriendName] = useState('');
  const [status, setStatus] = useState('Chargement des cotes...');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errored, setErrored] = useState(false);
  const [toasts, setToasts] = useState<ToastItemType[]>([]);
  const [pinModal, setPinModal] = useState<{ visible: boolean; playerId: number; playerName: string } | null>(null);
  const [pendingPlayerId, setPendingPlayerId] = useState<number | null>(null);
  const [betType, setBetType] = useState<BetType>('simple');
  const [combineSelections, setCombineSelections] = useState<{ matchId: string; label: string; selection: Pick; odds: number }[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'won' | 'lost' | 'pending'>('all');
  const [dataLoaded, setDataLoaded] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authPlayer, setAuthPlayer] = useState<Player | null>(null);
  const [username, setUsername] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);

  const currentPlayer = authPlayer ?? players.find((p) => p.id === selectedPlayerId) ?? players[0];
  const isAuthenticated = Boolean(authToken && authPlayer);
  const openMatches = matches.filter((m) => m.status === 'upcoming');
  const pendingBets = bets.filter((b) => b.result === 'pending');
  const prizePool = players.length * ENTRY_FEE;
  const leaderboard = useMemo(() => [...players].sort((a, b) => b.balance - a.balance), [players]);
  const betMatchIds = useMemo(() => new Set(bets.filter((b) => b.playerId === currentPlayer.id && b.result === 'pending').map((b) => b.matchId)), [bets, currentPlayer.id]);

  // ===================== PERSISTENCE =====================
  const loadData = useCallback(async () => {
    try {
      const [savedPlayers, savedBets, savedCombines, savedMatches, savedSelectedPlayer] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.PLAYERS),
        AsyncStorage.getItem(STORAGE_KEYS.BETS),
        AsyncStorage.getItem(STORAGE_KEYS.COMBINES),
        AsyncStorage.getItem(STORAGE_KEYS.MATCHES),
        AsyncStorage.getItem(STORAGE_KEYS.SELECTED_PLAYER),
      ]);
      if (savedPlayers) setPlayers(JSON.parse(savedPlayers));
      if (savedBets) setBets(JSON.parse(savedBets));
      if (savedCombines) setCombines(JSON.parse(savedCombines));
      if (savedMatches) setMatches(JSON.parse(savedMatches));
      if (savedSelectedPlayer) setSelectedPlayerId(Number(savedSelectedPlayer));
    } catch (e) { console.error('Erreur chargement:', e); }
    finally { setDataLoaded(true); }
  }, []);

  const saveData = useCallback(async () => {
    try {
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players)),
        AsyncStorage.setItem(STORAGE_KEYS.BETS, JSON.stringify(bets)),
        AsyncStorage.setItem(STORAGE_KEYS.COMBINES, JSON.stringify(combines)),
        AsyncStorage.setItem(STORAGE_KEYS.MATCHES, JSON.stringify(matches)),
        AsyncStorage.setItem(STORAGE_KEYS.SELECTED_PLAYER, String(selectedPlayerId)),
      ]);
    } catch (e) { console.error('Erreur sauvegarde:', e); }
  }, [players, bets, combines, matches, selectedPlayerId]);

  useEffect(() => { if (dataLoaded) saveData(); }, [players, bets, combines, matches, selectedPlayerId, dataLoaded, saveData]);
  useEffect(() => { loadData(); }, [loadData]);

  const persistAuthToken = useCallback(async (token: string | null) => {
    try {
      if (token) await AsyncStorage.setItem(AUTH_STORAGE_KEY, token);
      else await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (error) {
      console.error('Failed to persist auth token:', error);
    }
    setAuthToken(token);
  }, []);

  const initializeAuth = useCallback(async () => {
    try {
      const savedToken = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (!savedToken) {
        setAuthLoading(false);
        return;
      }
      setAuthToken(savedToken);
      const response = await fetch(buildApiUrl('auth/me'), {
        headers: { Authorization: `Bearer ${savedToken}`, Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Unauthorized');
      const data = await response.json();
      setAuthPlayer(data.player);
    } catch (error) {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      setAuthToken(null);
      setAuthPlayer(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => { initializeAuth(); }, [initializeAuth]);

  const login = async () => {
    setLoginError(null);
    if (!username.trim() || !pinInput.trim()) {
      setLoginError('Nom et PIN obligatoires');
      return;
    }
    try {
      const response = await fetch(buildApiUrl('auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: username.trim(), pin: pinInput.trim() }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        setLoginError(errorData.error || 'Connexion impossible');
        return;
      }
      const data = await response.json();
      await persistAuthToken(data.token);
      setAuthPlayer(data.player);
      setPlayers(data.state.players);
      setBets(data.state.bets);
      setCombines(data.state.combines);
      setMatches(data.state.matches);
      setSelectedPlayerId(data.state.selectedPlayerId);
      addToast(`Bienvenue, ${data.player.name} !`, 'success');
    } catch (error) {
      console.error('Login error:', error);
      setLoginError('Connexion impossible');
    }
  };

  const logout = async () => {
    await persistAuthToken(null);
    setAuthPlayer(null);
    setUsername('');
    setPinInput('');
    addToast('Déconnecté', 'info');
  };

  const authHeaders = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  // ===================== TOASTS =====================
  const addToast = useCallback((message: string, type: ToastItemType['type'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);
  const removeToast = useCallback((id: number) => { setToasts((prev) => prev.filter((t) => t.id !== id)); }, []);

  // ===================== ODDS LOADING =====================
  const loadOdds = useCallback(async (selectedLeague: League, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setErrored(false);
    try {
      const response = await fetch(buildOddsUrl(selectedLeague.key), { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const realMatches = (Array.isArray(data?.events) ? data.events : [])
        .map((event: any) => mapApiMatch(event, selectedLeague.label))
        .filter(Boolean) as Match[];
      setMatches(realMatches.slice(0, 10));
      setStatus(realMatches.length ? `${realMatches.length} matchs charges - ${selectedLeague.label}` : `Aucun match ouvert pour ${selectedLeague.label} en ce moment`);
    } catch (error) {
      setMatches([]); setErrored(true);
      setStatus('Cotes indisponibles. Verifiez EXPO_PUBLIC_ODDS_API_KEY sur le proxy.');
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { if (dataLoaded) loadOdds(league); }, [league, loadOdds, dataLoaded]);

  // ===================== STAKE =====================
  const selectStake = (value: number) => { setStake(value); setStakeInput(String(value)); };
  const updateStake = (value: string) => { const next = value.replace(/[^0-9]/g, ''); setStakeInput(next); setStake(Number(next || 0)); };

  // ===================== PLAYER =====================
  const handleSelectPlayer = (playerId: number) => {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    if (player.pin) { setPendingPlayerId(playerId); setPinModal({ visible: true, playerId, playerName: player.name }); }
    else { setSelectedPlayerId(playerId); addToast(`Bienvenue, ${player.name} !`, 'success'); }
  };

  const verifyPin = (pin: string) => {
    const player = players.find((p) => p.id === pendingPlayerId);
    if (player && player.pin === pin) {
      setSelectedPlayerId(pendingPlayerId!); setPinModal(null); setPendingPlayerId(null);
      addToast(`Bienvenue, ${player.name} !`, 'success');
    } else { addToast('Code PIN incorrect', 'error'); }
  };

  const addFriend = () => {
    const name = friendName.trim();
    if (!name) return;
    if (players.some((p) => p.name.toLowerCase() === name.toLowerCase())) { Alert.alert('Deja present', 'Ce joueur existe deja dans la partie.'); return; }
    const player: Player = { id: Date.now(), name, balance: STARTING_BALANCE, role: 'Invitee', pin: PIN_CODE, createdAt: new Date().toISOString() };
    setPlayers((current) => [...current, player]); setSelectedPlayerId(player.id); setFriendName('');
    addToast(`${name} a rejoint la partie !`, 'success');
  };

  const resetData = () => {
    Alert.alert('Reinitialiser', 'Toutes les donnees seront perdues. Continuer ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Reinitialiser', style: 'destructive', onPress: async () => {
        await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
        setPlayers(INITIAL_PLAYERS); setBets([]); setCombines([]); setMatches([]); setSelectedPlayerId(INITIAL_PLAYERS[0].id);
        addToast('Donnees reinitialisees', 'info');
      }},
    ]);
  };

  // ===================== BETTING =====================
  const placeBet = (match: Match, selection: Pick) => {
    if (stake <= 0) { addToast('Mise invalide', 'error'); return; }
    if (stake > currentPlayer.balance) { addToast('Solde insuffisant', 'error'); return; }
    if (betMatchIds.has(match.id)) { addToast('Deja parie sur ce match', 'error'); return; }
    const odds = match.odds[selection];
    const potentialReturn = stake * odds;
    setPlayers((current) => current.map((p) => (p.id === currentPlayer.id ? { ...p, balance: p.balance - stake } : p)));
    setBets((current) => [{
      id: Date.now(), playerId: currentPlayer.id, playerName: currentPlayer.name, matchId: match.id,
      label: `${match.home} vs ${match.away}`, selection, stake, odds, potentialReturn: Math.round(potentialReturn),
      result: 'pending', placedAt: new Date().toISOString(), type: 'simple',
    }, ...current]);
    addToast(`Pari place: ${pickLabel(selection)} @ ${odds.toFixed(2)}x`, 'success');
  };

  // ===================== COMBINE =====================
  const toggleCombineSelection = (match: Match, selection: Pick) => {
    const existing = combineSelections.find((s) => s.matchId === match.id);
    if (existing) {
      if (existing.selection === selection) { setCombineSelections((prev) => prev.filter((s) => s.matchId !== match.id)); }
      else { setCombineSelections((prev) => prev.map((s) => s.matchId === match.id ? { ...s, selection, odds: match.odds[selection] } : s)); }
    } else {
      if (combineSelections.length >= 5) { addToast('Maximum 5 selections en combine', 'error'); return; }
      setCombineSelections((prev) => [...prev, { matchId: match.id, label: `${match.home} vs ${match.away}`, selection, odds: match.odds[selection] }]);
    }
  };

  const placeCombineBet = () => {
    if (combineSelections.length < 2) { addToast('Minimum 2 selections pour un combine', 'error'); return; }
    if (stake <= 0) { addToast('Mise invalide', 'error'); return; }
    if (stake > currentPlayer.balance) { addToast('Solde insuffisant', 'error'); return; }
    const totalOdds = combineSelections.reduce((acc, s) => acc * s.odds, 1);
    const potentialReturn = stake * totalOdds;
    const combineId = `combine-${Date.now()}`;
    setPlayers((current) => current.map((p) => (p.id === currentPlayer.id ? { ...p, balance: p.balance - stake } : p)));
    const newBets: Bet[] = combineSelections.map((sel, idx) => ({
      id: Date.now() + idx, playerId: currentPlayer.id, playerName: currentPlayer.name, matchId: sel.matchId,
      label: sel.label, selection: sel.selection, stake: 0, odds: sel.odds, potentialReturn: 0,
      result: 'pending', placedAt: new Date().toISOString(), type: 'combine', combineId,
    }));
    setBets((current) => [...newBets, ...current]);
    setCombines((current) => [{
      id: combineId, playerId: currentPlayer.id, playerName: currentPlayer.name, selections: combineSelections,
      stake, totalOdds: Math.round(totalOdds * 100) / 100, potentialReturn: Math.round(potentialReturn),
      result: 'pending', placedAt: new Date().toISOString(),
    }, ...current]);
    setCombineSelections([]);
    addToast(`Combine place: ${combineSelections.length} selections @ ${totalOdds.toFixed(2)}x`, 'success');
  };

  const clearCombine = () => setCombineSelections([]);

  // ===================== RESOLVE =====================
  const resolveNextMatch = () => {
    const nextMatch = matches.find((m) => m.status === 'upcoming');
    if (!nextMatch) return;
    const roll = Math.random();
    const result: Pick = roll < 0.45 ? 'home' : roll < 0.7 ? 'draw' : 'away';
    const scoreHome = result === 'home' ? Math.floor(Math.random() * 3) + 1 : result === 'draw' ? Math.floor(Math.random() * 3) : Math.floor(Math.random() * 2);
    const scoreAway = result === 'away' ? Math.floor(Math.random() * 3) + 1 : result === 'draw' ? scoreHome : Math.floor(Math.random() * 2);

    setMatches((current) => current.map((m) => (m.id === nextMatch.id ? { ...m, status: 'settled', result, score: { home: scoreHome, away: scoreAway } } : m)));

    setBets((current) => current.map((bet) => {
      if (bet.matchId !== nextMatch.id || bet.result !== 'pending') return bet;
      const won = bet.selection === result;
      if (won && bet.type === 'simple') {
        setPlayers((pn) => pn.map((p) => (p.id === bet.playerId ? { ...p, balance: p.balance + Math.round(bet.potentialReturn) } : p)));
      }
      return { ...bet, result: won ? 'won' : 'lost', settledAt: new Date().toISOString() };
    }));

    setCombines((current) => current.map((combine) => {
      if (combine.result !== 'pending') return combine;
      const hasThisMatch = combine.selections.some((s) => s.matchId === nextMatch.id);
      if (!hasThisMatch) return combine;
      const allSettled = combine.selections.every((sel) => { const m = matches.find((mm) => mm.id === sel.matchId); return m?.status === 'settled'; });
      if (!allSettled) return combine;
      const won = combine.selections.every((sel) => { const m = matches.find((mm) => mm.id === sel.matchId); return m?.result === sel.selection; });
      if (won) {
        setPlayers((pn) => pn.map((p) => (p.id === combine.playerId ? { ...p, balance: p.balance + Math.round(combine.potentialReturn) } : p)));
        addToast(`${combine.playerName} a gagne son combine !`, 'success');
      } else { addToast(`${combine.playerName} a perdu son combine`, 'error'); }
      return { ...combine, result: won ? 'won' : 'lost', settledAt: new Date().toISOString() };
    }));

    addToast(`Resultat: ${nextMatch.home} ${scoreHome}-${scoreAway} ${nextMatch.away}`, 'info');
  };

  // ===================== STATS =====================
  const playerStats = useMemo(() => {
    const playerBets = bets.filter((b) => b.playerId === currentPlayer.id && b.type === 'simple');
    const won = playerBets.filter((b) => b.result === 'won').length;
    const lost = playerBets.filter((b) => b.result === 'lost').length;
    const pending = playerBets.filter((b) => b.result === 'pending').length;
    const totalStaked = playerBets.reduce((acc, b) => acc + b.stake, 0);
    const totalWon = playerBets.filter((b) => b.result === 'won').reduce((acc, b) => acc + b.potentialReturn, 0);
    const roi = totalStaked > 0 ? ((totalWon - totalStaked) / totalStaked * 100) : 0;
    const balanceHistory = playerBets
      .filter((b) => b.result !== 'pending')
      .sort((a, b) => new Date(a.settledAt!).getTime() - new Date(b.settledAt!).getTime())
      .reduce((acc: { date: string; balance: number }[], bet) => {
        const lastBalance = acc.length > 0 ? acc[acc.length - 1].balance : STARTING_BALANCE;
        const newBalance = bet.result === 'won' ? lastBalance + bet.potentialReturn : lastBalance - bet.stake;
        acc.push({ date: formatShortDate(bet.settledAt), balance: newBalance });
        return acc;
      }, []);
    return { won, lost, pending, totalStaked, totalWon, roi, balanceHistory };
  }, [bets, currentPlayer.id]);

  // ===================== RENDER MATCH =====================
  const renderMatch = (match: Match) => {
    const alreadyBet = betMatchIds.has(match.id);
    const isInCombine = combineSelections.some((s) => s.matchId === match.id);
    const combineSelection = combineSelections.find((s) => s.matchId === match.id);
    return (
      <View key={match.id} style={s.matchCard}>
        <View style={s.matchHeader}>
          <View style={s.grow}>
            <Text style={s.league}>{match.league}</Text>
            <Text style={s.matchTitle}>{match.home} vs {match.away}</Text>
            <Text style={s.meta}>{match.date} - {match.bookmaker}</Text>
          </View>
          <View style={s.matchBadges}>
            {isInCombine && (
              <View style={s.combineBadge}>
                <Text style={s.combineBadgeText}>Combine {pickEmoji(combineSelection!.selection)}</Text>
              </View>
            )}
            <Text style={alreadyBet ? s.lockedBadge : s.openBadge}>{alreadyBet ? 'Parie' : 'Ouvert'}</Text>
          </View>
        </View>
        <View style={s.oddsRow}>
          {(['home', 'draw', 'away'] as Pick[]).map((pick) => {
            const isSelected = combineSelection?.selection === pick;
            return (
              <TouchableOpacity key={pick} disabled={alreadyBet}
                style={[s.oddButton, alreadyBet && s.oddButtonDisabled, isSelected && s.oddButtonSelected]}
                onPress={() => betType === 'combine' ? toggleCombineSelection(match, pick) : placeBet(match, pick)}
                activeOpacity={0.75}>
                <Text style={[s.oddLabel, isSelected && s.oddLabelSelected]}>{pickEmoji(pick)} {pickLabel(pick)}</Text>
                <Text style={[s.oddValue, isSelected && s.oddValueSelected]}>{match.odds[pick].toFixed(2)}x</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  // ===================== RENDER TABS =====================
  const renderMatches = () => (
    <View style={s.panel}>
      <View style={s.sectionHeader}>
        <View style={s.grow}>
          <Text style={s.sectionTitle}>Matchs ouverts</Text>
          <Text style={s.meta}>Cotes reelles des bookmakers uniquement.</Text>
        </View>
        <TouchableOpacity style={s.dangerButton} onPress={resolveNextMatch} disabled={!openMatches.length}>
          <Text style={s.dangerText}>Resultat</Text>
        </TouchableOpacity>
      </View>

      <View style={s.betTypeRow}>
        <TouchableOpacity style={[s.betTypeButton, betType === 'simple' && s.activeBetType]} onPress={() => { setBetType('simple'); setCombineSelections([]); }}>
          <Text style={[s.betTypeText, betType === 'simple' && s.activeBetTypeText]}>Simple</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.betTypeButton, betType === 'combine' && s.activeBetType]} onPress={() => setBetType('combine')}>
          <Text style={[s.betTypeText, betType === 'combine' && s.activeBetTypeText]}>Combine {combineSelections.length > 0 ? `(${combineSelections.length})` : ''}</Text>
        </TouchableOpacity>
      </View>

      {betType === 'combine' && combineSelections.length > 0 && (
        <View style={s.combineInfo}>
          <Text style={s.combineInfoText}>{combineSelections.length} selection{combineSelections.length > 1 ? 's' : ''} - Cote totale: {combineSelections.reduce((a, sel) => a * sel.odds, 1).toFixed(2)}x</Text>
          <View style={s.combineActions}>
            <TouchableOpacity style={s.combineClear} onPress={clearCombine}><Text style={s.combineClearText}>Vider</Text></TouchableOpacity>
            <TouchableOpacity style={s.combinePlace} onPress={placeCombineBet}><Text style={s.combinePlaceText}>Placer le combine</Text></TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.leagueScroll} contentContainerStyle={s.leagueRow}>
        {LEAGUES.map((item) => (
          <TouchableOpacity key={item.key} style={[s.leagueChip, league.key === item.key && s.activeLeagueChip]} onPress={() => setLeague(item)}>
            <Text style={[s.leagueChipText, league.key === item.key && s.activeLeagueChipText]}>{item.short}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={s.stakeRow}>
        {STAKES.map((value) => (
          <TouchableOpacity key={value} style={[s.stakeButton, stake === value && s.activeStake]} onPress={() => selectStake(value)}>
            <Text style={[s.stakeText, stake === value && s.activeStakeText]}>{value}</Text>
          </TouchableOpacity>
        ))}
        <TextInput value={stakeInput} onChangeText={updateStake} keyboardType="numeric" style={s.stakeInput} />
      </View>

      {loading && (
        <View style={s.loadingBox}>
          <ActivityIndicator color="#f4c542" size="small" />
          <Text style={s.loadingText}>Chargement des cotes {league.label}...</Text>
        </View>
      )}

      {!loading && openMatches.map(renderMatch)}

      {!loading && !openMatches.length && (
        <View style={[s.emptyBox, errored && s.errorBox]}>
          <Text style={s.emptyTitle}>{errored ? 'Connexion impossible' : 'Aucune cote disponible'}</Text>
          <Text style={s.emptyText}>{errored ? 'Verifiez que le proxy tourne et que EXPO_PUBLIC_ODDS_API_KEY est configure.' : `Aucun match ouvert pour ${league.label} actuellement. Essayez une autre competition.`}</Text>
          <TouchableOpacity style={s.retryButton} onPress={() => loadOdds(league)}><Text style={s.retryText}>Reessayer</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderTickets = () => {
    const playerBets = bets.filter((b) => b.playerId === currentPlayer.id);
    const playerCombines = combines.filter((c) => c.playerId === currentPlayer.id);
    return (
      <View style={s.panel}>
        <Text style={s.sectionTitle}>Tickets</Text>
        {playerBets.filter((b) => b.type === 'simple').map((bet) => (
          <View key={bet.id} style={s.ticketRow}>
            <View style={s.grow}>
              <Text style={s.goldText}>{bet.playerName}</Text>
              <Text style={s.ticketTitle}>{bet.label}</Text>
              <Text style={s.meta}>{pickEmoji(bet.selection)} {pickLabel(bet.selection)} - {bet.odds.toFixed(2)}x</Text>
              {bet.settledAt && <Text style={s.meta}>Le {formatShortDate(bet.settledAt)}</Text>}
            </View>
            <View style={s.right}>
              <Text style={s.ticketTitle}>{money(bet.stake)}</Text>
              <Text style={[s.result, s[bet.result]]}>{bet.result === 'pending' ? 'En cours' : bet.result === 'won' ? 'Gagne' : 'Perdu'}</Text>
              <Text style={s.meta}>Max {money(bet.potentialReturn)}</Text>
            </View>
          </View>
        ))}
        {playerCombines.map((combine) => (
          <View key={combine.id} style={[s.ticketRow, s.combineTicket]}>
            <View style={s.grow}>
              <Text style={s.goldText}>🎯 Combine - {combine.playerName}</Text>
              {combine.selections.map((sel, idx) => (
                <Text key={idx} style={s.meta}>{sel.label}: {pickEmoji(sel.selection)} {pickLabel(sel.selection)} @ {sel.odds.toFixed(2)}x</Text>
              ))}
              <Text style={s.meta}>Cote totale: {combine.totalOdds}x</Text>
            </View>
            <View style={s.right}>
              <Text style={s.ticketTitle}>{money(combine.stake)}</Text>
              <Text style={[s.result, s[combine.result]]}>{combine.result === 'pending' ? 'En cours' : combine.result === 'won' ? 'Gagne' : 'Perdu'}</Text>
              <Text style={s.meta}>Max {money(combine.potentialReturn)}</Text>
            </View>
          </View>
        ))}
        {!playerBets.length && !playerCombines.length && (
          <View style={s.emptyBox}>
            <Text style={s.emptyTitle}>Aucun ticket</Text>
            <Text style={s.emptyText}>Placez une mise depuis l'onglet Matchs pour voir vos tickets ici.</Text>
          </View>
        )}
      </View>
    );
  };

  const renderHistory = () => {
    const filteredBets = bets.filter((b) => b.playerId === currentPlayer.id && b.result !== 'pending').filter((b) => historyFilter === 'all' || b.result === historyFilter);
    return (
      <View style={s.panel}>
        <Text style={s.sectionTitle}>Historique</Text>
        <View style={s.filterRow}>
          {(['all', 'won', 'lost'] as const).map((f) => (
            <TouchableOpacity key={f} style={[s.filterButton, historyFilter === f && s.activeFilterButton]} onPress={() => setHistoryFilter(f)}>
              <Text style={[s.filterText, historyFilter === f && s.activeFilterText]}>{f === 'all' ? 'Tous' : f === 'won' ? 'Gagnes' : 'Perdus'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {filteredBets.map((bet) => (
          <View key={bet.id} style={s.historyRow}>
            <View style={s.grow}>
              <Text style={s.ticketTitle}>{bet.label}</Text>
              <Text style={s.meta}>{pickEmoji(bet.selection)} {pickLabel(bet.selection)} @ {bet.odds.toFixed(2)}x</Text>
              <Text style={s.meta}>Le {formatShortDate(bet.settledAt)}</Text>
            </View>
            <View style={s.right}>
              <Text style={s.ticketTitle}>{money(bet.stake)}</Text>
              <Text style={[s.result, s[bet.result]]}>{bet.result === 'won' ? `+${money(bet.potentialReturn)}` : `-${money(bet.stake)}`}</Text>
            </View>
          </View>
        ))}
        {!filteredBets.length && (
          <View style={s.emptyBox}>
            <Text style={s.emptyTitle}>Aucun historique</Text>
            <Text style={s.emptyText}>Vos paris termines apparaitront ici.</Text>
          </View>
        )}
      </View>
    );
  };

  const renderStats = () => {
    const { won, lost, pending, totalStaked, totalWon, roi, balanceHistory } = playerStats;
    const totalBets = won + lost;
    const winRate = totalBets > 0 ? (won / totalBets * 100).toFixed(1) : '0';
    return (
      <View style={s.panel}>
        <Text style={s.sectionTitle}>Statistiques - {currentPlayer.name}</Text>
        <View style={s.statsGrid}>
          <View style={s.statCard}><Text style={s.statCardValue}>{won}</Text><Text style={s.statCardLabel}>Gagnes</Text></View>
          <View style={s.statCard}><Text style={s.statCardValue}>{lost}</Text><Text style={s.statCardLabel}>Perdus</Text></View>
          <View style={s.statCard}><Text style={s.statCardValue}>{pending}</Text><Text style={s.statCardLabel}>En cours</Text></View>
          <View style={s.statCard}><Text style={[s.statCardValue, { color: roi >= 0 ? '#46d7a5' : '#ff5d73' }]}>{roi.toFixed(1)}%</Text><Text style={s.statCardLabel}>ROI</Text></View>
        </View>
        <View style={s.statSummary}>
          <View style={s.statSummaryRow}><Text style={s.statSummaryLabel}>Total mise</Text><Text style={s.statSummaryValue}>{money(totalStaked)}</Text></View>
          <View style={s.statSummaryRow}><Text style={s.statSummaryLabel}>Total gagne</Text><Text style={[s.statSummaryValue, { color: '#46d7a5' }]}>{money(totalWon)}</Text></View>
          <View style={s.statSummaryRow}><Text style={s.statSummaryLabel}>Profit/Perte</Text><Text style={[s.statSummaryValue, { color: totalWon - totalStaked >= 0 ? '#46d7a5' : '#ff5d73' }]}>{money(totalWon - totalStaked)}</Text></View>
          <View style={s.statSummaryRow}><Text style={s.statSummaryLabel}>Taux de reussite</Text><Text style={s.statSummaryValue}>{winRate}%</Text></View>
        </View>
        {balanceHistory.length > 0 && (
          <View style={s.chartContainer}>
            <Text style={s.chartTitle}>Evolution du solde</Text>
            <View style={s.chartBars}>
              {balanceHistory.slice(-10).map((point, idx) => {
                const maxBalance = Math.max(...balanceHistory.map((p) => p.balance), STARTING_BALANCE);
                const height = (point.balance / maxBalance) * 100;
                const isProfit = point.balance >= STARTING_BALANCE;
                return (
                  <View key={idx} style={s.chartBarContainer}>
                    <View style={[s.chartBar, { height: Math.max(height, 10), backgroundColor: isProfit ? '#46d7a5' : '#ff5d73' }]} />
                    <Text style={s.chartBarLabel}>{point.date}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderFriends = () => (
    <View style={s.panel}>
      <View style={s.sectionHeader}>
        <View style={s.grow}><Text style={s.sectionTitle}>Competition entre amis</Text></View>
        <TouchableOpacity style={s.dangerButtonSmall} onPress={resetData}><Text style={s.dangerTextSmall}>Reset</Text></TouchableOpacity>
      </View>
      <View style={s.inputRow}>
        <TextInput value={friendName} onChangeText={setFriendName} placeholder="Nom du joueur" placeholderTextColor="#7f90a5" style={s.input} onSubmitEditing={addFriend} returnKeyType="done" />
        <TouchableOpacity style={s.goldButton} onPress={addFriend}><Text style={s.goldButtonText}>Ajouter</Text></TouchableOpacity>
      </View>
      {leaderboard.map((player, index) => (
        <TouchableOpacity key={player.id} style={[s.friendRow, player.id === selectedPlayerId && s.activeFriend]} onPress={() => handleSelectPlayer(player.id)}>
          <View style={s.friendLeft}>
            <View style={[s.rankBadge, index === 0 && s.rankBadgeFirst]}><Text style={[s.rankText, index === 0 && s.rankTextFirst]}>{index + 1}</Text></View>
            <View>
              <Text style={s.ticketTitle}>{player.name}</Text>
              <Text style={s.meta}>{player.role} - entree {money(ENTRY_FEE)}</Text>
            </View>
          </View>
          <Text style={s.balance}>{money(player.balance)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // ===================== MAIN RENDER =====================
  if (showSplash) return <SplashScreen onFinish={() => setShowSplash(false)} />;

  if (authLoading) {
    return (
      <SafeAreaView style={s.safeArea}>
        <View style={s.loginContainer}>
          <ActivityIndicator size="large" color="#f4c542" />
          <Text style={s.loginInfo}>Chargement de la session...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={s.safeArea}>
        <ScrollView contentContainerStyle={s.loginContainer} keyboardShouldPersistTaps="handled">
          <Text style={s.loginTitle}>Bet Taha</Text>
          <Text style={s.loginSubtitle}>Connectez-vous pour acceder a votre competition</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="Nom"
            placeholderTextColor="#7f90a5"
            style={[s.input, s.loginInput]}
            autoCapitalize="words"
            returnKeyType="next"
          />
          <TextInput
            value={pinInput}
            onChangeText={setPinInput}
            placeholder="Code PIN"
            placeholderTextColor="#7f90a5"
            secureTextEntry
            keyboardType="number-pad"
            style={[s.input, s.loginInput]}
            returnKeyType="done"
          />
          {loginError ? <Text style={s.loginError}>{loginError}</Text> : null}
          <TouchableOpacity style={s.loginButton} onPress={login} activeOpacity={0.8}>
            <Text style={s.loginButtonText}>Se connecter</Text>
          </TouchableOpacity>
          <Text style={s.loginHelp}>Utilisez le nom d'un joueur existant et le PIN 1234.</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safeArea}>
      <StatusBar style="light" />
      <View style={{ position: 'absolute', top: 60, left: 0, right: 0, zIndex: 9999, alignItems: 'center' }}>
        {toasts.map((toast) => <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />)}
      </View>
      <PinModal visible={pinModal?.visible ?? false} onVerify={verifyPin} onCancel={() => { setPinModal(null); setPendingPlayerId(null); }} playerName={pinModal?.playerName ?? ''} />

      <ScrollView contentContainerStyle={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadOdds(league, true)} tintColor="#f4c542" />}>
        <View style={s.hero}>
          <View style={s.heroTop}>
            <View><Text style={s.eyebrow}>Sportsbook prive</Text><Text style={s.title}>Bet Taha</Text></View>
            <Text style={s.liveBadge}>Live</Text>
          </View>
          <Text style={s.subtitle}>Competition de paris entre amis avec wallet, tickets, pot et classement.</Text>
          <Text style={[s.status, errored && s.statusError]}>{status}</Text>
          <View style={s.statsRow}>
            <View style={s.statBox}><Text style={s.statValue}>{money(currentPlayer.balance)}</Text><Text style={s.meta}>Wallet actif</Text></View>
            <View style={s.statBox}><Text style={s.statValue}>{money(prizePool)}</Text><Text style={s.meta}>Pot amis</Text></View>
            <View style={s.statBox}><Text style={s.statValue}>{pendingBets.length}</Text><Text style={s.meta}>Tickets ouverts</Text></View>
          </View>
        </View>

        <View style={s.playerBar}>
          <Text style={s.meta}>Joueur actif</Text>
          <Text style={s.activePlayer}>{currentPlayer.name}</Text>
        {isAuthenticated && (
          <TouchableOpacity style={s.logoutButton} onPress={logout}>
            <Text style={s.logoutButtonText}>Deconnexion</Text>
          </TouchableOpacity>
        )}
          <View style={s.chipRow}>
            {players.map((player) => (
              <TouchableOpacity key={player.id} style={[s.chip, player.id === selectedPlayerId && s.activeChip]} onPress={() => handleSelectPlayer(player.id)}>
                <Text style={[s.chipText, player.id === selectedPlayerId && s.activeChipText]}>{player.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.tabs}>
          {(['matches', 'tickets', 'history', 'stats', 'friends'] as Tab[]).map((item) => (
            <TouchableOpacity key={item} style={[s.tab, tab === item && s.activeTab]} onPress={() => setTab(item)}>
              <Text style={[s.tabText, tab === item && s.activeTabText]}>{item === 'matches' ? 'Matchs' : item === 'tickets' ? 'Tickets' : item === 'history' ? 'Historique' : item === 'stats' ? 'Stats' : 'Amis'}</Text>
              {item === 'tickets' && pendingBets.length > 0 && (
                <View style={s.tabDot}><Text style={s.tabDotText}>{pendingBets.length}</Text></View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'matches' && renderMatches()}
        {tab === 'tickets' && renderTickets()}
        {tab === 'history' && renderHistory()}
        {tab === 'stats' && renderStats()}
        {tab === 'friends' && renderFriends()}
      </ScrollView>
    </SafeAreaView>
  );
}

// ===================== STYLES =====================
const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#080e16' },
  container: { padding: 16, paddingBottom: 40, backgroundColor: '#080e16' },
  hero: { backgroundColor: '#111d2b', borderRadius: 20, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(244,197,66,0.12)' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  eyebrow: { color: '#f4c542', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  title: { color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: '#94a5ba', fontSize: 14, lineHeight: 20, marginBottom: 8 },
  status: { color: '#46d7a5', fontSize: 12, fontWeight: '800', marginBottom: 14 },
  statusError: { color: '#ff5d73' },
  liveBadge: { overflow: 'hidden', backgroundColor: '#d71920', color: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, fontWeight: '900', fontSize: 11 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statBox: { flex: 1, minHeight: 72, backgroundColor: '#182533', borderRadius: 14, padding: 12, justifyContent: 'center' },
  statValue: { color: '#fff', fontSize: 16, fontWeight: '900', marginBottom: 3 },
  playerBar: { backgroundColor: '#0e1721', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  activePlayer: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#1a2735', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  activeChip: { backgroundColor: '#f4c542' },
  chipText: { color: '#dce6f2', fontWeight: '800', fontSize: 13 },
  activeChipText: { color: '#111820' },
  tabs: { flexDirection: 'row', backgroundColor: '#0e1721', borderRadius: 14, padding: 4, marginBottom: 12 },
  tab: { flex: 1, borderRadius: 11, paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  activeTab: { backgroundColor: '#fff' },
  tabText: { color: '#9aaabc', fontWeight: '900', fontSize: 11 },
  activeTabText: { color: '#111820' },
  tabDot: { backgroundColor: '#d71920', borderRadius: 999, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabDotText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  panel: { backgroundColor: '#0e1721', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '900', marginBottom: 4 },
  grow: { flex: 1 },
  meta: { color: '#8697ab', fontSize: 12 },
  dangerButton: { backgroundColor: '#d71920', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  dangerText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  dangerButtonSmall: { backgroundColor: 'rgba(215,25,32,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(215,25,32,0.4)' },
  dangerTextSmall: { color: '#ff5d73', fontWeight: '900', fontSize: 11 },

  betTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  betTypeButton: { flex: 1, backgroundColor: '#182533', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  activeBetType: { backgroundColor: '#f4c542' },
  betTypeText: { color: '#dce6f2', fontWeight: '900', fontSize: 13 },
  activeBetTypeText: { color: '#111820' },

  combineInfo: { backgroundColor: '#182533', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(244,197,66,0.2)' },
  combineInfoText: { color: '#f4c542', fontWeight: '800', fontSize: 13, marginBottom: 8 },
  combineActions: { flexDirection: 'row', gap: 8 },
  combineClear: { backgroundColor: '#1a2735', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  combineClearText: { color: '#ff5d73', fontWeight: '900', fontSize: 12 },
  combinePlace: { backgroundColor: '#f4c542', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, flex: 1, alignItems: 'center' },
  combinePlaceText: { color: '#111820', fontWeight: '900', fontSize: 12 },
  combineBadge: { backgroundColor: 'rgba(244,197,66,0.2)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4 },
  combineBadgeText: { color: '#f4c542', fontSize: 10, fontWeight: '900' },
  matchBadges: { alignItems: 'flex-end' },
  combineTicket: { borderWidth: 2, borderColor: 'rgba(244,197,66,0.3)' },

  leagueScroll: { marginBottom: 12 },
  leagueRow: { gap: 8, paddingRight: 4 },
  leagueChip: { backgroundColor: '#182533', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: 'transparent' },
  activeLeagueChip: { backgroundColor: '#f4c542' },
  leagueChipText: { color: '#dce6f2', fontWeight: '900', fontSize: 12 },
  activeLeagueChipText: { color: '#111820' },

  stakeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stakeButton: { flex: 1, minHeight: 42, backgroundColor: '#192737', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  activeStake: { backgroundColor: '#f4c542' },
  stakeText: { color: '#dce6f2', fontWeight: '900' },
  activeStakeText: { color: '#111820' },
  stakeInput: { width: 64, minHeight: 42, backgroundColor: '#192737', borderRadius: 10, color: '#fff', fontWeight: '900', paddingHorizontal: 10, textAlign: 'center' },

  loadingBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#142131', borderRadius: 12, padding: 16, marginBottom: 8 },
  loadingText: { color: '#9aaabc', fontSize: 13, fontWeight: '700' },

  matchCard: { backgroundColor: '#142131', borderRadius: 14, padding: 13, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  matchHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  league: { color: '#f4c542', fontSize: 11, fontWeight: '900', marginBottom: 3, textTransform: 'uppercase' },
  matchTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  openBadge: { overflow: 'hidden', color: '#46d7a5', backgroundColor: 'rgba(70,215,165,0.15)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '900' },
  lockedBadge: { overflow: 'hidden', color: '#f4c542', backgroundColor: 'rgba(244,197,66,0.15)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '900' },
  oddsRow: { flexDirection: 'row', gap: 8 },
  oddButton: { flex: 1, minHeight: 66, backgroundColor: '#0b141e', borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  oddButtonDisabled: { opacity: 0.4 },
  oddButtonSelected: { backgroundColor: 'rgba(244,197,66,0.15)', borderColor: '#f4c542' },
  oddLabel: { color: '#8999ac', fontSize: 11, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase' },
  oddLabelSelected: { color: '#f4c542' },
  oddValue: { color: '#fff', fontSize: 17, fontWeight: '900' },
  oddValueSelected: { color: '#f4c542' },

  emptyBox: { backgroundColor: '#142131', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: 'rgba(244,197,66,0.24)' },
  errorBox: { borderColor: 'rgba(255,93,115,0.35)' },
  emptyTitle: { color: '#f4c542', fontSize: 15, fontWeight: '900', marginBottom: 6 },
  emptyText: { color: '#aab7c7', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  retryButton: { alignSelf: 'flex-start', backgroundColor: '#f4c542', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  retryText: { color: '#111820', fontWeight: '900', fontSize: 13 },

  ticketRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, backgroundColor: '#142131', borderRadius: 14, padding: 13, marginBottom: 10 },
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

  friendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#142131', borderRadius: 14, padding: 13, marginBottom: 8, borderWidth: 1, borderColor: 'transparent' },
  friendLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rankBadge: { width: 28, height: 28, borderRadius: 999, backgroundColor: '#1a2735', alignItems: 'center', justifyContent: 'center' },
  rankBadgeFirst: { backgroundColor: '#f4c542' },
  rankText: { color: '#dce6f2', fontWeight: '900', fontSize: 12 },
  rankTextFirst: { color: '#111820' },
  activeFriend: { borderColor: '#f4c542' },
  balance: { color: '#46d7a5', fontWeight: '900' },

  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterButton: { backgroundColor: '#182533', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  activeFilterButton: { backgroundColor: '#f4c542' },
  filterText: { color: '#dce6f2', fontWeight: '900', fontSize: 12 },
  activeFilterText: { color: '#111820' },

  historyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, backgroundColor: '#142131', borderRadius: 14, padding: 13, marginBottom: 10 },

  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: '#182533', borderRadius: 14, padding: 12, alignItems: 'center' },
  statCardValue: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 4 },
  statCardLabel: { color: '#8697ab', fontSize: 11, fontWeight: '800' },

  statSummary: { backgroundColor: '#142131', borderRadius: 14, padding: 16, marginBottom: 16 },
  statSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  statSummaryLabel: { color: '#8697ab', fontSize: 13, fontWeight: '700' },
  statSummaryValue: { color: '#fff', fontSize: 13, fontWeight: '900' },

  chartContainer: { backgroundColor: '#142131', borderRadius: 14, padding: 16 },
  chartTitle: { color: '#f4c542', fontSize: 14, fontWeight: '900', marginBottom: 12 },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 120, gap: 4 },
  chartBarContainer: { alignItems: 'center', flex: 1 },
  chartBar: { width: 20, borderRadius: 4, minHeight: 4 },
  chartBarLabel: { color: '#8697ab', fontSize: 9, marginTop: 4 },
  loginContainer: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#080e16' },
  loginTitle: { color: '#f4c542', fontSize: 36, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
  loginSubtitle: { color: '#94a5ba', fontSize: 14, textAlign: 'center', marginBottom: 28 },
  loginInput: { marginBottom: 12 },
  loginButton: { backgroundColor: '#f4c542', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginVertical: 12 },
  loginButtonText: { color: '#111820', fontWeight: '900', fontSize: 15 },
  loginError: { color: '#ff5d73', fontSize: 13, textAlign: 'center', marginTop: 6 },
  loginHelp: { color: '#8697ab', fontSize: 12, textAlign: 'center', marginTop: 16, lineHeight: 18 },
  loginInfo: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 18 },
  logoutButton: { alignSelf: 'flex-start', marginTop: 10, backgroundColor: '#d71920', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  logoutButtonText: { color: '#fff', fontWeight: '900', fontSize: 12 },
});
