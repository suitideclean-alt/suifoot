/* SuiFoot game flow: setup, calendar, league + cup, weekly economy, season rollover,
 * player evolution. Human-facing actions live in actions.js. */
(function () {
  const SF = globalThis.SF;
  const { R, CFG, util } = SF;
  const B = SF.Bank, W = SF.World, E = SF.Econ;

  const FORMS = { '4-4-2': [4, 4, 2], '4-3-3': [4, 3, 3], '3-5-2': [3, 5, 2], '5-3-2': [5, 3, 2], '4-5-1': [4, 5, 1], '3-4-3': [3, 4, 3] };
  const CUP_KEYS = ['cup_pre', 'cup_r64', 'cup_r32', 'cup_r16', 'cup_qf', 'cup_sf', 'cup_f'];
  const Game = (SF.Game = { FORMS, CUP_KEYS });

  // ---------- helpers ----------
  Game.news = function (G, k, p, c) {
    G.news.push({ s: G.season, w: G.week, k, p: p || {}, c: c || 0 });
    if (G.news.length > 220) G.news.splice(0, G.news.length - 220);
  };
  Game.humanOf = function (G, clubId) { return G.coaches.find((c) => c.club === clubId) || null; };
  Game.players = (G, club) => club.squad.map((id) => G.players[id]);
  Game.income = function (G, cid, amt, kind, memo) {
    const c = G.clubs[cid];
    if (c.foreign) return 0;
    const a = B.credit(G, cid, amt, kind, memo);
    c.rev += a;
    return a;
  };
  Game.strength = (G, club) => E.strength(G, club);
  Game.level = (xp) => SF.Q.isqrt(Math.max(0, xp) / 60) + 1;
  Game.freePoints = (c) => Game.level(c.xp) - 1 - (c.sk.train + c.sk.tact + c.sk.neg + c.sk.youth);
  Game.repStrength = (rep) => 46 + rep * 0.3;
  Game.repTier = (rep) => (rep < 20 ? 0 : rep < 40 ? 1 : rep < 60 ? 2 : rep < 80 ? 3 : 4);
  Game.repSponsor = (rep) => util.clamp(1 + 0.0015 * (rep - 20), 0.97, 1.12); // sponsors like famous coaches
  Game.addRep = function (G, co, d, k, x) {
    d = Math.round(d * 100) / 100;
    if (!d) return;
    co.rep = util.clamp(co.rep + d, 0, 100);
    co.replog = co.replog || [];
    const e = co.replog.find((r) => r.s === G.season && r.k === k && (!x || r.x === x));
    if (e) e.d = Math.round((e.d + d) * 100) / 100;
    else co.replog.push({ s: G.season, k, d, x: x || '' });
    if (co.replog.length > 60) co.replog.splice(0, co.replog.length - 60);
  };

  function makeCoach(G, name, id) {
    return {
      id, name, club: null, rep: 20, xp: 0, board: 60, jobWeeks: 0, unemp: 0, sk: { train: 0, tact: 0, neg: 0, youth: 0 },
      lineup: { auto: true, form: '4-4-2', tactic: 'bal', xi: [], bench: [] }, offers: [], hist: [], trophies: [], sacked: 0, nextOffer: 1, vac: 0, vacReport: null, replog: [], goals: [], ach: {}, watch: [], gems: [], scouted: 0, gdone: 0, wstreak: 0,
    };
  }

  // ---------- new game ----------
  Game.newGame = function (o) {
    o = o || {};
    const seed = (o.seed != null ? o.seed : 1) >>> 0;
    const G = { v: SF.VERSION, fmt: 2, seed, rs: seed, season: 1, week: 1, phase: 'play', news: [], coaches: [], offers: [], hall: [], nextOffer: 1, lang: o.lang || 'en', wk: null };
    SF.setG(G);
    W.generate(G);
    G.free = G.free || [];
    const taken = new Set();
    const specs = o.coaches && o.coaches.length ? o.coaches : [{ name: 'Coach', clubId: null }];
    specs.forEach((sp, i) => {
      const c = makeCoach(G, sp.name || 'Coach ' + (i + 1), i + 1);
      let cid = sp.clubId && !taken.has(sp.clubId) ? sp.clubId : null;
      if (!cid) { const pool = G.clubIds.filter((x) => !taken.has(x) && G.clubs[x].div === 3); cid = R.pick(pool); }
      taken.add(cid);
      c.club = cid;
      const club = G.clubs[cid];
      club.human = c.id;
      G.bank.tracked[cid] = 1;
      c.rep = util.clamp(Math.round((E.strength(G, club) - 46) / 0.3 - 4), 8, 95);
      c.role = sp.role === 'both' || sp.role === 'owner' ? sp.role : 'coach';
      club.owner = c.role === 'coach' ? 0 : c.id;
      if (c.role === 'coach') c.contract = SF.Owner.newContract(club, c.rep);
      SF.Owner.openWallet(G, c.id);
      if (c.role !== 'coach') SF.Bank.credit(G, SF.Owner.wallet(c.id), 500000, 'bailout');
      G.coaches.push(c);
    });
    if (o.bonus && G.coaches[0]) { G.coaches[0].rep = Math.min(100, G.coaches[0].rep + (o.bonus.rep || 0)); G.coaches[0].xp += o.bonus.xp || 0; }
    Game.startSeason(G);
    SF.Owner.initNpcCoaches(G);
    SF.Owner.seasonStart(G);
    if (SF.Boss) SF.Boss.seasonStart(G);
    SF.Body.seasonReset(G);
    for (const c of G.coaches) if (c.role === 'owner') SF.Owner.autoHire(G, c);
    for (const c of G.coaches) Game.news(G, 'n_welcome', { club: G.clubs[c.club].name }, c.id);
    return G;
  };

  // Save checksum (cyrb53). It only DETECTS hand-edited or corrupted saves so the game can mark them unverified; a determined player can
  // strip it, so it is not security. Real protection is that the online mode keeps the authoritative state on the server / chain.
  const sum53 = (s) => {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  };
  Game.serialize = (G) => {
    delete G.chk;
    const chk = sum53(JSON.stringify(G));
    return JSON.stringify(Object.assign({}, G, { chk }));
  };
  Game.deserialize = function (s) {
    const G = JSON.parse(s);
    if (G.fmt !== 2) { const e = new Error('old league format'); e.old = true; throw e; } // saves from before v0.9 have 12 clubs per division
    const chk = G.chk; delete G.chk;
    if (chk !== undefined && sum53(JSON.stringify(G)) !== chk) G.unverified = 1; // edited by hand or corrupted: stays flagged for good
    SF.setG(G);
    Game.migrate(G);
    return G;
  };
  // saves from v0.1 get the foreign clubs; the European cup is played from the next season on
  Game.migrate = function (G) {
    if (!G.euIds) {
      G.euIds = [];
      let idx = 200;
      for (let i = 0; i < CFG.EU_FOREIGN; i++) G.euIds.push(W.makeForeign(G, idx++, i % CFG.euNat.length).id);
      delete G._usedNames;
    }
    for (const id of G.clubIds.concat(G.euIds)) { const c = G.clubs[id]; if (!c.style) c.style = R.weighted(['att', 'bal', 'def'], (x) => ({ att: 3, bal: 4, def: 3 }[x])); if (c.acad === undefined) c.acad = []; if (c.rival === undefined) c.rival = null; }
    if (!G.eu) { G.eu = null; if (G.divs) setupEuro(G, true); G.eu.idle = 1; }
    if (!G.tq) G.tq = [];
    if (G.divs) { SF.Extras.pairRivals(G); for (const co of G.coaches) { co.goals = co.goals || []; co.ach = co.ach || {}; co.watch = co.watch || []; if (co.club) { SF.Extras.fillGoals(G, co); SF.Extras.autoCaptain(G, G.clubs[co.club]); } } }
    SF.Owner.initNpcCoaches(G);
    if (SF.Boss) SF.Boss.migrate(G);
    return G;
  };

  // ---------- fixtures ----------
  function roundRobin(ids) {
    const n = ids.length;
    const arr = R.shuffle(ids.slice());
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) {
        const a = arr[i], b = arr[n - 1 - i];
        pairs.push((r + i) % 2 === 0 ? [a, b] : [b, a]);
      }
      rounds.push(pairs);
      arr.splice(1, 0, arr.pop());
    }
    const second = rounds.map((rd) => rd.map(([a, b]) => [b, a]));
    return rounds.concat(R.shuffle(second));
  }

  Game.startSeason = function (G) {
    G.divs = [];
    for (let d = 0; d < CFG.DIVS; d++) G.divs.push(G.clubIds.filter((id) => G.clubs[id].div === d));
    G.table = {}; G.res = [];
    G.bank.sf = {};
    for (const id of G.clubIds) {
      const c = G.clubs[id];
      G.table[id] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
      c.rev = 0; c.form = []; c.cupRound = 0; c.nextDiv = c.div; c.dropped = 0;
    }
    for (const pid in G.players) { const p = G.players[pid]; p.g = 0; p.gl = 0; p.ap = 0; }
    const rr = G.divs.map((ids) => roundRobin(ids));
    G.sched = [];
    let md = 0, cup = 0;
    for (let m = 1; m <= CFG.LEAGUE_WEEKS; m++) {
      const fx = {};
      rr.forEach((rounds, d) => { fx[d] = rounds[m - 1]; });
      G.sched.push({ t: 'L', md: m, fx });
      if (CFG.CUP_AFTER.includes(m)) G.sched.push({ t: 'C', r: cup++ });
      const ei = CFG.EU_AFTER.indexOf(m);
      if (ei >= 0) G.sched.push({ t: 'E', s: ei });
    }
    G.cup = { alive: G.clubIds.slice(), round: 0, drawn: -1, matches: [], byes: [], winner: null, finalist: null, hist: [] };
    for (let d = 0; d < CFG.DIVS; d++) {
      const sorted = G.divs[d].slice().sort((a, b) => E.strength(G, G.clubs[b]) - E.strength(G, G.clubs[a]));
      sorted.forEach((id, i) => { G.clubs[id].target = i + 1; });
    }
    G.week = 1; G.phase = 'play'; G.wk = null; G.summary = null;
    setupEuro(G);
    for (const c of G.coaches) { c.startRep = c.rep; }
    SF.Extras.pairRivals(G);
    for (const co of G.coaches) { co.goals = []; co.wstreak = 0; if (co.club) { SF.Extras.fillGoals(G, co); SF.Extras.autoCaptain(G, G.clubs[co.club]); } }
  };

  // ---------- european cup: 4 domestic qualifiers + 12 foreign clubs, 4 groups of 4, then QF / SF / final ----------
  function setupEuro(G, silent) {
    let q = (G.euroQ || []).filter((id) => G.clubs[id]);
    if (q.length < CFG.EU_SLOTS) q = G.divs[0].slice().sort((a, b) => E.strength(G, G.clubs[b]) - E.strength(G, G.clubs[a])).slice(0, CFG.EU_SLOTS);
    const teams = R.shuffle(q.concat(G.euIds));
    const groups = [];
    for (let g = 0; g < 4; g++) groups.push(teams.slice(g * 4, g * 4 + 4));
    const rr = groups.map((ids) => roundRobin(ids));
    const fix = [];
    for (let md = 0; md < 6; md++) fix.push([].concat(...rr.map((r) => r[md])));
    const tab = {};
    for (const id of teams) tab[id] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
    G.eu = { q, groups, fix, tab, ko: { ms: [], alive: [] }, hist: [], winner: null, finalist: null, paid: {}, reach: {} };
    for (const id of teams) G.eu.reach[id] = 0;
    if (!silent) for (const id of q) payEu(G, id, CFG.euPartic);
  }
  function payEu(G, id, amt) {
    const c = G.clubs[id];
    if (!c || c.foreign) return;
    Game.income(G, id, amt, 'prize');
    G.eu.paid[id] = (G.eu.paid[id] || 0) + Math.round(amt);
  }
  Game.euStandings = function (G, gi) {
    const t = G.eu.tab;
    return G.eu.groups[gi].slice().sort((a, b) => t[b].pts - t[a].pts || (t[b].gf - t[b].ga) - (t[a].gf - t[a].ga) || t[b].gf - t[a].gf || (a < b ? -1 : 1));
  };
  function euFixtures(G, s) {
    const eu = G.eu;
    if (s < 6) return eu.fix[s];
    const idx = s - 6;
    if (!eu.ko.ms[idx]) {
      if (idx === 0) {
        const st = [0, 1, 2, 3].map((g) => Game.euStandings(G, g));
        eu.ko.ms[0] = [[st[0][0], st[1][1]], [st[1][0], st[0][1]], [st[2][0], st[3][1]], [st[3][0], st[2][1]]];
      } else {
        const al = eu.ko.alive, ms = [];
        for (let i = 0; i + 1 < al.length; i += 2) ms.push([al[i], al[i + 1]]);
        eu.ko.ms[idx] = ms;
      }
    }
    return eu.ko.ms[idx];
  }
  Game.euFixtures = euFixtures;
  function advanceEuro(G, wk) {
    const eu = G.eu, s = wk.es;
    const winners = [];
    for (const m of wk.matches) {
      const r = m.res;
      if (s < 6) {
        const th = eu.tab[m.h], ta = eu.tab[m.a];
        th.p++; ta.p++; th.gf += r.hg; th.ga += r.ag; ta.gf += r.ag; ta.ga += r.hg;
        if (r.hg > r.ag) { th.w++; ta.l++; th.pts += 3; payEu(G, m.h, CFG.euWin); }
        else if (r.hg < r.ag) { ta.w++; th.l++; ta.pts += 3; payEu(G, m.a, CFG.euWin); }
        else { th.d++; ta.d++; th.pts++; ta.pts++; payEu(G, m.h, CFG.euDraw); payEu(G, m.a, CFG.euDraw); }
      } else {
        const hw = r.hg > r.ag || (r.hg === r.ag && r.p && r.p[0] > r.p[1]);
        const w = hw ? m.h : m.a, l = hw ? m.a : m.h;
        winners.push(w);
        eu.reach[w] = s - 6 + 2; // won QF -> reached SF (2), won SF -> final (3), won final -> champion (4)
        eu.reach[l] = Math.max(eu.reach[l], s - 6 + 1);
        payEu(G, w, [CFG.euSF, CFG.euFinal, CFG.euWinner][s - 6]);
        if (s === 8) { eu.winner = w; eu.finalist = l; payEu(G, l, CFG.euFinal * 0.5); }
      }
    }
    if (s < 6) {
      eu.hist.push({ s, ms: wk.matches.map((m) => ({ h: m.h, a: m.a, hg: m.res.hg, ag: m.res.ag })) });
      if (s === 5) for (let g = 0; g < 4; g++) for (const id of Game.euStandings(G, g).slice(0, 2)) { eu.reach[id] = 1; payEu(G, id, CFG.euQF); }
    } else {
      eu.hist.push({ s, ms: wk.matches.map((m) => ({ h: m.h, a: m.a, hg: m.res.hg, ag: m.res.ag, p: m.res.p })) });
      eu.ko.alive = winners;
    }
  }

  // ---------- lineups ----------
  function avail(G, club) { return club.squad.map((id) => G.players[id]).filter((p) => p.inj <= 0 && p.sus <= 0); }

  function pickXI(G, club, form) {
    const f = FORMS[form] || FORMS['4-4-2'];
    const av = avail(G, club).sort((a, b) => b.ovr - a.ovr);
    const xi = [];
    const isS = (p) => p.ovr >= CFG.starOvr;
    const stars = () => xi.filter(isS).length;
    // the auto-picker never fields more stars than the dressing room can handle
    const take = (pos, n) => { for (const p of av) { if (n <= 0) break; if (p.pos === pos && !xi.includes(p) && !(isS(p) && stars() >= CFG.starFree)) { xi.push(p); n--; } } };
    take('GK', 1); take('DF', f[0]); take('MF', f[1]); take('FW', f[2]);
    for (const p of av) { if (xi.length >= 11) break; if (!xi.includes(p) && p.pos !== 'GK' && !(isS(p) && stars() >= CFG.starFree)) xi.push(p); }
    for (const p of av) { if (xi.length >= 11) break; if (!xi.includes(p)) xi.push(p); }
    const rest = av.filter((p) => !xi.includes(p));
    const bench = [];
    const gk = rest.find((p) => p.pos === 'GK');
    if (gk) bench.push(gk);
    for (const p of rest) { if (bench.length >= 7) break; if (!bench.includes(p)) bench.push(p); }
    return { xi: xi.map((p) => p.id), bench: bench.map((p) => p.id) };
  }
  Game.pickXI = pickXI;

  function ensureSquad(G, club) {
    let guard = 0;
    while ((avail(G, club).length < 11 || club.squad.length < 14) && guard++ < 12) {
      const have = Game.players(G, club);
      const need = ['GK', 'DF', 'MF', 'FW'].find((pos) => have.filter((p) => p.pos === pos).length < (pos0(pos)));
      const pos = need || R.pick(['DF', 'MF', 'FW']);
      const p = W.newPlayer(G, { pos, ovr: 30 + R.int(0, 6), age: R.int(17, 19), club: club.id, ct: 1 });
      p.wage = 40;
      club.squad.push(p.id);
      if (club.human) Game.news(G, 'n_emergency', { name: p.n }, club.human);
    }
  }
  function pos0(pos) { return pos === 'GK' ? 2 : pos === 'DF' ? 5 : pos === 'MF' ? 5 : 3; }

  Game.specFor = function (G, clubId) {
    const club = G.clubs[clubId];
    ensureSquad(G, club);
    const coach = Game.humanOf(G, clubId);
    let xi, bench, tactic = 'bal', tb = 0;
    if (coach) {
      const L = coach.lineup;
      tactic = L.tactic; tb = coach.sk.tact;
      const auto = pickXI(G, club, L.form);
      if (L.auto || coach.vac > 0) { xi = auto.xi; bench = auto.bench; }
      else {
        const ok = (id) => { const p = G.players[id]; return p && p.club === clubId && p.inj <= 0 && p.sus <= 0; };
        xi = [...new Set(L.xi.filter(ok))].slice(0, 11);
        for (const id of auto.xi.concat(auto.bench)) { if (xi.length >= 11) break; if (!xi.includes(id)) xi.push(id); }
        bench = [...new Set(L.bench.filter(ok))].filter((id) => !xi.includes(id)).slice(0, 7);
        for (const id of auto.bench.concat(auto.xi)) { if (bench.length >= 7) break; if (!xi.includes(id) && !bench.includes(id)) bench.push(id); }
      }
    } else { ({ xi, bench } = pickXI(G, club, '4-4-2')); tactic = club.style || 'bal'; }
    return { club: clubId, xi, bench, tactic, tbonus: tb };
  };

  // ---------- cup ----------
  function drawCup(G) {
    const c = G.cup;
    if (c.drawn === c.round) return;
    const pool = R.shuffle(c.alive.slice());
    let playing = pool, byes = [];
    if (c.round === 0) { const p2 = (1 << SF.Q.ilog2(pool.length)), n = pool.length > p2 ? 2 * (pool.length - p2) : pool.length; playing = pool.slice(0, n); byes = pool.slice(n); }
    c.byes = byes; c.matches = [];
    for (let i = 0; i + 1 < playing.length; i += 2) c.matches.push({ h: playing[i], a: playing[i + 1] });
    c.drawn = c.round;
  }

  Game.drawCup = (G) => drawCup(G);
  function advanceCup(G, wk) {
    const c = G.cup;
    const winners = [];
    c.hist.push({ r: c.round, byes: c.byes.slice(), ms: wk.matches.map((m) => ({ h: m.h, a: m.a, hg: m.res.hg, ag: m.res.ag, p: m.res.p, et: m.res.et })) });
    for (const m of wk.matches) {
      const r = m.res;
      const hw = r.hg > r.ag || (r.hg === r.ag && r.p && r.p[0] > r.p[1]);
      const w = hw ? m.h : m.a, l = hw ? m.a : m.h;
      winners.push(w);
      G.clubs[w].cupRound = Math.max(G.clubs[w].cupRound, c.round + 1);
      G.clubs[l].cupRound = Math.max(G.clubs[l].cupRound, c.round);
      if (c.round === CFG.CUP_ROUNDS - 1) { c.winner = w; c.finalist = l; }
    }
    c.alive = c.byes.concat(winners);
    for (const b of c.byes) G.clubs[b].cupRound = Math.max(G.clubs[b].cupRound, c.round + 1);
    c.round++;
  }

  // ---------- week flow ----------
  Game.beginWeek = function (G) {
    const sw = G.sched[G.week - 1];
    const matches = [];
    let id = 0;
    for (const cid of G.clubIds.concat(G.euIds)) ensureSquad(G, G.clubs[cid]);
    if (sw.t === 'E') {
      for (const [h, a] of euFixtures(G, sw.s)) matches.push({ id: id++, k: 'E', s: sw.s, h, a, res: null });
    } else if (sw.t === 'L') {
      for (const d in sw.fx) for (const [h, a] of sw.fx[d]) matches.push({ id: id++, k: 'L', div: +d, h, a, res: null, derby: SF.Extras.isDerby(G, h, a) });
    } else {
      drawCup(G);
      for (const cm of G.cup.matches) matches.push({ id: id++, k: 'C', r: G.cup.round, h: cm.h, a: cm.a, res: null });
    }
    G.wk = { w: G.week, s: G.season, t: sw.t, md: sw.md || 0, r: sw.r != null ? sw.r : -1, es: sw.t === 'E' ? sw.s : -1, matches };
    return G.wk;
  };

  Game.buildMatch = function (G, m) {
    return new SF.Match(G, Game.specFor(G, m.h), Game.specFor(G, m.a), { knockout: m.k === 'C' || (m.k === 'E' && m.s >= 6), neutral: (m.k === 'C' && m.r === CFG.CUP_ROUNDS - 1) || (m.k === 'E' && m.s === 8), derby: !!m.derby });
  };

  Game.simMatch = function (G, m, mt) {
    if (!mt) mt = Game.buildMatch(G, m);
    mt.run();
    applyResult(G, m, mt);
    return m.res;
  };

  function attendance(club) {
    const f = club.form;
    const avgPts = f.length ? util.avg(f) : 1.3;
    const mood = 0.8 + 0.1 * avgPts;
    const priceF = SF.Q.pow(CFG.refPrice[club.div] / club.price, 1.1);
    return Math.min(club.cap, Math.round(club.fans * mood * priceF * (SF.Boss ? SF.Boss.attMult(club) : 1)));
  }
  Game.attendance = attendance;

  function applyResult(G, m, mt) {
    const s = mt.summary();
    const hc = G.clubs[m.h], ac = G.clubs[m.a];
    const nm = (id) => (G.players[id] ? G.players[id].n : '?');
    const ev = [], gc = {};
    for (const e of s.events) {
      const p = G.players[e.pid];
      if (!p) continue;
      if (e.t === 'goal') {
        p.g++; p.gt++; if (m.k === 'L') p.gl = (p.gl || 0) + 1;
        const gcl = G.clubs[p.club], gco = gcl && gcl.human ? Game.humanOf(G, gcl.id) : null;
        if (gco) {
          if (p.hg) SF.Extras.onHomegrownGoal(G, gco);
          gc[p.id] = (gc[p.id] || 0) + 1;
          if (gc[p.id] === 3) { SF.Extras.unlock(G, gco, 'a_hattrick'); Game.news(G, 'n_hattrick', { name: p.n }, gco.id); }
        }
        ev.push([e.min, 'g', e.side, p.n, e.pid2 ? nm(e.pid2) : '']); }
      else if (e.t === 'yellow') {
        p.yc++;
        if (p.yc >= 5) { p.yc = 0; p.sus = Math.max(p.sus, 1); p._f = 1; if (G.clubs[p.club] && G.clubs[p.club].human) Game.news(G, 'n_suspended', { name: p.n }, G.clubs[p.club].human); }
      } else if (e.t === 'red') {
        p.sus = Math.max(p.sus, e.second ? 1 : 2); p._f = 1; p.yc = 0;
        ev.push([e.min, 'r', e.side, p.n, '']);
        if (G.clubs[p.club] && G.clubs[p.club].human) Game.news(G, 'n_red', { name: p.n }, G.clubs[p.club].human);
      } else if (e.t === 'inj') {
        const hr = SF.Body.hurt(G, p, e.n, G.clubs[p.club]);
        ev.push([e.min, 'i', e.side, p.n, hr.weeks, hr.loss]);
        if (G.clubs[p.club] && G.clubs[p.club].human) Game.news(G, hr.loss ? 'n_injured_loss' : 'n_injured', { name: p.n, n: hr.weeks, loss: hr.loss }, G.clubs[p.club].human);
      } else if (e.t === 'sub') ev.push([e.min, 's', e.side, nm(e.pid), nm(e.pid2)]);
    }
    for (const sd of [mt.h, mt.a]) {
      for (const pid of sd.started.concat(sd.used)) { const p = G.players[pid]; if (p) { p.ap++; p.apt++; SF.Body.played(p, sd.started.indexOf(pid) >= 0); } }
    }
    for (const [sd, cl] of [[mt.h, hc], [mt.a, ac]]) {
      if (!cl.human) continue;
      const played = new Set(sd.started.concat(sd.used));
      for (const id of cl.squad) { const q = G.players[id]; if (q) q.pl = played.has(id) ? 1 : 0; }
    }
    ev.sort((a, b) => a[0] - b[0]);
    const att = attendance(hc);
    m.res = { hg: s.hg, ag: s.ag, p: s.pens ? [s.pens.h, s.pens.a] : null, et: s.et ? 1 : 0, ev, hs: s.hs, as: s.as, hp: s.hp, att };
    // gate
    if ((m.k === 'C' && m.r === CFG.CUP_ROUNDS - 1) || (m.k === 'E' && m.s === 8)) {
      const gate = Math.round(45000 * 4 * 0.5);
      Game.income(G, m.h, gate, 'gate'); Game.income(G, m.a, gate, 'gate');
      m.res.att = 45000;
    } else if (m.k === 'E') {
      // european nights fill the stadium
      m.res.att = hc.cap;
      Game.income(G, m.h, hc.cap * hc.price * CFG.euGate, 'gate');
    } else {
      Game.income(G, m.h, att * hc.price * (m.derby ? CFG.derbyGate : 1), 'gate');
    }
    // table & form (league only)
    const hpts = s.hg > s.ag ? 3 : s.hg === s.ag ? 1 : 0;
    const apts = s.ag > s.hg ? 3 : s.hg === s.ag ? 1 : 0;
    if (m.k === 'L') {
      G.res.push([G.wk.md, m.div, m.h, m.a, s.hg, s.ag]);
      const th = G.table[m.h], ta = G.table[m.a];
      th.p++; ta.p++; th.gf += s.hg; th.ga += s.ag; ta.gf += s.ag; ta.ga += s.hg;
      th.pts += hpts; ta.pts += apts;
      if (hpts === 3) { th.w++; ta.l++; } else if (hpts === 1) { th.d++; ta.d++; } else { th.l++; ta.w++; }
      hc.form.push(hpts); ac.form.push(apts);
      if (hc.form.length > 5) hc.form.shift();
      if (ac.form.length > 5) ac.form.shift();
    }
    hc.lastPts = hpts; ac.lastPts = apts;
    // coaches
    const strH = E.strength(G, hc), strA = E.strength(G, ac);
    coachResult(G, hc, hpts, strH, strA, true, m);
    coachResult(G, ac, apts, strA, strH, false, m);
  }

  function coachResult(G, club, pts, own, opp, home, m) {
    const coach = Game.humanOf(G, club.id);
    if (!coach) return;
    if (m.k === 'L') {
      const exp = util.clamp(1.35 + (own - opp) * 0.06 + (home ? 0.15 : -0.15), 0.2, 2.6);
      coach.board = util.clamp(coach.board + (pts - exp) * 1.6 * (m.derby ? 2 : 1), 0, 100);
      if (m.derby && pts !== 1) Game.addRep(G, coach, pts === 3 ? 0.5 : -0.5, 'derby');
      if (pts === 3 && own < opp - 4) Game.addRep(G, coach, 0.25, 'upset');
      else if (pts === 0 && own > opp + 4) Game.addRep(G, coach, -0.25, 'flop');
    } else {
      coach.board = util.clamp(coach.board + (pts === 3 ? 1.5 : -1), 0, 100);
    }
    coach.xp += pts === 3 ? 12 : pts === 1 ? 5 : 1;
    SF.Extras.onMatch(G, coach, { pts, gf: home ? m.res.hg : m.res.ag, ga: home ? m.res.ag : m.res.hg, home, k: m.k, derby: m.derby, upset: pts === 3 && own < opp - 3 });
  }

  // ---------- end of week ----------
  function weeklyEconomy(G, club) {
    const wages = util.sum(club.squad.map((id) => G.players[id].wage));
    B.debit(G, club.id, wages, 'wages');
    Game.income(G, club.id, CFG.tvWeekly[club.div], 'tv');
    const co = Game.humanOf(G, club.id);
    const spBase = CFG.sponsorWeekly[club.div] * SF.Q.sqrt(club.fans / CFG.fans[club.div]) * (co ? Game.repSponsor(co.rep) : 1);
    Game.income(G, club.id, SF.Boss ? SF.Boss.sponsor(G, club, spBase) : spBase, 'sponsor');
    B.debit(G, club.id, club.cap * CFG.upkeepPerSeat, 'upkeep');
    if (SF.Boss) SF.Boss.econ(G, club);
    B.payLoans(G, club.id);
    if (club.build) {
      club.build.left--;
      if (club.build.left <= 0) {
        club.cap += club.build.seats;
        if (club.human) Game.news(G, 'n_stadium_done', { seats: club.build.seats, cap: club.cap }, club.human);
        club.build = null;
      }
    }
    const bal = B.bal(G, club.id);
    if (bal < 0) {
      B.debit(G, club.id, -bal * CFG.overdraftFee, 'fine');
      if (!club.human) B.credit(G, club.id, -B.bal(G, club.id), 'bailout');
    }
  }

  Game.endWeek = function (G) {
    const wk = G.wk;
    if (!wk) return;
    if (wk.t === 'C') advanceCup(G, wk);
    if (wk.t === 'E') advanceEuro(G, wk);
    const eu = wk.t === 'E'; // european weeks: no wages / income tick, no market
    if (!eu) for (const cid of G.clubIds) weeklyEconomy(G, G.clubs[cid]);
    for (const pid in G.players) {
      const p = G.players[pid];
      if (p._f) { delete p._f; continue; }
      if (p.inj > 0) p.inj--;
      if (p.sus > 0) p.sus--;
    }
    SF.Body.weekly(G);
    for (const cid of G.clubIds) {
      const cl = G.clubs[cid];
      if (!cl.human) continue;
      SF.Extras.moodTick(G, cl, wk.matches.some((x) => x.h === cid || x.a === cid), cl.lastPts);
      const hc = Game.humanOf(G, cid);
      if (hc && B.bal(G, cid) >= 2500000) SF.Extras.unlock(G, hc, 'a_rich');
    }
    for (const co of G.coaches) if (co.vac > 0) co.vac--;
    if (!eu) {
      SF.Extras.weeklyHot(G);
      SF.Actions.weeklyMarket(G);
      SF.Actions.weeklyCareer(G);
      SF.Owner.weekly(G);
      for (const cid of G.clubIds) {
        const club = G.clubs[cid];
        if (!club.human) aiWeekly(G, club);
        else if (B.bal(G, cid) < 0) {
          const c = Game.humanOf(G, cid);
          c.board = util.clamp(c.board - 1, 0, 100);
          if (G.week % 4 === 0) Game.news(G, 'n_debt', { bal: Math.round(B.bal(G, cid)) }, c.id);
        }
      }
    }
    G.week++;
    if (G.week > G.sched.length) endSeason(G);
    else if (G.sched[G.week - 1].t === 'C') drawCup(G);
  };

  Game.playWeekAuto = function (G) {
    if (G.phase !== 'play') return;
    const wk = Game.beginWeek(G);
    for (const m of wk.matches) Game.simMatch(G, m);
    Game.endWeek(G);
  };

  Game.simulateSeason = function (G) {
    let g = 0;
    while (G.phase === 'play' && g++ < 80) Game.playWeekAuto(G);
  };

  // ---------- AI behaviour ----------
  function aiWeekly(G, club) {
    if (club.squad.length < CFG.SQUAD_MIN) signFree(G, club, 1);
  }

  function signFree(G, club, n) {
    for (let k = 0; k < n; k++) {
      const have = Game.players(G, club);
      const need = ['GK', 'DF', 'MF', 'FW'].find((pos) => have.filter((p) => p.pos === pos).length < pos0(pos));
      let pool = G.free.map((id) => G.players[id]).filter((p) => p && (!need || p.pos === need));
      if (!pool.length) { W.newFreeAgent(G, 36, 58, need || undefined); pool = [G.players[G.free[G.free.length - 1]]]; }
      const p = pool.sort((a, b) => b.ovr - a.ovr)[Math.min(pool.length - 1, R.int(0, 3))];
      G.free.splice(G.free.indexOf(p.id), 1);
      p.club = club.id; p.ct = R.int(1, 3); p.wage = E.wage(p);
      club.squad.push(p.id);
      B.debit(G, club.id, p.wage * 3, 'signing');
    }
  }

  function aiSeasonStart(G, club) {
    // trim
    while (club.squad.length > 24) {
      const sq = Game.players(G, club).filter((q) => !q.loan).sort((a, b) => a.ovr + (a.age < 22 ? a.pot * 0.3 : 0) - (b.ovr + (b.age < 22 ? b.pot * 0.3 : 0)));
      const p = sq[0];
      if (!p) break;
      releasePlayer(G, club, p, true);
    }
    // positional needs
    for (let g = 0; g < 8; g++) {
      const have = Game.players(G, club);
      if (have.length >= 26) break;
      if (have.length >= 18 && ['GK', 'DF', 'MF', 'FW'].every((pos) => have.filter((p) => p.pos === pos).length >= pos0(pos))) break;
      signFree(G, club, 1);
    }
    // improve with free agents if rich
    const wageBill = util.sum(club.squad.map((id) => G.players[id].wage)) * 28;
    if (B.bal(G, club.id) > wageBill * 0.35 && club.squad.length < 24) {
      const sorted = Game.players(G, club).sort((a, b) => b.ovr - a.ovr);
      const bar = sorted[Math.min(12, sorted.length - 1)].ovr;
      const fa = G.free.map((id) => G.players[id]).filter((p) => p && p.ovr > bar + 2).sort((a, b) => b.ovr - a.ovr)[0];
      if (fa && E.wage(fa) * 28 < B.bal(G, club.id) * 0.25) {
        G.free.splice(G.free.indexOf(fa.id), 1);
        fa.club = club.id; fa.ct = R.int(2, 3); fa.wage = E.wage(fa);
        club.squad.push(fa.id);
        B.debit(G, club.id, fa.wage * 3, 'signing');
      }
    }
    // buy from another club when rich (up to two purchases per pre-season)
    for (let tries = 0; tries < 2; tries++) {
      if (!(B.bal(G, club.id) > wageBill * 0.5 && club.squad.length < CFG.SQUAD_MAX - 1 && R.chance(0.85))) break;
      const sorted = Game.players(G, club).sort((a, b) => b.ovr - a.ovr);
      const bar = sorted[Math.min(9, sorted.length - 1)].ovr;
      let best = null;
      for (let t = 0; t < 50; t++) {
        const oc = G.clubs[R.pick(G.clubIds)];
        if (oc === club || oc.human || oc.squad.length <= 19) continue;
        const p = G.players[R.pick(oc.squad)];
        if (p.loan || p.ovr <= bar + 1 || p.ovr > bar + 12) continue;
        const fee = Math.round(E.value(p) * p.ask);
        if (fee > B.bal(G, club.id) * 0.5) continue;
        if (!best || p.ovr > best[0].ovr) best = [p, oc, fee];
      }
      if (best) moveClub(G, best[0], best[1], club, best[2]);
    }
  }

  function moveClub(G, p, from, to, fee) {
    from.squad.splice(from.squad.indexOf(p.id), 1);
    to.squad.push(p.id);
    SF.Extras.onLeave(G, from, p, true);
    p.club = to.id; p.listed = 0; p.yrs = 0; p.mood = 70; delete p.hot; delete p.wo;
    p.wage = Math.max(E.wage(p), 40); p.ct = Math.max(p.ct, 2);
    if (to.human) SF.Owner.onJoin(G, p);
    if (fee > 0) B.transfer(G, to.id, from.id, fee, 'transfer');
    from.rev += 0;
  }
  Game.moveClub = moveClub;

  function releasePlayer(G, club, p, toPool) {
    SF.Extras.onLeave(G, club, p, false);
    club.squad.splice(club.squad.indexOf(p.id), 1);
    p.club = null; p.ct = 0; p.listed = 0;
    if (toPool && p.age < 34 && p.ovr >= 30) G.free.push(p.id); else delete G.players[p.id];
  }
  Game.releasePlayer = releasePlayer;

  // ---------- evolution ----------
  function stoch(x) { const f = Math.floor(x); return f + (R.f() < x - f ? 1 : 0); }

  function progress(G, p, club, coach) {
    const tl = club ? club.facility.train : 1;
    const cb = coach ? coach.sk.train : 0;
    const boost = (1 + 0.06 * (SF.Actions.facEff(tl) - 1) + 0.05 * cb) * SF.Body.progressMul(club);
    let d;
    if (p.age <= 24) {
      d = (p.pot - p.ovr) * R.range(0.12, 0.4) * boost;
      if (p.ap >= 12) d += 0.8;
      if (p.ap <= 2) d *= 0.7;
    } else if (p.age <= 29) d = R.gauss(0.2, 1.1) * (R.f() < 0.5 ? boost : 1);
    else if (p.age <= 32) d = -R.range(0.2, 1.6) / SF.Q.sqrt(boost);
    else d = -R.range(1.2, 3.0);
    p.ovr = util.clamp(p.ovr + stoch(Math.abs(d)) * Math.sign(d), 25, 94);
    if (p.age <= 24) p.pot = Math.max(p.ovr, Math.min(95, p.pot + Math.round(R.gauss(0, 1))));
    else p.pot = p.ovr;
    p.ask = Math.round(R.range(0.95, 1.3) * 100) / 100;
  }

  function youthIntake(G, club) {
    if (club.human) return SF.Extras.academyIntake(G, club);
    const coach = Game.humanOf(G, club.id);
    const yl = club.facility.youth;
    const n = 1 + (R.chance(CFG.youthExtra) ? 1 : 0) + (yl >= 3 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const pos = R.weighted(['GK', 'DF', 'MF', 'FW'], (x) => (x === 'GK' ? 1 : 3));
      const pot = util.clamp(Math.round(R.gauss(CFG.youthPot[club.div] + (SF.Actions.facEff(yl) - 1) * 1.2 + (coach ? coach.sk.youth * 1.5 : 0), CFG.youthSd)), 40, 93);
      const ovr = util.clamp(pot - R.int(14, 28), 28, 70);
      const p = W.newPlayer(G, { pos, ovr, age: R.int(16, 18), club: club.id, ct: 3, pot });
      p.wage = 40;
      club.squad.push(p.id);
      if (club.human && p.pot >= 70) Game.news(G, 'n_youth', { name: p.n, pos: p.pos }, club.human);
    }
  }

  // ---------- end of season ----------
  Game.standings = function (G, div) {
    return G.divs[div].slice().sort((a, b) => {
      const x = G.table[a], y = G.table[b];
      return y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || (a < b ? -1 : 1);
    });
  };

  Game.topScorers = function (G, div, n) {
    const ids = new Set(G.divs[div]);
    const out = [];
    for (const cid of ids) for (const pid of G.clubs[cid].squad) { const p = G.players[pid]; if (p.gl > 0) out.push(p); }
    return out.sort((a, b) => b.gl - a.gl || a.ap - b.ap).slice(0, n || 10);
  };

  function endSeason(G) {
    const hall = { s: G.season, champ: [], scorer: [], cup: G.cup.winner, finalist: G.cup.finalist };
    const summary = { champions: [], promoted: [], relegated: [], scorers: [], cup: G.cup.winner, finalist: G.cup.finalist, prizes: {} };
    for (let d = 0; d < CFG.DIVS; d++) {
      const st = Game.standings(G, d);
      st.forEach((id, i) => { G.clubs[id].pos = i + 1; });
      const champ = st[0];
      hall.champ.push(champ); summary.champions.push(champ);
      G.clubs[champ].title++;
      Game.income(G, champ, CFG.prizeLeague[d], 'prize'); addPrize(summary, champ, CFG.prizeLeague[d], 'league', { d });
      const ts = Game.topScorers(G, d, 1)[0];
      if (ts) {
        Game.income(G, ts.club, CFG.prizeScorer[d], 'prize'); addPrize(summary, ts.club, CFG.prizeScorer[d], 'scorer', { d, name: ts.n, g: ts.gl });
        hall.scorer.push({ name: ts.n, club: ts.club, g: ts.gl }); summary.scorers.push({ d, name: ts.n, club: ts.club, g: ts.gl });
        if (G.clubs[ts.club].human) Game.news(G, 'n_scorer', { name: ts.n, g: ts.gl }, G.clubs[ts.club].human);
      } else { hall.scorer.push(null); summary.scorers.push(null); }
      if (d === 0) { G.euroQ = st.slice(0, CFG.EU_SLOTS); summary.euQ = G.euroQ.slice(); }
      if (d > 0) {
        for (const id of st.slice(0, 2)) { G.clubs[id].nextDiv = d - 1; summary.promoted.push(id); Game.income(G, id, CFG.promoBonus[d], 'prize'); addPrize(summary, id, CFG.promoBonus[d], 'promo', { d }); }
      }
      if (d < CFG.DIVS - 1) for (const id of st.slice(-2)) { G.clubs[id].nextDiv = d + 1; summary.relegated.push(id); }
      else for (const id of st.slice(-2)) { G.clubs[id].dropped = 1; (summary.dropped = summary.dropped || []).push(id); } // nothing below the fourth division
    }
    if (G.cup.winner) {
      G.clubs[G.cup.winner].cups++;
      Game.income(G, G.cup.winner, CFG.prizeCup, 'prize'); addPrize(summary, G.cup.winner, CFG.prizeCup, 'cup', {});
      Game.income(G, G.cup.finalist, CFG.prizeCup * 0.4, 'prize'); addPrize(summary, G.cup.finalist, CFG.prizeCup * 0.4, 'cupfinal', {});
    }
    summary.euro = { winner: G.eu.winner, finalist: G.eu.finalist, q: G.eu.q.slice(), reach: G.eu.reach };
    hall.euro = G.eu.winner;
    for (const id in G.eu.paid) {
      const win = G.eu.winner === id ? CFG.euWinner : 0;
      if (win) addPrize(summary, id, win, 'euwin', {});
      if (G.eu.paid[id] - win > 0) addPrize(summary, id, G.eu.paid[id] - win, 'eu', { reach: G.eu.reach[id] });
    }
    for (const id of G.clubIds) {
      const c = G.clubs[id];
      c.lastRevenue = c.rev;
      if (!c.human) { const keep = c.rev * CFG.aiKeep; const bal = B.bal(G, id); if (bal > keep) B.debit(G, id, (bal - keep) * 0.6, 'dividend'); }
      c.hist.push({ s: G.season, d: c.div, pos: c.pos, pts: G.table[id].pts, cup: c.cupRound });
      if (c.hist.length > 30) c.hist.shift();
    }
    // coaches
    for (const co of G.coaches) {
      if (!co.club) continue;
      const club = G.clubs[co.club];
      const diff = club.target - club.pos;
      let delta = diff >= 0 ? 6 + diff * 1.5 : diff * 3;
      if (club.pos === 1) delta += 10;
      if (club.nextDiv < club.div) delta += 8;
      if (club.nextDiv > club.div) delta -= 12;
      delta += club.cupRound * 1.5;
      co.board = util.clamp(co.board + delta, 0, 100);
      Game.addRep(G, co, diff >= 0 ? 1 + diff * 0.8 : diff * 0.8, 'pos');
      if (club.pos === 1) Game.addRep(G, co, 5, 'title');
      if (club.nextDiv < club.div) Game.addRep(G, co, 3, 'promo');
      if (club.nextDiv > club.div) Game.addRep(G, co, -4, 'rel');
      if (club.cupRound > 0) Game.addRep(G, co, club.cupRound * 0.6, 'cup');
      if (G.cup.winner === club.id) Game.addRep(G, co, 3, 'cupwin');
      const er = G.eu.reach[club.id];
      if (G.eu.q.includes(club.id) && !G.eu.idle) Game.addRep(G, co, [0.5, 1.5, 3, 5, 9][er], 'euro');
      const bal = B.bal(G, club.id), debt = B.debtOf(G, club.id);
      if (bal > 0 && debt === 0) Game.addRep(G, co, 0.5, 'fin');
      else if (bal < 0 || debt > club.rev * 0.8) Game.addRep(G, co, -1.5, 'fin');
      co.rep = util.clamp(Math.round(co.rep), 0, 100);
      if (G.eu.winner === club.id) { co.xp += 250; co.trophies.push({ s: G.season, k: 'euro', club: club.id }); Game.news(G, 'n_eurowin', { club: club.name }, co.id); }
      if (club.pos === 1) { co.xp += 150; co.trophies.push({ s: G.season, k: 'league', d: club.div, club: club.id }); Game.news(G, 'n_champion', { club: club.name }, co.id); }
      if (G.cup.winner === club.id) { co.xp += 100; co.trophies.push({ s: G.season, k: 'cup', club: club.id }); Game.news(G, 'n_cupwin', { club: club.name }, co.id); }
      co.hist.push({ s: G.season, club: club.id, d: club.div, pos: club.pos, target: club.target, cup: club.cupRound });
      if (club.nextDiv < club.div) Game.news(G, 'n_promoted', { club: club.name }, co.id);
      if (club.nextDiv > club.div) Game.news(G, 'n_relegated', { club: club.name }, co.id);
      SF.Owner.seasonEnd(G, co, club);
      const X = SF.Extras;
      if (club.pos === 1) X.unlock(G, co, 'a_champion');
      if (G.cup.winner === club.id) X.unlock(G, co, 'a_cup');
      if (G.eu.winner === club.id) X.unlock(G, co, 'a_euro');
      if (club.nextDiv < club.div) X.unlock(G, co, 'a_promo');
      if (G.table[club.id].l === 0) X.unlock(G, co, 'a_unbeaten');
      if (co.hist.length >= 5) X.unlock(G, co, 'a_seasons5');
      if (co.hist.length >= 10) X.unlock(G, co, 'a_seasons10');
    }
    // a human who takes a club down from the fourth division loses it: no wages from now on, and an owner loses the club
    for (const co of G.coaches) { const cl = co.club && G.clubs[co.club]; if (cl && cl.dropped) Game.dropOut(G, co, cl); }
    G.hall.push(hall);
    G.summary = summary;
    G.phase = 'seasonEnd';
    SF.Owner.npcSeasonEnd(G);
    if (SF.Boss) SF.Boss.seasonEnd(G);
    SF.Actions.seasonEndCareer(G);
  }
  Game.dropOut = function (G, co, club) {
    const O = SF.Owner, role = O.role(co);
    co.contract = null; // no severance, no wages after this
    if (club.ac) { O.toMarket(G, club.ac, 0); club.ac = null; }
    club.owner = 0;
    SF.Actions.sack(G, co, 'expired');
    co.sacked++; co.rep = Math.max(0, co.rep - 8);
    if (role !== 'coach') co.role = 'coach'; // the former owner starts again as a coach
    Game.news(G, role === 'coach' ? 'n_dropped_coach' : 'n_dropped_owner', { club: club.name }, co.id);
  };
  function addPrize(sm, id, amt, kind, x) {
    sm.prizes[id] = (sm.prizes[id] || 0) + Math.round(amt);
    (sm.awards = sm.awards || []).push(Object.assign({ k: kind, club: id, amt: Math.round(amt) }, x));
  }

  // loaned players go back to their owners when the loan runs out
  function returnLoans(G) {
    for (const pid in G.players) {
      const p = G.players[pid];
      if (!p.loan) continue;
      if (--p.loan.left > 0) continue;
      const from = G.clubs[p.club], to = G.clubs[p.loan.owner];
      delete p.loan;
      if (from) from.squad.splice(from.squad.indexOf(p.id), 1);
      if (to) {
        to.squad.push(p.id); p.club = to.id;
        if (from && from.human) Game.news(G, 'n_loan_end', { name: p.n, club: to.name }, from.human);
        if (to.human) Game.news(G, 'n_loan_back', { name: p.n, club: from ? from.name : '' }, to.human);
      } else { p.club = null; G.free.push(p.id); }
    }
  }

  // while the coach is on holiday the staff renews the contracts that matter and lets the rest go
  function autoRenew(G, club, coach) {
    const rep = { renewed: 0, released: 0, cost: 0 };
    let staying = club.squad.filter((id) => G.players[id].ct > 1).length;
    const expiring = Game.players(G, club).filter((p) => p.ct <= 1 && !(p.loan && p.loan.owner !== club.id)).sort((x, y) => y.ovr - x.ovr);
    for (const p of expiring) {
      const rank = Game.players(G, club).filter((q) => q.ovr > p.ovr).length;
      const wage = Math.round((E.wage(p) * 1.04) / 10) * 10;
      const wanted = (rank < 18 && p.age < 34) || staying < CFG.SQUAD_MIN;
      if (wanted && B.bal(G, club.id) > wage * 2) {
        B.debit(G, club.id, wage * 2, 'signing');
        p.wage = wage; p.ct += 2; staying++; rep.renewed++; rep.cost += wage * 2;
      } else rep.released++;
    }
    coach.vacReport = rep;
  }

  Game.newSeason = function (G) {
    if (G.phase !== 'seasonEnd') return;
    returnLoans(G);
    SF.Extras.archive(G);
    for (const co of G.coaches) if (co.vac > 0 && co.club) autoRenew(G, G.clubs[co.club], co);
    W.refreshForeign(G);
    for (const id of G.clubIds) {
      const c = G.clubs[id];
      const was = c.div;
      c.div = c.nextDiv;
      // fans follow results
      const diff = c.target - c.pos;
      let fl = 1 + 0.01 * util.clamp(diff, -6, 6) + (c.pos === 1 ? 0.04 : 0);
      if (c.div < was) fl += 0.06; if (c.div > was) fl -= 0.06;
      if (SF.Boss) fl -= 0.06 * SF.Boss.stress(c); // an owner who does not reinvest loses supporters
      c.fans = Math.round(c.fans * fl);
      const base = CFG.fans[c.div];
      c.fans = Math.round(c.fans + (base - c.fans) * (c.div !== was ? 0.3 : 0.06));
      c.fans = util.clamp(c.fans, base * 0.5, base * 2.6);
      if (c.div !== was) c.price = Math.round(CFG.refPrice[c.div] * 10) / 10;
      const step = SF.Actions.expandStep(c);
      if (!c.human && c.fans > c.cap * 1.1 && B.bal(G, id) > CFG.seatCost * step * 2) {
        B.debit(G, id, CFG.seatCost * step, 'stadium'); c.cap += step;
      }
    }
    // players age, progress, contracts, retirement
    for (const id of G.clubIds) {
      const club = G.clubs[id];
      const coach = Game.humanOf(G, id);
      for (const p of Game.players(G, club).slice()) {
        p.age++; p.ct--; p.inj = 0; p.sus = 0; p.yc = 0; p.yrs = (p.yrs || 0) + 1;
        if (p.rec) { if (p.age < 33) p.ovr = Math.min(99, p.ovr + p.rec); p.rec = 0; }
        progress(G, p, club, coach);
        const retire = p.age >= 34 && R.chance(Math.min(0.95, (p.age - 33) * 0.28));
        if (retire) {
          if (club.human && E.isIdol(p)) { club.fans = Math.round(club.fans * 1.02); Game.news(G, 'n_idol_retired', { name: p.n, yrs: p.yrs }, club.human); }
          if (club.human) Game.news(G, 'n_retired', { name: p.n, age: p.age }, club.human);
          club.squad.splice(club.squad.indexOf(p.id), 1); delete G.players[p.id];
          continue;
        }
        if (p.ct <= 0) {
          if (coach && !(club.owner && !club.ac)) { Game.news(G, 'n_expired', { name: p.n }, coach.id); releasePlayer(G, club, p, true); } // an owner's club with no coach keeps its regulars like a computer club does, instead of emptying the squad
          else {
            const rank = Game.players(G, club).filter((q) => q.ovr > p.ovr).length;
            if (rank < 17 && p.age < 34) { p.ct = R.int(1, 3); p.wage = Math.round((E.wage(p) * R.range(0.9, 1.1)) / 10) * 10; }
            else releasePlayer(G, club, p, true);
          }
        }
      }
      youthIntake(G, club);
    }
    // free agents
    for (const pid of G.free.slice()) {
      const p = G.players[pid];
      if (!p) { G.free.splice(G.free.indexOf(pid), 1); continue; }
      p.age++; progress(G, p, null, null);
      if (p.age >= 35 || p.ovr < 30) { G.free.splice(G.free.indexOf(pid), 1); delete G.players[pid]; }
    }
    for (let i = 0; i < 26; i++) W.newFreeAgent(G, 36, 64);
    if (G.free.length > 90) {
      const keep = G.free.map((id) => G.players[id]).sort((a, b) => b.ovr - a.ovr);
      for (const p of keep.slice(90)) { delete G.players[p.id]; }
      G.free = keep.slice(0, 90).map((p) => p.id);
    }
    for (const id of G.clubIds) if (!G.clubs[id].human) aiSeasonStart(G, G.clubs[id]);
    G.season++;
    Game.startSeason(G);
    SF.Owner.seasonStart(G);
    if (SF.Boss) SF.Boss.seasonStart(G);
    SF.Body.seasonReset(G);
    for (const co of G.coaches) { if (co.club) { co.board = Math.max(co.board, 45); co.jobWeeks = Math.max(co.jobWeeks, 0); } }
    for (const id of G.clubIds) {
      const cl = G.clubs[id];
      if (cl.human) { SF.Extras.autoCaptain(G, cl); const hc = Game.humanOf(G, id); if (Game.players(G, cl).some((p) => p.hg && p.ovr >= 75)) SF.Extras.unlock(G, hc, 'a_homegrown'); if (Game.players(G, cl).some((p) => E.isIdol(p))) SF.Extras.unlock(G, hc, 'a_idol'); }
      else if (cl.acad && cl.acad.length) { for (const pid of cl.acad) { const q = G.players[pid]; if (q && q.acad === id) delete G.players[pid]; } cl.acad = []; }
    }
    for (const co of G.coaches) {
      if (co.vac > 0 && co.club) { // holiday: the staff promotes the best two youngsters
        const cl = G.clubs[co.club];
        for (const pid of (cl.acad || []).slice().sort((a, b) => G.players[b].pot - G.players[a].pot).slice(0, 2)) if (cl.squad.length < CFG.SQUAD_MAX - 2) SF.Extras.promote(G, co, pid);
      }
      co.vac = 0;
    }
    SF.Actions.newSeasonCareer(G);
  };

  Game.fixDiv = (G) => G.divs;
})();
