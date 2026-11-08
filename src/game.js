/* SuiFoot game flow: setup, calendar, league + cup, weekly economy, season rollover,
 * player evolution. Human-facing actions live in actions.js. */
(function () {
  const SF = globalThis.SF;
  const { R, CFG, util } = SF;
  const B = SF.Bank, W = SF.World, E = SF.Econ;

  const FORMS = { '4-4-2': [4, 4, 2], '4-3-3': [4, 3, 3], '3-5-2': [3, 5, 2], '5-3-2': [5, 3, 2], '4-5-1': [4, 5, 1], '3-4-3': [3, 4, 3] };
  const CUP_KEYS = ['cup_r64', 'cup_r32', 'cup_r16', 'cup_qf', 'cup_sf', 'cup_f'];
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
    const a = B.credit(G, cid, amt, kind, memo);
    c.rev += a;
    return a;
  };
  Game.strength = (G, club) => E.strength(G, club);
  Game.level = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 60)) + 1;
  Game.freePoints = (c) => Game.level(c.xp) - 1 - (c.sk.train + c.sk.tact + c.sk.neg + c.sk.youth);
  Game.repStrength = (rep) => 46 + rep * 0.3;

  function makeCoach(G, name, id) {
    return {
      id, name, club: null, rep: 20, xp: 0, board: 60, jobWeeks: 0, unemp: 0, sk: { train: 0, tact: 0, neg: 0, youth: 0 },
      lineup: { auto: true, form: '4-4-2', tactic: 'bal', xi: [], bench: [] }, offers: [], hist: [], trophies: [], sacked: 0, nextOffer: 1,
    };
  }

  // ---------- new game ----------
  Game.newGame = function (o) {
    o = o || {};
    const seed = (o.seed != null ? o.seed : (Date.now() ^ 0x9e3779b9)) >>> 0;
    const G = { v: SF.VERSION, seed, rs: seed, season: 1, week: 1, phase: 'play', news: [], coaches: [], offers: [], hall: [], nextOffer: 1, lang: o.lang || 'en', wk: null };
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
      G.coaches.push(c);
    });
    Game.startSeason(G);
    for (const c of G.coaches) Game.news(G, 'n_welcome', { club: G.clubs[c.club].name }, c.id);
    return G;
  };

  Game.serialize = (G) => JSON.stringify(G);
  Game.deserialize = function (s) {
    const G = JSON.parse(s);
    SF.setG(G);
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
      c.rev = 0; c.form = []; c.cupRound = 0; c.nextDiv = c.div;
    }
    for (const pid in G.players) { const p = G.players[pid]; p.g = 0; p.ap = 0; }
    const rr = G.divs.map((ids) => roundRobin(ids));
    G.sched = [];
    let md = 0, cup = 0;
    for (let m = 1; m <= CFG.LEAGUE_WEEKS; m++) {
      const fx = {};
      rr.forEach((rounds, d) => { fx[d] = rounds[m - 1]; });
      G.sched.push({ t: 'L', md: m, fx });
      if (CFG.CUP_AFTER.includes(m)) G.sched.push({ t: 'C', r: cup++ });
    }
    G.cup = { alive: G.clubIds.slice(), round: 0, drawn: -1, matches: [], byes: [], winner: null, finalist: null, hist: [] };
    for (let d = 0; d < CFG.DIVS; d++) {
      const sorted = G.divs[d].slice().sort((a, b) => E.strength(G, G.clubs[b]) - E.strength(G, G.clubs[a]));
      sorted.forEach((id, i) => { G.clubs[id].target = i + 1; });
    }
    G.week = 1; G.phase = 'play'; G.wk = null; G.summary = null;
    for (const c of G.coaches) { c.startRep = c.rep; }
  };

  // ---------- lineups ----------
  function avail(G, club) { return club.squad.map((id) => G.players[id]).filter((p) => p.inj <= 0 && p.sus <= 0); }

  function pickXI(G, club, form) {
    const f = FORMS[form] || FORMS['4-4-2'];
    const av = avail(G, club).sort((a, b) => b.ovr - a.ovr);
    const xi = [];
    const take = (pos, n) => { for (const p of av) { if (n <= 0) break; if (p.pos === pos && !xi.includes(p)) { xi.push(p); n--; } } };
    take('GK', 1); take('DF', f[0]); take('MF', f[1]); take('FW', f[2]);
    for (const p of av) { if (xi.length >= 11) break; if (!xi.includes(p) && p.pos !== 'GK') xi.push(p); }
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
      if (L.auto) { xi = auto.xi; bench = auto.bench; }
      else {
        const ok = (id) => { const p = G.players[id]; return p && p.club === clubId && p.inj <= 0 && p.sus <= 0; };
        xi = [...new Set(L.xi.filter(ok))].slice(0, 11);
        for (const id of auto.xi.concat(auto.bench)) { if (xi.length >= 11) break; if (!xi.includes(id)) xi.push(id); }
        bench = [...new Set(L.bench.filter(ok))].filter((id) => !xi.includes(id)).slice(0, 7);
        for (const id of auto.bench.concat(auto.xi)) { if (bench.length >= 7) break; if (!xi.includes(id) && !bench.includes(id)) bench.push(id); }
      }
    } else ({ xi, bench } = pickXI(G, club, '4-4-2'));
    return { club: clubId, xi, bench, tactic, tbonus: tb };
  };

  // ---------- cup ----------
  function drawCup(G) {
    const c = G.cup;
    if (c.drawn === c.round) return;
    const pool = R.shuffle(c.alive.slice());
    let playing = pool, byes = [];
    if (c.round === 0) { playing = pool.slice(0, 32); byes = pool.slice(32); }
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
      if (c.round === 5) { c.winner = w; c.finalist = l; }
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
    for (const cid of G.clubIds) ensureSquad(G, G.clubs[cid]);
    if (sw.t === 'L') {
      for (const d in sw.fx) for (const [h, a] of sw.fx[d]) matches.push({ id: id++, k: 'L', div: +d, h, a, res: null });
    } else {
      drawCup(G);
      for (const cm of G.cup.matches) matches.push({ id: id++, k: 'C', r: G.cup.round, h: cm.h, a: cm.a, res: null });
    }
    G.wk = { w: G.week, s: G.season, t: sw.t, md: sw.md || 0, r: sw.r != null ? sw.r : -1, matches };
    return G.wk;
  };

  Game.buildMatch = function (G, m) {
    return new SF.Match(G, Game.specFor(G, m.h), Game.specFor(G, m.a), { knockout: m.k === 'C', neutral: m.k === 'C' && m.r === 5 });
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
    const priceF = Math.pow(CFG.refPrice[club.div] / club.price, 1.1);
    return Math.min(club.cap, Math.round(club.fans * mood * priceF));
  }
  Game.attendance = attendance;

  function applyResult(G, m, mt) {
    const s = mt.summary();
    const hc = G.clubs[m.h], ac = G.clubs[m.a];
    const nm = (id) => (G.players[id] ? G.players[id].n : '?');
    const ev = [];
    for (const e of s.events) {
      const p = G.players[e.pid];
      if (!p) continue;
      if (e.t === 'goal') { p.g++; p.gt++; ev.push([e.min, 'g', e.side, p.n, e.pid2 ? nm(e.pid2) : '']); }
      else if (e.t === 'yellow') {
        p.yc++;
        if (p.yc >= 5) { p.yc = 0; p.sus = Math.max(p.sus, 1); p._f = 1; if (G.clubs[p.club] && G.clubs[p.club].human) Game.news(G, 'n_suspended', { name: p.n }, G.clubs[p.club].human); }
      } else if (e.t === 'red') {
        p.sus = Math.max(p.sus, e.second ? 1 : 2); p._f = 1; p.yc = 0;
        ev.push([e.min, 'r', e.side, p.n, '']);
        if (G.clubs[p.club] && G.clubs[p.club].human) Game.news(G, 'n_red', { name: p.n }, G.clubs[p.club].human);
      } else if (e.t === 'inj') {
        p.inj = Math.max(p.inj, e.n); p._f = 1;
        ev.push([e.min, 'i', e.side, p.n, e.n]);
        if (G.clubs[p.club] && G.clubs[p.club].human) Game.news(G, 'n_injured', { name: p.n, n: e.n }, G.clubs[p.club].human);
      } else if (e.t === 'sub') ev.push([e.min, 's', e.side, nm(e.pid), nm(e.pid2)]);
    }
    for (const sd of [mt.h, mt.a]) {
      for (const pid of sd.started.concat(sd.used)) { const p = G.players[pid]; if (p) { p.ap++; p.apt++; } }
    }
    ev.sort((a, b) => a[0] - b[0]);
    const att = attendance(hc);
    m.res = { hg: s.hg, ag: s.ag, p: s.pens ? [s.pens.h, s.pens.a] : null, et: s.et ? 1 : 0, ev, hs: s.hs, as: s.as, hp: s.hp, att };
    // gate
    if (m.k === 'C' && m.r === 5) {
      const gate = Math.round(45000 * 4 * 0.5);
      Game.income(G, m.h, gate, 'gate'); Game.income(G, m.a, gate, 'gate');
      m.res.att = 45000;
    } else {
      Game.income(G, m.h, att * hc.price, 'gate');
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
      coach.board = util.clamp(coach.board + (pts - exp) * 1.6, 0, 100);
    } else {
      coach.board = util.clamp(coach.board + (pts === 3 ? 1.5 : -1), 0, 100);
    }
    coach.xp += pts === 3 ? 12 : pts === 1 ? 5 : 1;
  }

  // ---------- end of week ----------
  function weeklyEconomy(G, club) {
    const wages = util.sum(club.squad.map((id) => G.players[id].wage));
    B.debit(G, club.id, wages, 'wages');
    Game.income(G, club.id, CFG.tvWeekly[club.div], 'tv');
    Game.income(G, club.id, CFG.sponsorWeekly[club.div] * Math.sqrt(club.fans / CFG.fans[club.div]), 'sponsor');
    B.debit(G, club.id, club.cap * CFG.upkeepPerSeat, 'upkeep');
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
    for (const cid of G.clubIds) weeklyEconomy(G, G.clubs[cid]);
    for (const pid in G.players) {
      const p = G.players[pid];
      if (p._f) { delete p._f; continue; }
      if (p.inj > 0) p.inj--;
      if (p.sus > 0) p.sus--;
    }
    SF.Actions.weeklyMarket(G);
    SF.Actions.weeklyCareer(G);
    for (const cid of G.clubIds) {
      const club = G.clubs[cid];
      if (!club.human) aiWeekly(G, club);
      else if (B.bal(G, cid) < 0) {
        const c = Game.humanOf(G, cid);
        c.board = util.clamp(c.board - 1, 0, 100);
        if (G.week % 4 === 0) Game.news(G, 'n_debt', { bal: Math.round(B.bal(G, cid)) }, c.id);
      }
    }
    G.week++;
    if (G.week > CFG.TOTAL_WEEKS) endSeason(G);
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
    while (G.phase === 'play' && g++ < 40) Game.playWeekAuto(G);
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
      p.club = club.id; p.ct = R.int(1, 3); p.wage = E.wageFor(p.ovr);
      club.squad.push(p.id);
      B.debit(G, club.id, p.wage * 3, 'signing');
    }
  }

  function aiSeasonStart(G, club) {
    // trim
    while (club.squad.length > 24) {
      const sq = Game.players(G, club).sort((a, b) => a.ovr + (a.age < 22 ? a.pot * 0.3 : 0) - (b.ovr + (b.age < 22 ? b.pot * 0.3 : 0)));
      const p = sq[0];
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
      if (fa && E.wageFor(fa.ovr) * 28 < B.bal(G, club.id) * 0.25) {
        G.free.splice(G.free.indexOf(fa.id), 1);
        fa.club = club.id; fa.ct = R.int(2, 3); fa.wage = E.wageFor(fa.ovr);
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
        if (p.ovr <= bar + 1 || p.ovr > bar + 12) continue;
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
    p.club = to.id; p.listed = 0;
    p.wage = Math.max(E.wageFor(p.ovr), 40); p.ct = Math.max(p.ct, 2);
    if (fee > 0) B.transfer(G, to.id, from.id, fee, 'transfer');
    from.rev += 0;
  }
  Game.moveClub = moveClub;

  function releasePlayer(G, club, p, toPool) {
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
    const boost = 1 + 0.06 * (tl - 1) + 0.05 * cb;
    let d;
    if (p.age <= 24) {
      d = (p.pot - p.ovr) * R.range(0.12, 0.4) * boost;
      if (p.ap >= 12) d += 0.8;
      if (p.ap <= 2) d *= 0.7;
    } else if (p.age <= 29) d = R.gauss(0.2, 1.1) * (R.f() < 0.5 ? boost : 1);
    else if (p.age <= 32) d = -R.range(0.2, 1.6) / Math.sqrt(boost);
    else d = -R.range(1.2, 3.0);
    p.ovr = util.clamp(p.ovr + stoch(Math.abs(d)) * Math.sign(d), 25, 94);
    if (p.age <= 24) p.pot = Math.max(p.ovr, Math.min(95, p.pot + Math.round(R.gauss(0, 1))));
    else p.pot = p.ovr;
    p.ask = Math.round(R.range(0.95, 1.3) * 100) / 100;
  }

  function youthIntake(G, club) {
    const coach = Game.humanOf(G, club.id);
    const yl = club.facility.youth;
    const n = 1 + (R.chance(CFG.youthExtra) ? 1 : 0) + (yl >= 3 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const pos = R.weighted(['GK', 'DF', 'MF', 'FW'], (x) => (x === 'GK' ? 1 : 3));
      const pot = util.clamp(Math.round(R.gauss(CFG.youthPot[club.div] + (yl - 1) * 1.2 + (coach ? coach.sk.youth * 1.5 : 0), CFG.youthSd)), 40, 93);
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
    for (const cid of ids) for (const pid of G.clubs[cid].squad) { const p = G.players[pid]; if (p.g > 0) out.push(p); }
    return out.sort((a, b) => b.g - a.g || a.ap - b.ap).slice(0, n || 10);
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
      Game.income(G, champ, CFG.prizeLeague[d], 'prize'); addPrize(summary, champ, CFG.prizeLeague[d]);
      const ts = Game.topScorers(G, d, 1)[0];
      if (ts) {
        Game.income(G, ts.club, CFG.prizeScorer[d], 'prize'); addPrize(summary, ts.club, CFG.prizeScorer[d]);
        hall.scorer.push({ name: ts.n, club: ts.club, g: ts.g }); summary.scorers.push({ d, name: ts.n, club: ts.club, g: ts.g });
        if (G.clubs[ts.club].human) Game.news(G, 'n_scorer', { name: ts.n, g: ts.g }, G.clubs[ts.club].human);
      } else { hall.scorer.push(null); summary.scorers.push(null); }
      if (d > 0) {
        for (const id of st.slice(0, 2)) { G.clubs[id].nextDiv = d - 1; summary.promoted.push(id); Game.income(G, id, CFG.promoBonus[d], 'prize'); addPrize(summary, id, CFG.promoBonus[d]); }
      }
      if (d < CFG.DIVS - 1) for (const id of st.slice(-2)) { G.clubs[id].nextDiv = d + 1; summary.relegated.push(id); }
    }
    if (G.cup.winner) {
      G.clubs[G.cup.winner].cups++;
      Game.income(G, G.cup.winner, CFG.prizeCup, 'prize'); addPrize(summary, G.cup.winner, CFG.prizeCup);
      Game.income(G, G.cup.finalist, CFG.prizeCup * 0.4, 'prize'); addPrize(summary, G.cup.finalist, CFG.prizeCup * 0.4);
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
      let rep = (diff >= 0 ? 1 + diff * 0.8 : diff * 0.8) + (club.pos === 1 ? 5 : 0) + club.cupRound * 0.6;
      if (club.nextDiv < club.div) rep += 3;
      if (club.nextDiv > club.div) rep -= 4;
      co.rep = util.clamp(Math.round(co.rep + rep), 0, 100);
      if (club.pos === 1) { co.xp += 150; co.trophies.push({ s: G.season, k: 'league', d: club.div, club: club.id }); Game.news(G, 'n_champion', { club: club.name }, co.id); }
      if (G.cup.winner === club.id) { co.xp += 100; co.trophies.push({ s: G.season, k: 'cup', club: club.id }); Game.news(G, 'n_cupwin', { club: club.name }, co.id); }
      co.hist.push({ s: G.season, club: club.id, d: club.div, pos: club.pos, target: club.target, cup: club.cupRound });
      if (club.nextDiv < club.div) Game.news(G, 'n_promoted', { club: club.name }, co.id);
      if (club.nextDiv > club.div) Game.news(G, 'n_relegated', { club: club.name }, co.id);
    }
    G.hall.push(hall);
    G.summary = summary;
    G.phase = 'seasonEnd';
    SF.Actions.seasonEndCareer(G);
  }
  function addPrize(sm, id, amt) { sm.prizes[id] = (sm.prizes[id] || 0) + Math.round(amt); }

  Game.newSeason = function (G) {
    if (G.phase !== 'seasonEnd') return;
    for (const id of G.clubIds) {
      const c = G.clubs[id];
      const was = c.div;
      c.div = c.nextDiv;
      // fans follow results
      const diff = c.target - c.pos;
      let fl = 1 + 0.01 * util.clamp(diff, -6, 6) + (c.pos === 1 ? 0.04 : 0);
      if (c.div < was) fl += 0.06; if (c.div > was) fl -= 0.06;
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
        p.age++; p.ct--; p.inj = 0; p.sus = 0; p.yc = 0;
        progress(G, p, club, coach);
        const retire = p.age >= 34 && R.chance(Math.min(0.95, (p.age - 33) * 0.28));
        if (retire) {
          if (club.human) Game.news(G, 'n_retired', { name: p.n, age: p.age }, club.human);
          club.squad.splice(club.squad.indexOf(p.id), 1); delete G.players[p.id];
          continue;
        }
        if (p.ct <= 0) {
          if (coach) { Game.news(G, 'n_expired', { name: p.n }, coach.id); releasePlayer(G, club, p, true); }
          else {
            const rank = Game.players(G, club).filter((q) => q.ovr > p.ovr).length;
            if (rank < 17 && p.age < 34) { p.ct = R.int(1, 3); p.wage = Math.round((E.wageFor(p.ovr) * R.range(0.9, 1.1)) / 10) * 10; }
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
    for (const co of G.coaches) { if (co.club) { co.board = Math.max(co.board, 45); co.jobWeeks = Math.max(co.jobWeeks, 0); } }
    SF.Actions.newSeasonCareer(G);
  };

  Game.fixDiv = (G) => G.divs;
})();
