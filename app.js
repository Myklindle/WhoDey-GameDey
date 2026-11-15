(function () {
  'use strict';
  var L = window.Lib;
  var API = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
  var STANDINGS = 'https://site.api.espn.com/apis/v2/sports/football/nfl/standings';
  var MY = 'CIN';
  var POLL_MS = 20000;
  var app = document.getElementById('app');

  var state = {
    screen: 'home',
    events: [],
    week: 0,
    updated: null,
    error: '',
    summary: null,
    summaryError: '',
    standings: [],
    showLeague: false,
    liveOnly: false
  };

  // ---------- small helpers ----------
  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function button(key, label, onclick, cls) {
    var b = h('button', cls || 'button', label);
    b.type = 'button';
    b.dataset.key = key;
    b.addEventListener('click', onclick);
    return b;
  }
  function fetchJSON(url) {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, 10000);
    return fetch(url, { signal: ctl.signal, cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .finally(function () { clearTimeout(timer); });
  }
  function timeText(d) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  function kickoff(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + timeText(d);
  }

  // ---------- data ----------
  function normalizedEvents() {
    return state.events.map(L.normalizeEvent).filter(Boolean);
  }
  function myGame() {
    return normalizedEvents().filter(function (e) { return L.hasTeam(e, MY); })[0] || null;
  }
  function loadScoreboard() {
    return fetchJSON(API + '/scoreboard')
      .then(function (d) {
        state.events = d.events || [];
        state.week = d.week && d.week.number || 0;
        state.updated = new Date();
        state.error = '';
      })
      .catch(function (e) { state.error = 'No connection (' + e.message + ')'; });
  }
  function loadSummary() {
    var g = myGame();
    if (!g) return Promise.resolve();
    return fetchJSON(API + '/summary?event=' + encodeURIComponent(g.id))
      .then(function (d) { state.summary = d; state.summaryError = ''; })
      .catch(function (e) { state.summaryError = 'Could not load (' + e.message + ')'; });
  }
  function loadStandings() {
    return fetchJSON(STANDINGS)
      .then(function (d) { state.standings = L.divisionStandings(d); })
      .catch(function () { /* standings are optional */ });
  }
  function refresh() {
    var jobs = [loadScoreboard()];
    if (state.screen === 'injuries' || state.screen === 'plays' || state.screen === 'game') jobs.push(loadSummary());
    if (state.screen === 'division') jobs.push(loadStandings());
    return Promise.all(jobs).then(render);
  }

  // ---------- tent notes (stored on the glasses) ----------
  function tentKey(id) { return 'tent:' + id; }
  function readTent(id) {
    try { return JSON.parse(localStorage.getItem(tentKey(id))) || {}; } catch (e) { return {}; }
  }
  function writeTent(id, obj) {
    try { localStorage.setItem(tentKey(id), JSON.stringify(obj)); } catch (e) { /* storage unavailable */ }
  }

  // ---------- navigation ----------
  function go(screen) {
    history.pushState({ s: screen }, '');
    state.screen = screen;
    render();
    refresh();
  }
  window.addEventListener('popstate', function (ev) {
    state.screen = (ev.state && ev.state.s) || 'home';
    render();
    refresh();
  });
  function backButton() {
    return button('back', 'Back', function () { history.back(); });
  }

  // ---------- rendering ----------
  function scoreLine(g) {
    var wrap = h('div', 'scoreboard');
    [g.away, g.home].forEach(function (t) {
      var row = h('div', 'score-row' + (t.abbr === MY ? ' mine' : ''));
      row.appendChild(h('span', 'poss', g.state === 'in' && g.possession === t.id ? '\u25B6' : ''));
      row.appendChild(h('span', 'abbr', t.abbr));
      row.appendChild(h('span', 'rec', t.record));
      row.appendChild(h('span', 'pts', g.state === 'pre' ? '' : t.score));
      wrap.appendChild(row);
    });
    return wrap;
  }
  function gameStatus(g) {
    if (g.state === 'pre') return kickoff(g.date) + (g.network ? '  ' + g.network : '');
    if (g.state === 'post') return g.detail || 'Final';
    return g.detail;
  }
  function homeSub(g) {
    if (!g) return state.error ? state.error : 'No game this week';
    if (g.state === 'pre') return g.away.abbr + ' @ ' + g.home.abbr + '  ' + kickoff(g.date);
    return g.away.abbr + ' ' + g.away.score + '  ' + g.home.abbr + ' ' + g.home.score + '  ' + g.detail;
  }
  function divisionGames() {
    return normalizedEvents().filter(function (e) {
      var n = L.DIVISION.filter(function (a) { return L.hasTeam(e, a); }).length;
      return n > 0;
    });
  }

  function renderHome(root) {
    var head = h('header', 'head');
    head.appendChild(h('h1', null, 'WhoDey GameDey'));
    head.appendChild(h('p', null, state.week ? 'Week ' + state.week : ''));
    root.appendChild(head);
    var g = myGame();
    var cards = h('div', 'cards');
    var c1 = button('c-game', '', function () { go('game'); }, 'card');
    c1.appendChild(h('span', 'card-name', 'My Game'));
    c1.appendChild(h('span', 'card-sub', homeSub(g)));
    var live = divisionGames().filter(function (e) { return e.state === 'in'; }).length;
    var c2 = button('c-div', '', function () { go('division'); }, 'card');
    c2.appendChild(h('span', 'card-name', 'AFC North'));
    c2.appendChild(h('span', 'card-sub', live ? live + ' live now' : 'Scores and standings'));
    var nLive = normalizedEvents().filter(function (e) { return e.state === 'in'; }).length;
    var c3 = button('c-scores', '', function () { go('scores'); }, 'card');
    c3.appendChild(h('span', 'card-name', 'NFL Scores'));
    c3.appendChild(h('span', 'card-sub', nLive ? nLive + ' live now' : 'All games this week'));
    cards.appendChild(c1);
    cards.appendChild(c2);
    cards.appendChild(c3);
    root.appendChild(cards);
    root.appendChild(h('p', 'status', state.error || (state.updated ? 'Updated ' + timeText(state.updated) : 'Loading\u2026')));
  }

  function renderGame(root) {
    var g = myGame();
    root.appendChild(h('h1', 'title', 'My Game'));
    if (!g) {
      root.appendChild(h('p', 'big', state.error || 'No Bengals game this week'));
      root.appendChild(backButton());
      return;
    }
    root.appendChild(scoreLine(g));
    root.appendChild(h('p', 'when', gameStatus(g)));
    if (g.state === 'in') {
      var sit = [g.down, g.redZone ? 'RED ZONE' : ''].filter(Boolean).join('  ');
      if (sit) root.appendChild(h('p', 'sit', sit));
      if (g.lastPlay) root.appendChild(h('p', 'last', g.lastPlay));
    }
    var inj = L.injuryPlays(L.playsFromSummary(state.summary));
    if (g.state === 'in' && inj.length) {
      var p = inj[inj.length - 1];
      root.appendChild(h('p', 'alert', 'Injury: ' + p.text));
    }
    var row = h('div', 'controls two');
    row.appendChild(button('injuries', 'Injuries', function () { go('injuries'); }));
    row.appendChild(button('plays', 'Plays', function () { go('plays'); }));
    root.appendChild(row);
    root.appendChild(backButton());
  }

  function renderInjuries(root) {
    var g = myGame();
    root.appendChild(h('h1', 'title', 'Injuries'));
    var list = h('div', 'list');
    var groups = L.injuriesFromSummary(state.summary);
    if (!g) {
      list.appendChild(h('p', 'big', 'No game this week'));
    } else if (!state.summary) {
      list.appendChild(h('p', 'big', state.summaryError || 'Loading\u2026'));
    } else if (!groups.length) {
      list.appendChild(h('p', 'big', 'No injuries reported'));
    } else {
      var tent = readTent(g.id);
      groups.sort(function (a) { return a.abbr === MY ? -1 : 1; });
      groups.forEach(function (grp) {
        list.appendChild(h('h2', 'group', grp.abbr));
        grp.players.forEach(function (pl) {
          var idx = tent[pl.id] || 0;
          var b = button('p' + pl.id, '', function () {
            tent[pl.id] = L.nextTent(tent[pl.id] || 0);
            writeTent(g.id, tent);
            render();
          }, 'row');
          b.appendChild(h('span', 'row-main', (pl.jersey ? '#' + pl.jersey + ' ' : '') + pl.name + ' ' + pl.pos));
          b.appendChild(h('span', 'row-status s-' + pl.status.toLowerCase().replace(/\W+/g, ''), pl.status));
          if (pl.detail) b.appendChild(h('span', 'row-sub', pl.detail));
          if (idx) b.appendChild(h('span', 'row-tent', 'Your note: ' + L.TENT_STATES[idx]));
          list.appendChild(b);
        });
      });
      list.appendChild(h('p', 'hint', 'Tap a player to note: in tent, out for game, back in.'));
    }
    root.appendChild(list);
    root.appendChild(backButton());
  }

  function renderPlays(root) {
    root.appendChild(h('h1', 'title', 'Latest plays'));
    var list = h('div', 'list');
    if (!state.summary) {
      list.appendChild(h('p', 'big', state.summaryError || 'Loading\u2026'));
    } else {
      var plays = L.playsFromSummary(state.summary).slice(-6).reverse();
      if (!plays.length) list.appendChild(h('p', 'big', 'No plays yet'));
      plays.forEach(function (p) {
        var item = h('div', 'play');
        item.appendChild(h('span', 'play-time', p.period ? 'Q' + p.period + ' ' + p.clock : ''));
        item.appendChild(h('span', 'play-text', p.text));
        list.appendChild(item);
      });
    }
    root.appendChild(list);
    root.appendChild(backButton());
  }

  function miniGame(g) {
    var d = h('div', 'mini' + (L.hasTeam(g, MY) ? ' mine' : ''));
    var top = h('div', 'mini-row');
    var left = g.away.abbr + ' ' + (g.state === 'pre' ? '' : g.away.score);
    var right = g.home.abbr + ' ' + (g.state === 'pre' ? '' : g.home.score);
    top.appendChild(h('span', null, left.trim()));
    top.appendChild(h('span', null, '@'));
    top.appendChild(h('span', null, right.trim()));
    d.appendChild(top);
    var sub = g.state === 'pre' ? kickoff(g.date) : g.detail;
    if (g.state === 'in') {
      var poss = g.possession === g.home.id ? g.home.abbr : g.possession === g.away.id ? g.away.abbr : '';
      var extra = [poss ? '\u25B6 ' + poss : '', g.down, g.redZone ? 'RED ZONE' : ''].filter(Boolean).join('  ');
      if (extra) sub += '  ' + extra;
    }
    d.appendChild(h('div', 'mini-sub' + (g.state === 'in' ? ' live' : ''), sub));
    return d;
  }

  function renderScores(root) {
    var all = L.sortGames(normalizedEvents(), MY);
    var live = all.filter(function (e) { return e.state === 'in'; });
    root.appendChild(h('h1', 'title', 'NFL scores' + (live.length ? '  \u2022  ' + live.length + ' live' : '')));
    var list = h('div', 'list');
    var games = state.liveOnly ? live : all;
    if (!games.length) list.appendChild(h('p', 'big', state.error || (state.liveOnly ? 'No live games' : 'No games this week')));
    games.forEach(function (g) { list.appendChild(miniGame(g)); });
    if (state.updated) list.appendChild(h('p', 'hint', 'Updated ' + timeText(state.updated)));
    root.appendChild(list);
    var row = h('div', 'controls two');
    row.appendChild(button('live-toggle', state.liveOnly ? 'All games' : 'Live only', function () {
      state.liveOnly = !state.liveOnly;
      render();
    }));
    row.appendChild(backButton());
    root.appendChild(row);
  }
  function renderDivision(root) {
    root.appendChild(h('h1', 'title', state.showLeague ? 'League scores' : 'AFC North'));
    var list = h('div', 'list');
    var games = state.showLeague ? normalizedEvents() : divisionGames();
    if (state.showLeague) {
      games.sort(function (a, b) {
        var da = L.DIVISION.some(function (x) { return L.hasTeam(a, x); }) ? 0 : 1;
        var db = L.DIVISION.some(function (x) { return L.hasTeam(b, x); }) ? 0 : 1;
        return da - db;
      });
    }
    if (!games.length) list.appendChild(h('p', 'big', state.error || 'No games this week'));
    games.forEach(function (g) { list.appendChild(miniGame(g)); });
    if (!state.showLeague && state.standings.length) {
      list.appendChild(h('h2', 'group', 'Standings'));
      state.standings.forEach(function (r) {
        var line = h('div', 'stand' + (r.abbr === MY ? ' mine' : ''));
        line.appendChild(h('span', null, r.abbr));
        line.appendChild(h('span', null, r.w + '-' + r.l + (r.t ? '-' + r.t : '')));
        list.appendChild(line);
      });
    }
    root.appendChild(list);
    var row = h('div', 'controls two');
    row.appendChild(button('toggle', state.showLeague ? 'AFC North' : 'All games', function () {
      state.showLeague = !state.showLeague;
      render();
    }));
    row.appendChild(backButton());
    root.appendChild(row);
  }

  var RENDERERS = { home: renderHome, game: renderGame, injuries: renderInjuries, plays: renderPlays, division: renderDivision, scores: renderScores };
  function render() {
    var active = document.activeElement;
    var key = active && active.dataset ? active.dataset.key : null;
    var scroller = app.querySelector('.list');
    var top = scroller ? scroller.scrollTop : 0;
    app.textContent = '';
    var root = h('section', 'screen');
    (RENDERERS[state.screen] || renderHome)(root);
    app.appendChild(root);
    var next = key ? app.querySelector('[data-key="' + key + '"]') : null;
    if (!next) next = app.querySelector('button');
    var s = app.querySelector('.list');
    if (s) s.scrollTop = top;
    if (next) next.focus({ preventScroll: true });
  }

  // ---------- start ----------
  history.replaceState({ s: 'home' }, '');
  render();
  refresh();
  setInterval(function () { if (!document.hidden) refresh(); }, POLL_MS);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
})();
