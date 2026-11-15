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
    league: [],
    standView: 'AFC',
    playerTeam: '',
    press: null,
    pressError: '',
    video: null,
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
      .then(function (d) { state.standings = L.divisionStandings(d); state.league = L.leagueStandings(d); })
      .catch(function () { /* standings are optional */ });
  }
  var SUMMARY_SCREENS = ['game', 'stats', 'players', 'scoring', 'injuries', 'plays'];
  function loadPress() {
    return fetchJSON('press.json')
      .then(function (d) { state.press = (d && d.items) || []; state.pressError = ''; })
      .catch(function (e) { state.pressError = 'Could not load (' + e.message + ')'; });
  }
  function refresh() {
    // A playing video lives in the page; re-rendering would restart it.
    if (state.screen === 'video') return Promise.resolve();
    var jobs = [loadScoreboard()];
    if (SUMMARY_SCREENS.indexOf(state.screen) >= 0) jobs.push(loadSummary());
    if (state.screen === 'division' || state.screen === 'standings') jobs.push(loadStandings());
    if (state.screen === 'press') jobs.push(loadPress());
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
      row.appendChild(h('span', 'abbr t-' + t.abbr, t.abbr));
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
    c1.appendChild(h('span', 'card-name', 'Bengals Game Day'));
    c1.appendChild(h('span', 'card-sub', homeSub(g)));
    var live = divisionGames().filter(function (e) { return e.state === 'in'; }).length;
    var c2 = button('c-div', '', function () { go('division'); }, 'card');
    c2.appendChild(h('span', 'card-name', 'AFC North'));
    c2.appendChild(h('span', 'card-sub', live ? live + ' live now' : 'Scores and standings'));
    var nLive = normalizedEvents().filter(function (e) { return e.state === 'in'; }).length;
    var c3 = button('c-scores', '', function () { go('scores'); }, 'card');
    c3.appendChild(h('span', 'card-name', 'NFL Scores and Standings'));
    c3.appendChild(h('span', 'card-sub', nLive ? nLive + ' live now' : 'All games this week'));
    cards.appendChild(c1);
    cards.appendChild(c2);
    cards.appendChild(c3);
    root.appendChild(cards);
    root.appendChild(h('p', 'status', state.error || (state.updated ? 'Updated ' + timeText(state.updated) : 'Loading\u2026')));
  }

  function teamSpan(t, text) {
    return h('span', 't-' + t.abbr, text == null ? t.abbr : text);
  }
  function lineScore(g) {
    var n = Math.max(4, g.away.lines.length, g.home.lines.length);
    var tbl = h('div', 'linescore');
    tbl.style.gridTemplateColumns = '3.2rem repeat(' + (n + 1) + ', 1fr)';
    tbl.appendChild(h('span', 'ls-h', ''));
    for (var i = 0; i < n; i++) tbl.appendChild(h('span', 'ls-h', i < 4 ? String(i + 1) : 'OT'));
    tbl.appendChild(h('span', 'ls-h', 'T'));
    [g.away, g.home].forEach(function (t) {
      tbl.appendChild(teamSpan(t));
      for (var k = 0; k < n; k++) tbl.appendChild(h('span', null, t.lines[k] != null ? t.lines[k] : '-'));
      tbl.appendChild(h('span', 'ls-t', t.score));
    });
    return tbl;
  }
  function renderGame(root) {
    var g = myGame();
    var titleRow = h('div', 'title-row');
    titleRow.appendChild(h('h1', 'title', 'Bengals Game Day'));
    titleRow.appendChild(button('back', 'Back', function () { history.back(); }, 'button small'));
    root.appendChild(titleRow);
    if (!g) {
      root.appendChild(h('p', 'big', state.error || 'No Bengals game this week'));
      root.appendChild(backButton());
      return;
    }
    var info = h('div', 'list');
    info.appendChild(scoreLine(g));
    var sit = g.state === 'in' ? [g.down, g.redZone ? 'RED ZONE' : ''].filter(Boolean).join('  ') : '';
    info.appendChild(h('p', 'when', gameStatus(g) + (sit ? '   ' + sit : '')));
    var ex = L.gameExtras(state.summary);
    if (g.state === 'pre') {
      var bits = [ex.line ? 'Line ' + ex.line : '', ex.overUnder ? 'O/U ' + ex.overUnder : ''].filter(Boolean).join('   ');
      if (bits) info.appendChild(h('p', 'sit', bits));
      var where = [ex.venue, ex.temp ? ex.temp + '\u00B0F' : ''].filter(Boolean).join('   ');
      if (where) info.appendChild(h('p', 'last', where));
    }
    var inj = L.injuryPlays(L.playsFromSummary(state.summary));
    if (g.state === 'in' && inj.length) {
      info.appendChild(h('p', 'alert', (function (n) { return (/^Update:/.test(n) ? 'Injury ' : 'Injury: ') + n; })(L.injuryNote(inj[inj.length - 1].text))));
    }
    if (g.state !== 'pre') info.appendChild(lineScore(g));
    if (g.state === 'in' && g.lastPlay) info.appendChild(h('p', 'last', g.lastPlay));
    var sc = L.scoringFromSummary(state.summary);
    if (g.state !== 'pre' && sc.length) {
      var lp = sc[sc.length - 1];
      info.appendChild(h('p', 'last', 'Last score: ' + lp.abbr + ' ' + lp.type + ' Q' + lp.period + ' ' + lp.clock));
    }
    root.appendChild(info);
    var row = h('div', 'controls three');
    row.appendChild(button('stats', 'Stats', function () { go('stats'); }));
    row.appendChild(button('players', 'Players', function () { go('players'); }));
    row.appendChild(button('scoring', 'Scoring', function () { go('scoring'); }));
    row.appendChild(button('injuries', 'Injuries', function () { go('injuries'); }));
    row.appendChild(button('plays', 'Plays', function () { go('plays'); }));
    row.appendChild(button('press', 'Press', function () { go('press'); }));
    root.appendChild(row);
  }
  function renderStats(root) {
    var g = myGame();
    root.appendChild(h('h1', 'title', 'Team stats'));
    var list = h('div', 'list');
    if (!g) {
      list.appendChild(h('p', 'big', 'No game this week'));
    } else if (!state.summary) {
      list.appendChild(h('p', 'big', state.summaryError || 'Loading\u2026'));
    } else {
      var cmp = L.statComparison(state.summary, g.away.abbr, g.home.abbr);
      var head = h('div', 'cmp cmp-head');
      head.appendChild(teamSpan(g.away));
      head.appendChild(h('span', 'cmp-label', cmp.mode === 'season' ? 'Season avg' : ''));
      head.appendChild(teamSpan(g.home));
      list.appendChild(head);
      if (!cmp.rows.length) list.appendChild(h('p', 'big', 'No stats yet'));
      cmp.rows.forEach(function (r) {
        var d = h('div', 'cmp');
        d.appendChild(h('span', 'cmp-val', r.away));
        d.appendChild(h('span', 'cmp-label', r.label));
        d.appendChild(h('span', 'cmp-val', r.home));
        list.appendChild(d);
      });
    }
    root.appendChild(list);
    root.appendChild(backButton());
  }
  function renderPlayers(root) {
    var g = myGame();
    root.appendChild(h('h1', 'title', 'Players'));
    var list = h('div', 'list');
    var teams = L.playerLeaders(state.summary);
    var other = g ? (g.home.abbr === MY ? g.away.abbr : g.home.abbr) : '';
    var which = state.playerTeam || MY;
    var tm = teams.filter(function (t) { return t.abbr === which; })[0];
    if (!g) {
      list.appendChild(h('p', 'big', 'No game this week'));
    } else if (!state.summary) {
      list.appendChild(h('p', 'big', state.summaryError || 'Loading\u2026'));
    } else if (!tm || !tm.lines.length) {
      list.appendChild(h('p', 'big', 'Player stats start at kickoff'));
    } else {
      list.appendChild(h('h2', 'group' + (which === MY ? '' : ' other'), which));
      tm.lines.forEach(function (ln) {
        var d = h('div', 'play');
        var hd = h('div', 'pl-head');
        hd.appendChild(h('span', 'play-time', ln.pos));
        hd.appendChild(h('span', 'play-name', ln.name));
        d.appendChild(hd);
        d.appendChild(h('span', 'play-text', ln.text));
        list.appendChild(d);
      });
    }
    root.appendChild(list);
    var row = h('div', 'controls two');
    if (other) {
      var next = which === MY ? other : MY;
      row.appendChild(button('player-team', next, function () { state.playerTeam = next; render(); }));
    }
    row.appendChild(backButton());
    root.appendChild(row);
  }
  function renderScoring(root) {
    root.appendChild(h('h1', 'title', 'Scoring'));
    var list = h('div', 'list');
    var gm = myGame();
    var plays = L.scoringFromSummary(state.summary).slice().reverse();
    if (!state.summary) {
      list.appendChild(h('p', 'big', state.summaryError || 'Loading\u2026'));
    } else if (!plays.length) {
      list.appendChild(h('p', 'big', 'No scoring yet'));
    } else {
      plays.forEach(function (p) {
        var d = h('div', 'play');
        var top = h('span', 'play-time t-' + p.abbr, p.abbr + ' ' + p.type + '  Q' + p.period + ' ' + p.clock);
        d.appendChild(top);
        d.appendChild(h('span', 'play-text', p.text));
        d.appendChild(h('span', 'play-time', (gm ? gm.away.abbr + ' ' + p.away + '   ' + gm.home.abbr + ' ' + p.home : p.away + ' - ' + p.home)));
        list.appendChild(d);
      });
    }
    root.appendChild(list);
    root.appendChild(backButton());
  }
  function renderPress(root) {
    root.appendChild(h('h1', 'title', 'Press & highlights'));
    var list = h('div', 'list');
    if (!state.press) {
      list.appendChild(h('p', 'big', state.pressError || 'Loading\u2026'));
    } else if (!state.press.length) {
      list.appendChild(h('p', 'big', 'Nothing posted yet'));
    } else {
      state.press.forEach(function (it) {
        var b = button('v-' + it.videoId, '', function () {
          state.video = it;
          go('video');
        }, 'row');
        b.appendChild(h('span', 'row-sub', it.kind === 'highlights' ? 'HIGHLIGHTS' : 'PRESS CONFERENCE'));
        b.appendChild(h('span', 'row-main', it.title.replace(/\s*\|.*$/, '')));
        list.appendChild(b);
      });
    }
    root.appendChild(list);
    root.appendChild(backButton());
  }
  // ---------- video player (YouTube) ----------
  var player = null, playerToken = 0, apiPromise = null, toggleBtn = null, statusEl = null;
  function setVideoStatus(msg) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.hidden = !msg;
  }
  function loadYT() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (apiPromise) return apiPromise;
    apiPromise = new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { apiPromise = null; reject(new Error('timeout')); }, 8000);
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        clearTimeout(timer);
        if (typeof prev === 'function') prev();
        resolve();
      };
      var sc = document.createElement('script');
      sc.src = 'https://www.youtube.com/iframe_api';
      sc.async = true;
      sc.onerror = function () { clearTimeout(timer); apiPromise = null; reject(new Error('load failed')); };
      document.head.appendChild(sc);
    });
    return apiPromise;
  }
  function startPlayer() {
    if (!state.video) return;
    var token = ++playerToken;
    var id = state.video.videoId;
    loadYT().then(function () {
      if (token !== playerToken || !document.getElementById('yt')) return;
      var vars = { autoplay: 1, playsinline: 1, rel: 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, modestbranding: 1 };
      if (/^https?:$/.test(location.protocol)) vars.origin = location.origin;
      document.getElementById('player-mount').classList.add('api');
      player = new YT.Player('yt', {
        width: '100%', height: '100%', videoId: id, playerVars: vars,
        events: {
          onReady: function () {
            if (token !== playerToken) return;
            try { player.getIframe().tabIndex = -1; } catch (e) { /* ignore */ }
            setVideoStatus('');
            player.playVideo();
          },
          onStateChange: function (e) {
            if (token !== playerToken || !toggleBtn) return;
            toggleBtn.textContent = (e.data === 1 || e.data === 3) ? 'Pause' : 'Play';
            if (e.data === 1 || e.data === 3) setVideoStatus('');
          },
          onError: function (e) { if (token === playerToken) setVideoStatus("Can't play this video here (error " + e.data + ")."); }
        }
      });
    }).catch(function () {
      if (token !== playerToken) return;
      var mount = document.getElementById('player-mount');
      if (!mount) return;
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube.com/embed/' + encodeURIComponent(id) + '?autoplay=1&playsinline=1&rel=0';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.title = state.video.title;
      mount.replaceChildren(f);
      var c = document.querySelector('.player-controls');
      if (c) c.hidden = true;
      setVideoStatus('Basic player (YouTube API unavailable).');
    });
  }
  function stopPlayer() {
    playerToken++;
    try { if (player && player.destroy) player.destroy(); } catch (e) { /* ignore */ }
    player = null;
    toggleBtn = null;
    statusEl = null;
  }
  function seekBy(delta) {
    if (!player || typeof player.getCurrentTime !== 'function') return;
    var t = player.getCurrentTime() + delta;
    var dur = player.getDuration();
    if (dur) t = Math.min(t, dur - 1);
    player.seekTo(Math.max(0, t), true);
  }
  function renderVideo(root) {
    root.appendChild(h('h1', 'title', state.video ? state.video.title.replace(/\s*\|.*$/, '') : 'Video'));
    var mount = h('div', 'video');
    mount.id = 'player-mount';
    var holder = h('div');
    holder.id = 'yt';
    mount.appendChild(holder);
    root.appendChild(mount);
    statusEl = h('p', 'status', 'Loading\u2026');
    root.appendChild(statusEl);
    var row = h('div', 'controls four player-controls');
    row.appendChild(button('v-back', '\u221215s', function () { seekBy(-15); }));
    toggleBtn = button('v-toggle', 'Pause', function () {
      if (!player || typeof player.getPlayerState !== 'function') return;
      var st = player.getPlayerState();
      if (st === 1 || st === 3) player.pauseVideo(); else player.playVideo();
    });
    row.appendChild(toggleBtn);
    row.appendChild(button('v-fwd', '+30s', function () { seekBy(30); }));
    row.appendChild(backButton());
    root.appendChild(row);
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
    function side(t) {
      var sp = h('span', 't-' + t.abbr);
      sp.textContent = (t.abbr + ' ' + (g.state === 'pre' ? '' : t.score)).trim();
      return sp;
    }
    top.appendChild(side(g.away));
    top.appendChild(h('span', null, '@'));
    top.appendChild(side(g.home));
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
    var row = h('div', 'controls three');
    row.appendChild(button('live-toggle', state.liveOnly ? 'All games' : 'Live only', function () {
      state.liveOnly = !state.liveOnly;
      render();
    }));
    row.appendChild(button('to-standings', 'Standings', function () { go('standings'); }));
    row.appendChild(backButton());
    root.appendChild(row);
  }
  var STAND_VIEWS = ['AFC', 'NFC', 'NFL'];
  function renderStandings(root) {
    var v = state.standView;
    root.appendChild(h('h1', 'title', v === 'NFL' ? 'League standings' : v + ' standings'));
    var list = h('div', 'list');
    var rows = state.league.filter(function (r) { return v === 'NFL' || r.conf === v; });
    if (!rows.length) {
      list.appendChild(h('p', 'big', state.error || 'Loading\u2026'));
    } else {
      var grid = h('div', 'standings');
      rows.forEach(function (r, i) {
        var cell = h('div', 'stand t-' + r.abbr);
        cell.appendChild(h('span', null, (i + 1) + ' ' + r.abbr));
        cell.appendChild(h('span', null, r.w + '-' + r.l + (r.t ? '-' + r.t : '')));
        grid.appendChild(cell);
      });
      list.appendChild(grid);
    }
    root.appendChild(list);
    var row = h('div', 'controls two');
    var next = STAND_VIEWS[(STAND_VIEWS.indexOf(v) + 1) % STAND_VIEWS.length];
    row.appendChild(button('stand-toggle', next, function () { state.standView = next; render(); }));
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
    if (!state.showLeague && state.standings.length) {
      var grid = h('div', 'standings');
      state.standings.forEach(function (r) {
        var cell = h('div', 'stand t-' + r.abbr);
        cell.appendChild(h('span', null, r.abbr));
        cell.appendChild(h('span', null, r.w + '-' + r.l + (r.t ? '-' + r.t : '')));
        grid.appendChild(cell);
      });
      list.appendChild(grid);
    }
    if (!games.length) list.appendChild(h('p', 'big', state.error || 'No games this week'));
    games.forEach(function (g) { list.appendChild(miniGame(g)); });
    root.appendChild(list);
    var row = h('div', 'controls two');
    row.appendChild(button('toggle', state.showLeague ? 'AFC North' : 'All games', function () {
      state.showLeague = !state.showLeague;
      render();
    }));
    row.appendChild(backButton());
    root.appendChild(row);
  }

  var RENDERERS = { home: renderHome, game: renderGame, injuries: renderInjuries, plays: renderPlays, division: renderDivision, scores: renderScores, standings: renderStandings, stats: renderStats, players: renderPlayers, scoring: renderScoring, press: renderPress, video: renderVideo };
  function render() {
    var active = document.activeElement;
    var key = active && active.dataset ? active.dataset.key : null;
    var scroller = app.querySelector('.list');
    var top = scroller ? scroller.scrollTop : 0;
    app.textContent = '';
    var root = h('section', 'screen');
    (RENDERERS[state.screen] || renderHome)(root);
    if (state.screen !== 'video') stopPlayer();
    app.appendChild(root);
    if (state.screen === 'video') startPlayer();
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
