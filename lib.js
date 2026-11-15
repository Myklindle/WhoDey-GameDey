// Pure data helpers, kept apart from the page so they can be tested in Node.
(function (root) {
  'use strict';
  var DIVISION = ['BAL', 'CIN', 'CLE', 'PIT'];
  var TENT_STATES = ['', 'In tent', 'Out for game', 'Back in'];

  // Reduce one ESPN scoreboard event to the fields the app shows.
  function normalizeEvent(ev) {
    var comp = ev && ev.competitions && ev.competitions[0];
    if (!comp || !Array.isArray(comp.competitors)) return null;
    var teams = {};
    comp.competitors.forEach(function (c) {
      var rec = (c.records || []).filter(function (r) { return r.type === 'total'; })[0];
      teams[c.homeAway] = {
        id: String(c.team.id),
        abbr: c.team.abbreviation,
        name: c.team.shortDisplayName || c.team.displayName,
        score: c.score == null ? '' : String(c.score),
        record: rec ? rec.summary : '',
        winner: !!c.winner,
        lines: (c.linescores || []).map(function (x) { return String(x.displayValue != null ? x.displayValue : x.value); })
      };
    });
    if (!teams.home || !teams.away) return null;
    var st = (comp.status || ev.status || {});
    var type = st.type || {};
    var sit = comp.situation || null;
    return {
      id: String(ev.id),
      date: ev.date,
      state: type.state || 'pre',
      detail: type.shortDetail || '',
      period: st.period || 0,
      clock: st.displayClock || '',
      home: teams.home,
      away: teams.away,
      network: (comp.broadcasts && comp.broadcasts[0] && comp.broadcasts[0].names && comp.broadcasts[0].names[0]) || '',
      down: sit ? (sit.downDistanceText || '') : '',
      spot: sit ? (sit.possessionText || '') : '',
      possession: sit && sit.possession != null ? String(sit.possession) : '',
      redZone: !!(sit && sit.isRedZone),
      lastPlay: sit && sit.lastPlay ? (sit.lastPlay.text || '') : ''
    };
  }

  function hasTeam(ev, abbr) {
    return !!ev && (ev.home.abbr === abbr || ev.away.abbr === abbr);
  }

  // Flatten the plays in a summary response, oldest first.
  function playsFromSummary(sum) {
    var out = [];
    if (!sum) return out;
    var drives = sum.drives || {};
    var groups = [].concat(drives.previous || [], drives.current ? [drives.current] : []);
    groups.forEach(function (d) {
      (d.plays || []).forEach(function (p) { out.push(p); });
    });
    if (!out.length && Array.isArray(sum.plays)) out = sum.plays.slice();
    return out.map(function (p) {
      return {
        id: String(p.id || ''),
        text: String(p.text || p.shortText || ''),
        period: p.period && p.period.number ? p.period.number : 0,
        clock: p.clock && p.clock.displayValue ? p.clock.displayValue : ''
      };
    });
  }

  var INJURY_RE = /injur|to the locker room|medical|trainer|\bcart\b|\bleft the game\b|\bwill not return\b|questionable to return/i;
  function injuryPlays(plays) {
    return plays.filter(function (p) { return INJURY_RE.test(p.text); });
  }

  // Pregame injury report: [{team, abbr, players:[{id,name,pos,jersey,status,detail}]}]
  function injuriesFromSummary(sum) {
    return ((sum && sum.injuries) || []).map(function (t) {
      return {
        abbr: t.team && t.team.abbreviation,
        players: (t.injuries || []).map(function (i) {
          var a = i.athlete || {};
          var d = i.details || {};
          return {
            id: String(a.id),
            name: a.shortName || a.displayName || 'Unknown',
            pos: a.position && a.position.abbreviation || '',
            jersey: a.jersey || '',
            status: i.status || '',
            detail: [d.side && d.side !== 'Not Specified' ? d.side : '', d.type || ''].filter(Boolean).join(' ')
          };
        })
      };
    });
  }

  // Live games first, then upcoming by kickoff, then finals. Bengals first within a group.
  function sortGames(games, mine) {
    var rank = { 'in': 0, pre: 1, post: 2 };
    return games.slice().sort(function (a, b) {
      var ra = rank[a.state] == null ? 1 : rank[a.state];
      var rb = rank[b.state] == null ? 1 : rank[b.state];
      if (ra !== rb) return ra - rb;
      var ma = hasTeam(a, mine) ? 0 : 1, mb = hasTeam(b, mine) ? 0 : 1;
      if (ma !== mb) return ma - mb;
      return (Date.parse(a.date) || 0) - (Date.parse(b.date) || 0);
    });
  }
  function nextTent(i) { return (i + 1) % TENT_STATES.length; }

  // Standings rows for the division, best record first.
  function divisionStandings(json) {
    var rows = [];
    ((json && json.children) || []).forEach(function (conf) {
      ((conf.standings && conf.standings.entries) || []).forEach(function (e) {
        var abbr = e.team && e.team.abbreviation;
        if (DIVISION.indexOf(abbr) < 0) return;
        var s = {};
        (e.stats || []).forEach(function (x) { s[x.name] = x.value; });
        rows.push({ abbr: abbr, w: s.wins || 0, l: s.losses || 0, t: s.ties || 0, pct: s.winPercent || 0 });
      });
    });
    rows.sort(function (a, b) { return b.pct - a.pct || b.w - a.w; });
    return rows;
  }

  // All teams from a standings response: [{abbr, conf, w, l, t, pct}], best record first.
  // Sorted by win percentage then wins; this is not the NFL's full tiebreaker order.
  function leagueStandings(json) {
    var rows = [];
    ((json && json.children) || []).forEach(function (conf) {
      var cname = conf.abbreviation || conf.name || '';
      ((conf.standings && conf.standings.entries) || []).forEach(function (e) {
        var abbr = e.team && e.team.abbreviation;
        if (!abbr) return;
        var s = {};
        (e.stats || []).forEach(function (x) { s[x.name] = x.value; });
        rows.push({ abbr: abbr, conf: cname, w: s.wins || 0, l: s.losses || 0, t: s.ties || 0, pct: s.winPercent || 0 });
      });
    });
    rows.sort(function (a, b) { return b.pct - a.pct || b.w - a.w; });
    return rows;
  }

  // ---------- game detail (summary endpoint) ----------
  var LIVE_ROWS = [
    ['Total yards', 'totalYards'], ['Passing', 'netPassingYards'], ['Rushing', 'rushingYards'],
    ['Yards/play', 'yardsPerPlay'], ['1st downs', 'firstDowns'], ['3rd down', 'thirdDownEff'],
    ['4th down', 'fourthDownEff'], ['Red zone', 'redZoneAttempts'], ['Turnovers', 'turnovers'],
    ['Sacks-yds', 'sacksYardsLost'], ['Penalties', 'totalPenaltiesYards'], ['Possession', 'possessionTime']
  ];
  var SEASON_ROWS = [
    ['Points/game', 'totalPointsPerGame'], ['Yards/game', 'yardsPerGame'],
    ['Pass yds/g', 'passingYardsPerGame'], ['Rush yds/g', 'rushingYardsPerGame'],
    ['Pts allowed/g', 'totalPointsPerGameAllowed'], ['Yds allowed/g', 'yardsPerGameAllowed'],
    ['Pass allowed/g', 'passingYardsPerGameAllowed'], ['Rush allowed/g', 'rushingYardsPerGameAllowed']
  ];
  function teamStats(sum) {
    var out = {};
    (((sum && sum.boxscore) || {}).teams || []).forEach(function (t) {
      var abbr = t.team && t.team.abbreviation;
      if (!abbr) return;
      out[abbr] = {};
      (t.statistics || []).forEach(function (x) {
        if (out[abbr][x.name] == null) out[abbr][x.name] = x.displayValue;
      });
    });
    return out;
  }
  // Rows for the stats screen. Mode 'game' once the game has started, else 'season' averages.
  function statComparison(sum, awayAbbr, homeAbbr) {
    var ts = teamStats(sum);
    var a = ts[awayAbbr] || {}, h = ts[homeAbbr] || {};
    var mode = (a.totalYards != null || h.totalYards != null) ? 'game' : 'season';
    var rows = [];
    (mode === 'game' ? LIVE_ROWS : SEASON_ROWS).forEach(function (r) {
      if (a[r[1]] == null && h[r[1]] == null) return;
      rows.push({ label: r[0], away: a[r[1]] == null ? '-' : a[r[1]], home: h[r[1]] == null ? '-' : h[r[1]] });
    });
    return { mode: mode, rows: rows };
  }
  function shortName(a) {
    if (!a) return '';
    if (a.firstName && a.lastName) return a.firstName.charAt(0) + '. ' + a.lastName;
    return a.displayName || a.shortName || '';
  }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  // Key players per team: [{abbr, lines:[{pos, name, text}]}]
  function playerLeaders(sum) {
    var out = [];
    (((sum && sum.boxscore) || {}).players || []).forEach(function (tp) {
      var abbr = tp.team && tp.team.abbreviation;
      var groups = {};
      (tp.statistics || []).forEach(function (g) {
        var idx = {};
        (g.labels || []).forEach(function (l, i) { idx[l] = i; });
        groups[g.name] = (g.athletes || []).map(function (x) {
          var st = x.stats || [];
          var get = function (l) { return idx[l] == null ? '' : st[idx[l]]; };
          return { name: shortName(x.athlete), jersey: x.athlete && x.athlete.jersey, get: get };
        });
      });
      function top(name, label, n) {
        return (groups[name] || []).slice().sort(function (p, q) { return num(q.get(label)) - num(p.get(label)); }).slice(0, n);
      }
      var lines = [];
      function add(pos, list, fmt) {
        list.forEach(function (p) { lines.push({ pos: pos, name: p.name, text: fmt(p.get) }); });
      }
      add('PASS', top('passing', 'YDS', 1), function (g) { return g('C/ATT') + ', ' + g('YDS') + ' yds, ' + g('TD') + ' TD, ' + g('INT') + ' INT'; });
      add('RUSH', top('rushing', 'YDS', 2), function (g) { return g('CAR') + ' car, ' + g('YDS') + ' yds, ' + g('TD') + ' TD'; });
      add('REC', top('receiving', 'YDS', 3), function (g) { return g('REC') + ' rec, ' + g('YDS') + ' yds, ' + g('TD') + ' TD'; });
      add('DEF', top('defensive', 'TOT', 2), function (g) {
        return g('TOT') + ' tackles' + (num(g('SACKS')) ? ', ' + g('SACKS') + ' sack' : '') + (num(g('TFL')) ? ', ' + g('TFL') + ' TFL' : '');
      });
      add('INT', (groups.interceptions || []).filter(function (p) { return num(p.get('INT')) > 0; }), function (g) { return g('INT') + ' INT, ' + g('YDS') + ' yds'; });
      add('K', (groups.kicking || []).slice(0, 1), function (g) { return g('FG') + ' FG, long ' + g('LONG') + ', ' + g('XP') + ' XP'; });
      add('P', (groups.punting || []).slice(0, 1), function (g) { return g('NO') + ' punts, ' + g('AVG') + ' avg'; });
      out.push({ abbr: abbr, lines: lines });
    });
    return out;
  }
  // Scoring plays, oldest first.
  function scoringFromSummary(sum) {
    return ((sum && sum.scoringPlays) || []).map(function (p) {
      return {
        id: String(p.id || ''),
        text: String(p.text || ''),
        type: (p.type && (p.type.abbreviation || p.type.text)) || '',
        abbr: (p.team && p.team.abbreviation) || '',
        period: p.period && p.period.number ? p.period.number : 0,
        clock: p.clock && p.clock.displayValue ? p.clock.displayValue : '',
        away: p.awayScore, home: p.homeScore
      };
    });
  }
  // Betting line, venue and weather for the game screen.
  function gameExtras(sum) {
    var pc = sum && sum.pickcenter && sum.pickcenter[0];
    var gi = (sum && sum.gameInfo) || {};
    var v = gi.venue || {};
    var w = gi.weather || {};
    return {
      line: pc && pc.details ? pc.details : '',
      overUnder: pc && pc.overUnder ? String(pc.overUnder) : '',
      venue: v.fullName || '',
      temp: w.temperature != null ? String(w.temperature) : ''
    };
  }
  var api = {
    DIVISION: DIVISION, TENT_STATES: TENT_STATES,
    normalizeEvent: normalizeEvent, hasTeam: hasTeam,
    playsFromSummary: playsFromSummary, injuryPlays: injuryPlays,
    injuriesFromSummary: injuriesFromSummary, nextTent: nextTent, sortGames: sortGames,
    divisionStandings: divisionStandings, leagueStandings: leagueStandings,
    teamStats: teamStats, statComparison: statComparison, playerLeaders: playerLeaders,
    scoringFromSummary: scoringFromSummary, gameExtras: gameExtras
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Lib = api;
})(typeof self !== 'undefined' ? self : this);
