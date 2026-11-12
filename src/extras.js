/* SuiFoot extras (v0.3): morale, scouting, goals and achievements, rivals, idols and captain, market drama,
 * academy, player history, career end. Everything here is plain functions over the game state G. */
(function () {
  const SF = globalThis.SF;
  const { R, CFG, util } = SF;
  const B = SF.Bank, E = SF.Econ;
  const X = (SF.Extras = {});
  const Game = () => SF.Game;
  const ok = (o) => Object.assign({ ok: true }, o || {});
  const no = (err, o) => Object.assign({ ok: false, err }, o || {});

  X.toast = function (G, cid, k, p) { (G.tq = G.tq || []).push({ c: cid, k, p: p || {} }); if (G.tq.length > 30) G.tq.shift(); };

  // ---------- morale ----------
  X.mood = (p) => (p.mood == null ? 70 : p.mood);
  X.moodLabel = (m) => (m >= 80 ? 'mood_great' : m >= 60 ? 'mood_good' : m >= 40 ? 'mood_ok' : m >= 25 ? 'mood_bad' : 'mood_angry');

  /** called once per week for human clubs; played = the club had a match this week */
  X.moodTick = function (G, club, played, pts) {
    const sq = Game().players(G, club);
    const capt = G.players[club.capt];
    const captOk = capt && capt.club === club.id && X.mood(capt) >= 60;
    for (const p of sq) {
      const before = X.mood(p);
      let d = (65 - before) * 0.03;
      if (played) {
        const rank = sq.filter((q) => q.ovr > p.ovr).length;
        if (p.pl) d += 1.2;
        else if (rank < 13 && p.inj <= 0 && p.sus <= 0) d -= 1.6;
        else if (rank < 18) d -= 0.3;
        d += pts === 3 ? 0.8 : pts === 0 ? -0.8 : 0;
        if (E.isStar(p) && !p.pl && p.inj <= 0) d -= 1.5; // stars hate the bench
      }
      const fair = p.wage / Math.max(40, E.wage(p));
      if (fair < 0.85) d -= 0.5; else if (fair > 1.1) d += 0.3;
      if (E.isIdol(p)) d += 0.5;
      if (captOk) d += 0.3;
      if (SF.Boss) d -= 1.2 * SF.Boss.neglect(club); // an owner who sits on cash demoralises the squad
      p.mood = util.clamp(Math.round((before + d) * 10) / 10, 0, 100);
      if (before >= 25 && p.mood < 25) Game().news(G, 'n_unhappy', { name: p.n }, club.human);
      if (p.mood < 12 && !p.listed && !p.loan) {
        p.listed = E.value(p); p.wo = 1;
        Game().news(G, 'n_wants_out', { name: p.n }, club.human);
      }
    }
  };
  X.teamMood = (G, club) => util.avg(Game().players(G, club).map(X.mood));

  // ---------- goals (short objectives) and achievements (medals) ----------
  const GOALS = {
    win3: { t: 'streak', n: 3, xp: 40, rep: 0.6 }, win5: { t: 'streak', n: 5, xp: 90, rep: 1.2 },
    unb5: { t: 'unb', n: 5, xp: 50, rep: 0.6 }, cs3: { t: 'cs', n: 3, xp: 40, rep: 0.5 },
    away2: { t: 'away', n: 2, xp: 35, rep: 0.5 }, hg3: { t: 'hg', n: 3, xp: 60, rep: 0.8 },
    gf10: { t: 'gf', n: 10, xp: 30, rep: 0.3 }, eu1: { t: 'euw', n: 1, xp: 60, rep: 0.8 },
    derby1: { t: 'derby', n: 1, xp: 60, rep: 1 }, upset2: { t: 'upset', n: 2, xp: 70, rep: 1 },
  };
  X.GOALS = GOALS;
  const ACH = ['a_first_win', 'a_streak8', 'a_hattrick', 'a_champion', 'a_cup', 'a_euro', 'a_promo', 'a_rich', 'a_star', 'a_homegrown', 'a_goals10', 'a_seasons5', 'a_seasons10', 'a_derby', 'a_unbeaten', 'a_scout', 'a_idol'];
  X.ACH = ACH;

  X.unlock = function (G, co, key) {
    co.ach = co.ach || {};
    if (co.ach[key]) return;
    co.ach[key] = { s: G.season, w: G.week };
    co.xp += 50;
    Game().addRep(G, co, 0.5, 'ach');
    Game().news(G, 'n_ach', { tk: key }, co.id);
    X.toast(G, co.id, 'toast_ach', { k: key });
  };

  X.fillGoals = function (G, co) {
    co.goals = co.goals || [];
    const club = co.club ? G.clubs[co.club] : null;
    if (!club) return;
    const pool = Object.keys(GOALS).filter((k) => {
      if (co.goals.some((g) => g.k === k)) return false;
      if (k === 'eu1') return G.eu && !G.eu.idle && G.eu.q.includes(club.id);
      if (k === 'derby1') return !!club.rival;
      if (k === 'hg3') return Game().players(G, club).some((p) => p.hg);
      return true;
    });
    while (co.goals.length < 3 && pool.length) co.goals.push({ k: pool.splice(Math.floor(R.f() * pool.length), 1)[0], p: 0 });
  };

  function bump(G, co, type, amt, reset) {
    for (const g of co.goals || []) {
      const d = GOALS[g.k];
      if (d.t !== type) continue;
      if (reset) g.p = 0; else g.p += amt;
      if (g.p >= d.n) {
        co.xp += d.xp; co.gdone = (co.gdone || 0) + 1;
        Game().addRep(G, co, d.rep, 'goal');
        Game().news(G, 'n_goal_done', { tk: 'goal_' + g.k }, co.id);
        X.toast(G, co.id, 'toast_goal', { k: g.k, xp: d.xp });
        co.goals.splice(co.goals.indexOf(g), 1);
        if (co.gdone >= 10) X.unlock(G, co, 'a_goals10');
        X.fillGoals(G, co);
      }
    }
  }

  /** after every match of a human club */
  X.onMatch = function (G, co, i) {
    const win = i.pts === 3;
    bump(G, co, 'streak', 1, !win);
    bump(G, co, 'unb', 1, i.pts === 0);
    if (i.ga === 0) bump(G, co, 'cs', 1);
    if (win && !i.home && i.k === 'L') bump(G, co, 'away', 1);
    bump(G, co, 'gf', i.gf);
    if (win && i.k === 'E') bump(G, co, 'euw', 1);
    if (win && i.derby) { bump(G, co, 'derby', 1); X.unlock(G, co, 'a_derby'); }
    if (win && i.upset) bump(G, co, 'upset', 1);
    co.wstreak = win ? (co.wstreak || 0) + 1 : 0;
    if (win) X.unlock(G, co, 'a_first_win');
    if (co.wstreak >= 8) X.unlock(G, co, 'a_streak8');
  };
  X.onHomegrownGoal = function (G, co) { bump(G, co, 'hg', 1); };

  // ---------- scouting ----------
  /** exact potential is known for own players, veterans (pot = ovr) and scouted players; otherwise a 16-point range */
  X.potInfo = function (G, co, p) {
    if (p.age >= 24 || (co && p.club && p.club === co.club) || (co && (p.sc || []).includes(co.id)) || (p.acad && co && G.clubs[co.club] && p.acad === co.club)) return { exact: true, v: p.pot };
    const lo = util.clamp(p.pot - 8 + (((p.id * 2654435761) >>> 0) % 9), 30, 95);
    return { exact: false, lo: Math.max(p.ovr, lo - 4), hi: Math.min(95, lo + 12) };
  };

  X.scoutPlayer = function (G, co, pid) {
    const club = co.club ? G.clubs[co.club] : null, p = G.players[pid];
    if (!club || !p) return no('bad');
    p.sc = p.sc || [];
    if (p.sc.includes(co.id)) return no('already_scouted');
    const cost = CFG.scoutOne[club.div];
    if (B.bal(G, club.id) < cost) return no('no_funds', { cost });
    B.debit(G, club.id, cost, 'scout');
    p.sc.push(co.id);
    co.scouted = (co.scouted || 0) + 1;
    if (co.scouted >= 10) X.unlock(G, co, 'a_scout');
    return ok({ cost });
  };

  X.scoutReport = function (G, co) {
    const club = co.club ? G.clubs[co.club] : null;
    if (!club) return no('no_club');
    const now = G.season * 40 + G.week;
    if (co.gemAt != null && now - co.gemAt < 3) return no('scout_wait');
    const cost = CFG.scoutCost[club.div];
    if (B.bal(G, club.id) < cost) return no('no_funds', { cost });
    const pool = Object.values(G.players).filter((p) => p.age <= 21 && p.pot >= p.ovr + 10 && p.club !== club.id && (!p.club || !G.clubs[p.club].foreign) && !(p.sc || []).includes(co.id) && !p.acad)
      .sort((a, b) => b.pot - a.pot).slice(0, 30);
    if (pool.length < 1) return no('nothing_found');
    B.debit(G, club.id, cost, 'scout');
    const gems = [];
    for (let i = 0; i < 3 && pool.length; i++) { const p = pool.splice(Math.floor(R.f() * pool.length), 1)[0]; p.sc = (p.sc || []).concat(co.id); gems.push(p.id); }
    co.gems = gems; co.gemAt = now;
    co.scouted = (co.scouted || 0) + gems.length;
    if (co.scouted >= 10) X.unlock(G, co, 'a_scout');
    return ok({ gems, cost });
  };

  // ---------- rivals ----------
  X.pairRivals = function (G) {
    for (let d = 0; d < CFG.DIVS; d++) {
      const ids = G.divs[d], keep = new Set();
      for (const id of ids) { const r = G.clubs[id].rival; if (r && G.clubs[r] && G.clubs[r].rival === id && G.clubs[r].div === d) keep.add(id); }
      const free = R.shuffle(ids.filter((i) => !keep.has(i)));
      for (let i = 0; i + 1 < free.length; i += 2) { G.clubs[free[i]].rival = free[i + 1]; G.clubs[free[i + 1]].rival = free[i]; }
      if (free.length % 2) G.clubs[free[free.length - 1]].rival = null;
    }
  };
  X.isDerby = (G, a, b) => !!(G.clubs[a] && G.clubs[a].rival === b);

  // ---------- captain and idols ----------
  X.autoCaptain = function (G, club) {
    const cur = G.players[club.capt];
    if (cur && cur.club === club.id) return;
    const best = Game().players(G, club).filter((p) => p.age >= 23).sort((a, b) => (b.yrs || 0) - (a.yrs || 0) || b.ovr - a.ovr)[0];
    club.capt = best ? best.id : 0;
  };
  X.onLeave = function (G, club, p, sold) {
    if (!club || !club.human) return;
    if (E.isIdol(p) && sold) {
      club.fans = Math.round(club.fans * 0.97);
      for (const q of Game().players(G, club)) q.mood = Math.max(0, X.mood(q) - 4);
      Game().news(G, 'n_idol_sold', { name: p.n }, club.human);
    }
    if (club.capt === p.id) club.capt = 0;
  };

  // ---------- market drama: shortlist, rival interest, release clauses ----------
  X.weeklyHot = function (G) {
    const ai = G.clubIds.filter((id) => !G.clubs[id].human);
    for (const co of G.coaches) {
      if (!co.club || co.vac > 0) continue;
      co.watch = (co.watch || []).filter((pid) => G.players[pid]);
      for (const pid of co.watch) {
        const p = G.players[pid];
        if (!p.club || G.clubs[p.club].human || G.clubs[p.club].foreign) continue;
        const owner = G.clubs[p.club];
        if (p.hot) {
          if (--p.hot.left > 0) continue;
          const buyer = G.clubs[p.hot.club]; delete p.hot;
          const fee = Math.round(E.value(p) * 1.15);
          if (buyer && buyer.squad.length < CFG.SQUAD_MAX && B.bal(G, buyer.id) > fee * 1.2 && owner.squad.length > CFG.SQUAD_MIN + 1) {
            Game().moveClub(G, p, owner, buyer, fee);
            Game().news(G, 'n_hot_lost', { name: p.n, club: buyer.name }, co.id);
          }
        } else if (!p.loan && R.chance(0.1)) {
          const cands = ai.filter((id) => id !== owner.id && B.bal(G, id) > E.value(p) * 1.5 && G.clubs[id].squad.length < CFG.SQUAD_MAX);
          if (!cands.length) continue;
          const b = R.pick(cands);
          p.hot = { club: b, left: 3 };
          Game().news(G, 'n_hot', { name: p.n, club: G.clubs[b].name }, co.id);
          X.toast(G, co.id, 'toast_hot', { name: p.n });
        }
      }
    }
  };

  // ---------- academy: youngsters wait to be promoted ----------
  X.academyIntake = function (G, club) {
    for (const pid of club.acad || []) { const p = G.players[pid]; if (p && p.acad === club.id) delete G.players[pid]; }
    club.acad = [];
    const coach = Game().humanOf(G, club.id);
    const yl = club.facility.youth;
    const n = 3 + (yl >= 3 ? 1 : 0) + (yl >= 5 ? 1 : 0) + (SF.Boss ? SF.Boss.acadExtra(club) : 0);
    for (let i = 0; i < n; i++) {
      const pos = R.weighted(['GK', 'DF', 'MF', 'FW'], (x) => (x === 'GK' ? 1 : 3));
      const pot = util.clamp(Math.round(R.gauss(CFG.youthPot[club.div] + (SF.Actions.facEff(yl) - 1) * 1.2 + (coach ? coach.sk.youth * 1.5 : 0) + (SF.Boss ? SF.Boss.acadPot(club) : 0), CFG.youthSd)), 40, 93);
      const ovr = util.clamp(pot - R.int(14, 28), 28, 70);
      const p = SF.World.newPlayer(G, { pos, ovr, age: R.int(16, 18), club: null, ct: 3, pot });
      p.wage = 40; p.acad = club.id; p.hg = 1;
      club.acad.push(p.id);
      if (coach && p.pot >= 75) Game().news(G, 'n_youth2', { name: p.n, age: p.age, pot: p.pot }, coach.id);
    }
  };
  X.promote = function (G, co, pid) {
    const club = co.club ? G.clubs[co.club] : null, p = G.players[pid];
    if (!club || !p || p.acad !== club.id) return no('bad');
    if (club.squad.length >= CFG.SQUAD_MAX) return no('squad_full');
    club.squad.push(p.id); p.club = club.id; delete p.acad;
    club.acad = club.acad.filter((x) => x !== pid);
    Game().news(G, 'n_promoted_youth', { name: p.n }, co.id);
    return ok();
  };

  // ---------- history ----------
  /** season record kept for players of human clubs (keeps the save small) */
  X.archive = function (G) {
    for (const co of G.coaches) {
      const club = co.club ? G.clubs[co.club] : null;
      if (!club) continue;
      for (const p of Game().players(G, club)) {
        (p.sh = p.sh || []).push({ s: G.season, c: club.id, a: p.ap, g: p.g, o: p.ovr });
        (p.vh = p.vh || []).push([G.season, E.value(p)]);
        if (p.sh.length > 14) p.sh.shift();
        if (p.vh.length > 14) p.vh.shift();
      }
    }
  };

  // ---------- career end ----------
  X.legacy = function (co) {
    const tr = (k) => co.trophies.filter((t) => t.k === k).length;
    const promos = co.hist.filter((h, i) => i > 0 && h.d < co.hist[i - 1].d).length;
    return Math.round(tr('league') * 10 + tr('cup') * 4 + tr('euro') * 15 + promos * 3 + co.hist.length + co.rep / 10 + Object.keys(co.ach || {}).length * 2);
  };
  X.summary = function (G, co) {
    const tr = (k) => co.trophies.filter((t) => t.k === k).length;
    return { name: co.name, seasons: co.hist.length, titles: tr('league'), cups: tr('cup'), euros: tr('euro'), rep: Math.round(co.rep), ach: Object.keys(co.ach || {}).length, legacy: X.legacy(co), club: co.club ? G.clubs[co.club].name : '-', year: G.season };
  };
  X.bonusFor = (legacy) => ({ rep: Math.min(15, Math.floor(legacy / 12)), xp: Math.min(600, legacy * 5) });
})();
