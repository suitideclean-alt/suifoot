/* SuiFoot body and temper (v0.9): temperament (3 kinds), condition (fatigue), injuries that cost rating points, training intensity.
 * Plain functions over player and club objects; state lives in p.tp, p.cond, p.rec, p.ih and club.train / club.tr. */
(function () {
  const SF = globalThis.SF;
  const { CFG, util, R } = SF;
  const Body = (SF.Body = {});

  CFG.subs = 5;          // substitutions per match
  CFG.penChance = 0.012; // a penalty is awarded on this share of attacks

  // ---------- temperament ----------
  Body.TP = ['gent', 'pro', 'hard'];
  const CARD = { gent: 0.5, pro: 1, hard: 1.8 }, RED = { gent: 0.2, pro: 1, hard: 3 }, VAL = { gent: 1.1, pro: 1, hard: 0.85 };
  const MIX = { GK: [40, 55, 5], DF: [18, 50, 32], MF: [25, 50, 25], FW: [30, 52, 18] };
  Body.roll = (pos) => { const m = MIX[pos] || MIX.MF; return R.weighted([0, 1, 2], (i) => m[i]) === 0 ? 'gent' : R.weighted([0, 1], () => 1) === 0 ? 'pro' : 'pro'; };
  Body.roll = function (pos) {
    const m = MIX[pos] || MIX.MF, i = R.weighted([0, 1, 2], (k) => m[k]);
    return Body.TP[i];
  };
  /** old saves have no temperament: derive one from the player id (no random numbers, so loading stays deterministic) */
  Body.tp = function (p) {
    if (p.tp) return p.tp;
    const h = ((p.id * 2654435761) >>> 0) % 100, m = MIX[p.pos] || MIX.MF;
    return (p.tp = h < m[0] ? 'gent' : h < m[0] + m[1] ? 'pro' : 'hard');
  };
  Body.cardF = (p) => CARD[Body.tp(p)];
  Body.redF = (p) => RED[Body.tp(p)];
  Body.valueF = (p) => VAL[Body.tp(p)];

  // ---------- condition ----------
  Body.cond = (p) => (p.cond == null ? 100 : p.cond);
  /** rating points lost for being tired: nothing above 85, then a tenth of a point per missing point */
  Body.condAdj = function (p) { const c = Body.cond(p); return c >= 85 ? 0 : -(85 - c) * 0.1; };
  /** extra tiredness late in a match, worse for players who start it already tired */
  Body.fatigue = function (p, played) {
    const over = Math.max(0, played - 55) / 35;
    return over * 1.6 * (1 + (100 - Body.cond(p)) / 70);
  };
  Body.played = function (p, started) { p.cond = util.clamp(Body.cond(p) - (started ? 9 : 4), 5, 100); };

  // ---------- training ----------
  Body.MODES = ['light', 'bal', 'int'];
  Body.TRAIN = {
    light: { prog: 0.7, rec: 12, inj: 0.75, mood: 0.1 },
    bal: { prog: 1, rec: 8, inj: 1, mood: 0.2 },
    int: { prog: 1.3, rec: 4, inj: 1.35, mood: -0.6 },
  };
  Body.mode = (club) => (club && Body.TRAIN[club.train] ? club.train : 'bal');
  const manual = (G, club) => { const co = club.human && G.coaches.find((c) => c.club === club.id); return !!co && (co.role || 'coach') !== 'owner'; };
  Body.manual = manual;
  /** the computer picks the training of every club that has no human coach */
  Body.auto = function (G, club) {
    const reg = SF.Game.players(G, club).filter((p) => p.inj <= 0).sort((a, b) => b.ovr - a.ovr).slice(0, 14);
    const c = reg.length ? util.avg(reg.map((p) => Body.cond(p))) : 100;
    club.train = c < 62 ? 'light' : c < 76 ? 'bal' : 'int';
  };
  Body.setMode = function (G, co, mode) {
    if (!Body.TRAIN[mode]) return { ok: false, err: 'bad' };
    if ((co.role || 'coach') === 'owner') return { ok: false, err: 'owner_cant' };
    const club = G.clubs[co.club];
    if (!club) return { ok: false, err: 'no_club' };
    club.train = mode;
    return { ok: true };
  };
  Body.avgCond = function (G, club) {
    const reg = SF.Game.players(G, club).sort((a, b) => b.ovr - a.ovr).slice(0, 14);
    return Math.round(util.avg(reg.map((p) => Body.cond(p))));
  };
  /** the mean progress multiplier of the weeks since the season started */
  Body.progressMul = (club) => (club && club.tr && club.tr.n ? club.tr.sum / club.tr.n : 1);
  /** injury odds of a side: training load and tiredness */
  Body.injMul = function (G, club) {
    const f = Body.avgCond(G, club);
    return Body.TRAIN[Body.mode(club)].inj * (1 + (100 - f) / 150);
  };

  /** once per game week, after the matches: training choice, recovery, progress accounting */
  Body.weekly = function (G) {
    const rec = {};
    for (const id of G.clubIds) {
      const club = G.clubs[id];
      if (!manual(G, club)) Body.auto(G, club);
      const m = Body.TRAIN[Body.mode(club)];
      (club.tr = club.tr || { sum: 0, n: 0 });
      club.tr.sum += m.prog; club.tr.n++;
      rec[id] = m;
    }
    for (const pid in G.players) {
      const p = G.players[pid], m = p.club && rec[p.club];
      const r = m ? m.rec : 10;
      p.cond = util.clamp(Body.cond(p) + r + (p.inj > 0 ? 4 : 0), 5, 100);
      if (m && p.club && G.clubs[p.club].human && p.mood != null) p.mood = util.clamp(p.mood + m.mood, 0, 100);
    }
  };
  Body.seasonReset = function (G) {
    for (const pid in G.players) G.players[pid].cond = 100;
    for (const id of G.clubIds) G.clubs[id].tr = { sum: 0, n: 0 };
  };

  // ---------- injuries ----------
  /** severity: a knock (1-2 weeks), a muscle injury (3-5) or a serious one (6-14) */
  Body.rollInjury = function () {
    const r = R.f();
    if (r < 0.6) return { n: R.int(1, 2), sev: 'knock' };
    if (r < 0.9) return { n: R.int(3, 5), sev: 'muscle' };
    return { n: R.int(6, 14), sev: 'serious' };
  };
  Body.sevOf = (n) => (n <= 2 ? 'knock' : n <= 5 ? 'muscle' : 'serious');
  /** the player is hurt: weeks out and rating points lost. A part of a serious loss comes back at the next season turn. */
  Body.hurt = function (G, p, n, club) {
    const sev = Body.sevOf(n);
    const med = SF.Boss && club ? SF.Boss.injMult(club) : 1;
    const weeks = Math.max(1, Math.round(n * med));
    let loss = 0;
    if (sev === 'muscle') loss = R.chance(0.5) ? 1 : 0;
    else if (sev === 'serious') {
      const af = p.age >= 30 ? 1.3 : p.age <= 22 ? 0.7 : 1;
      loss = Math.max(1, Math.round(R.range(2, 5) * af * (club && SF.Boss ? med : 1)));
    }
    if (loss) { p.ovr = Math.max(25, p.ovr - loss); p.rec = (p.rec || 0) + Math.floor(loss * 0.4); }
    p.ih = (p.ih || 0) + 1;
    p.inj = Math.max(p.inj, weeks); p._f = 1;
    return { weeks, loss, sev };
  };
})();
