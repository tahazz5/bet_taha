// API-Football competition IDs distinguish the top divisions from namesakes,
// domestic cups, women's leagues and youth competitions.
export const footballCompetitions = [
  { id: 39, name: 'Premier League', region: 'Angleterre' },
  { id: 140, name: 'La Liga', region: 'Espagne' },
  { id: 135, name: 'Serie A', region: 'Italie' },
  { id: 78, name: 'Bundesliga', region: 'Allemagne' },
  { id: 61, name: 'Ligue 1', region: 'France' },
  { id: 2, name: 'UEFA Champions League', region: 'Europe' },
  { id: 3, name: 'UEFA Europa League', region: 'Europe' },
  { id: 848, name: 'UEFA Conference League', region: 'Europe' }
];
export const competitionById = id => footballCompetitions.find(competition => competition.id === Number(id));
export const isSupportedFixture = fixture => Boolean(competitionById(fixture.league?.id));
