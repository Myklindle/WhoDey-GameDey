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
        winner: !!c.winner
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

  var api = {
    DIVISION: DIVISION, TENT_STATES: TENT_STATES,
    normalizeEvent: normalizeEvent, hasTeam: hasTeam,
    playsFromSummary: playsFromSummary, injuryPlays: injuryPlays,
    injuriesFromSummary: injuriesFromSummary, nextTent: nextTent,
    divisionStandings: divisionStandings
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Lib = api;
})(typeof self !== 'undefined' ? self : this);
