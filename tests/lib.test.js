const test = require('node:test');
const assert = require('node:assert');
const L = require('../lib.js');

const ev = {
  id: '1', date: '2026-11-15T20:20Z',
  competitions: [{
    competitors: [
      { homeAway: 'home', score: '10', team: { id: '4', abbreviation: 'CIN', shortDisplayName: 'Bengals' }, records: [{ type: 'total', summary: '6-2' }] },
      { homeAway: 'away', score: '7', team: { id: '23', abbreviation: 'PIT', shortDisplayName: 'Steelers' } }
    ],
    status: { period: 2, displayClock: '4:00', type: { state: 'in', shortDetail: '4:00 - 2nd' } },
    situation: { downDistanceText: '2nd & 5 at PIT 30', possession: '4', isRedZone: false, lastPlay: { text: 'Pass' } }
  }]
};

test('normalizeEvent reads teams, state and situation', () => {
  const g = L.normalizeEvent(ev);
  assert.strictEqual(g.home.abbr, 'CIN');
  assert.strictEqual(g.home.record, '6-2');
  assert.strictEqual(g.away.score, '7');
  assert.strictEqual(g.state, 'in');
  assert.strictEqual(g.possession, '4');
  assert.strictEqual(g.down, '2nd & 5 at PIT 30');
  assert.ok(L.hasTeam(g, 'PIT'));
});

test('normalizeEvent tolerates bad input', () => {
  assert.strictEqual(L.normalizeEvent({}), null);
  assert.strictEqual(L.normalizeEvent(null), null);
});

test('plays flatten across drives and injury plays are found', () => {
  const sum = { drives: { previous: [{ plays: [{ id: 1, text: 'Run for 3' }] }], current: { plays: [{ id: 2, text: 'J. Doe is injured and will not return' }] } } };
  const plays = L.playsFromSummary(sum);
  assert.strictEqual(plays.length, 2);
  assert.deepStrictEqual(L.injuryPlays(plays).map((p) => p.id), ['2']);
  assert.deepStrictEqual(L.playsFromSummary(null), []);
});

test('injuriesFromSummary builds player rows', () => {
  const sum = { injuries: [{ team: { abbreviation: 'CIN' }, injuries: [{ status: 'Out', athlete: { id: 9, shortName: 'K. Dugger', jersey: '29', position: { abbreviation: 'S' } }, details: { side: 'Left', type: 'Quadriceps' } }] }] };
  const r = L.injuriesFromSummary(sum);
  assert.strictEqual(r[0].players[0].detail, 'Left Quadriceps');
  assert.strictEqual(r[0].players[0].id, '9');
});

test('tent state cycles', () => {
  assert.strictEqual(L.nextTent(0), 1);
  assert.strictEqual(L.nextTent(3), 0);
});

test('divisionStandings keeps only AFC North, best first', () => {
  const mk = (abbr, w, l, pct) => ({ team: { abbreviation: abbr }, stats: [{ name: 'wins', value: w }, { name: 'losses', value: l }, { name: 'winPercent', value: pct }] });
  const json = { children: [{ standings: { entries: [mk('BUF', 8, 1, 0.89), mk('PIT', 5, 3, 0.62), mk('CIN', 6, 2, 0.75)] } }] };
  assert.deepStrictEqual(L.divisionStandings(json).map((r) => r.abbr), ['CIN', 'PIT']);
});
test('sortGames puts live first, then upcoming, then finals, Bengals first in a group', () => {
  const g = (id, state, date, a, h) => ({ id, state, date, home: { abbr: h }, away: { abbr: a } });
  const out = L.sortGames([
    g('f', 'post', '2026-11-15T17:00Z', 'NE', 'NYJ'),
    g('p2', 'pre', '2026-11-15T21:00Z', 'DAL', 'PHI'),
    g('p1', 'pre', '2026-11-15T18:00Z', 'GB', 'CHI'),
    g('l', 'in', '2026-11-15T17:00Z', 'MIA', 'BUF'),
    g('l2', 'in', '2026-11-15T17:00Z', 'PIT', 'CIN')
  ], 'CIN').map(x => x.id);
  assert.deepStrictEqual(out, ['l2', 'l', 'p1', 'p2', 'f']);
});
test('leagueStandings returns every team with its conference, best first', () => {
  const e = (abbr, w, l, pct) => ({ team: { abbreviation: abbr }, stats: [{ name: 'wins', value: w }, { name: 'losses', value: l }, { name: 'winPercent', value: pct }] });
  const out = L.leagueStandings({ children: [
    { abbreviation: 'AFC', standings: { entries: [e('CIN', 6, 3, 0.667), e('KC', 8, 1, 0.889)] } },
    { abbreviation: 'NFC', standings: { entries: [e('PHI', 7, 2, 0.778)] } }
  ] });
  assert.deepStrictEqual(out.map(r => r.abbr + ':' + r.conf), ['KC:AFC', 'PHI:NFC', 'CIN:AFC']);
});
test('injuryNote keeps only the injury sentence', () => {
  assert.strictEqual(L.injuryNote("Pass short right (E.Ponder). DET-K.Dorsey was injured during the play. NE-A.Brown was injured during the play."),
    'DET-K.Dorsey was injured during the play. NE-A.Brown was injured during the play.');
  assert.strictEqual(L.injuryNote('J.Bates kicks 56 yards. ** Injury Update: DET-K.Dorsey has returned to the game.'),
    'Update: DET-K.Dorsey has returned to the game.');
});
test('winChance reads the live series, else the pregame predictor, else null', () => {
  assert.deepStrictEqual(L.winChance({ winprobability: [{ homeWinPercentage: 0.5 }, { homeWinPercentage: 0.714 }] }), { home: 71, away: 29 });
  assert.deepStrictEqual(L.winChance({ winprobability: [], predictor: { homeTeam: { gameProjection: '70.5' }, awayTeam: { gameProjection: '29.2' } } }), { home: 71, away: 29 });
  assert.strictEqual(L.winChance({}), null);
  assert.strictEqual(L.winChance(null), null);
});
