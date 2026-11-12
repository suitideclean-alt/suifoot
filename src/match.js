/* SuiFoot match engine: minute-by-minute, sector based (GK / DF / MF / FW).
 * Used both for instant simulation and for the live match view. */
(function () {
  const SF = globalThis.SF;
  const { R, CFG, util } = SF;
  const Body = () => SF.Body;

  function sideFrom(G, spec) {
    return {
      club: spec.club,
      xi: spec.xi.map((id) => G.players[id]),
      bench: spec.bench.map((id) => G.players[id]),
      tactic: spec.tactic || 'bal',
      tbonus: spec.tbonus || 0, // coach tactics level
      auto: spec.auto !== false,
      subs: 0, goals: 0, shots: 0, poss: 0, yel: {}, gone: [], used: [], started: spec.xi.slice(), on: {},
      pw: null,
    };
  }

  function power(s) {
    const xi = s.xi;
    let gk = 0, df = 0, mf = 0, fw = 0, best = 0;
    for (const p of xi) {
      const o = p.ovr + SF.Econ.moodAdj(p) + Body().condAdj(p) - Body().fatigue(p, (s.min || 0) - ((s.on && s.on[p.id]) || 0));
      best = Math.max(best, o);
      if (p.pos === 'GK') gk = Math.max(gk, o);
      else if (p.pos === 'DF') df += o;
      else if (p.pos === 'MF') mf += o;
      else fw += o;
    }
    if (!gk) gk = best * 0.35; // outfield player in goal
    let Ap = (fw + 0.45 * mf) / 3.8;
    let Dp = (df + 0.35 * mf) / 5.4;
    let Mp = (mf + 0.25 * (fw + df)) / 5.5;
    if (s.tactic === 'att') { Ap *= 1.08; Dp *= 0.94; }
    else if (s.tactic === 'def') { Ap *= 0.92; Dp *= 1.07; }
    // star players: up to CFG.starFree of them add flair; beyond that the dressing room breaks down
    const ns = xi.filter((p) => p.ovr >= CFG.starOvr).length;
    const k = Math.min(ns, CFG.starFree);
    Ap += CFG.starFlair * k; Mp += CFG.starFlair * 0.7 * k; Dp += CFG.starFlair * 0.35 * k;
    const over = Math.max(0, ns - CFG.starFree);
    const tb = (1 + 0.015 * s.tbonus) * (1 - CFG.starPenalty * over);
    s.stars = ns;
    s.pw = { gk: gk * (1 - CFG.starPenalty * over), Ap: Ap * tb, Dp: Dp * tb, Mp: Mp * tb };
    return s.pw;
  }

  function Match(G, home, away, opts) {
    opts = opts || {};
    this.G = G;
    this.h = sideFrom(G, home);
    this.a = sideFrom(G, away);
    this.neutral = !!opts.neutral;
    this.knockout = !!opts.knockout;
    this.derby = !!opts.derby;
    this.min = 0;
    this.events = [];
    this.done = false;
    this.et = false;
    this.pens = null;
    this.phase = 'ft'; // 'ft' | 'et' | 'pens'
    for (const s of [this.h, this.a]) {
      const B = Body();
      s.cf = util.avg(s.xi.map((p) => B.cardF(p))); s.rf = util.avg(s.xi.map((p) => B.redF(p)));
      s.im = G.clubs && G.clubs[s.club] ? B.injMul(G, G.clubs[s.club]) : 1;
    }
    this.refresh();
  }

  // tactics are a triangle: attack beats balanced, balanced beats defensive, defensive beats attack
  const BEATS = { att: 'bal', bal: 'def', def: 'att' };
  Match.prototype.refresh = function () {
    this.h.min = this.a.min = this.min;
    power(this.h); power(this.a);
    for (const [s, o] of [[this.h, this.a], [this.a, this.h]]) {
      if (BEATS[s.tactic] === o.tactic) { s.pw.Ap *= 1.025; s.pw.Mp *= 1.025; s.pw.Dp *= 1.025; s.edge = 1; } else s.edge = BEATS[o.tactic] === s.tactic ? -1 : 0;
    }
  };

  Match.prototype.ev = function (e) { e.min = this.min; this.events.push(e); return e; };

  Match.prototype.sub = function (side, outId, inId) {
    const s = side === 'h' ? this.h : this.a;
    if (s.subs >= CFG.subs) return false;
    const io = s.xi.findIndex((p) => p.id === outId);
    const ib = s.bench.findIndex((p) => p.id === inId);
    if (io < 0 || ib < 0) return false;
    const pin = s.bench[ib], pout = s.xi[io];
    s.xi[io] = pin; s.bench.splice(ib, 1); s.subs++; s.used.push(pin.id); s.on[pin.id] = this.min;
    this.refresh();
    this.ev({ t: 'sub', side, pid: pin.id, pid2: pout.id });
    return true;
  };

  Match.prototype.remove = function (side, p, replace) {
    const s = side === 'h' ? this.h : this.a;
    const i = s.xi.indexOf(p);
    if (i < 0) return;
    s.xi.splice(i, 1);
    s.gone.push(p.id);
    if (replace && s.subs < CFG.subs && s.bench.length) {
      const same = s.bench.filter((b) => b.pos === p.pos);
      const pool = same.length ? same : s.bench.filter((b) => b.pos !== 'GK');
      if (pool.length) {
        const pin = pool.reduce((a, b) => (b.ovr > a.ovr ? b : a));
        s.bench.splice(s.bench.indexOf(pin), 1);
        s.xi.push(pin); s.subs++; s.used.push(pin.id); s.on[pin.id] = this.min;
        this.ev({ t: 'sub', side, pid: pin.id, pid2: p.id, forced: 1 });
      }
    }
    this.refresh();
  };

  Match.prototype.setTactic = function (side, t) { const s = side === 'h' ? this.h : this.a; s.tactic = t; this.refresh(); };

  Match.prototype.attackFrom = function (side) {
    const att = side === 'h' ? this.h : this.a;
    const def = side === 'h' ? this.a : this.h;
    att.poss++;
    const home = side === 'h' && !this.neutral;
    const ratio = Math.exp(CFG.gam * (att.pw.Ap - def.pw.Dp));
    const gkf = Math.pow(def.pw.Dp / Math.max(15, def.pw.gk), 0.6);
    let pg = CFG.baseGoal * ratio * gkf * (home ? CFG.homeAdv : 1);
    pg = util.clamp(pg, 0.015, 0.5);
    if (R.chance(CFG.penChance)) return this.penalty(side, att, def);
    if (R.chance(0.72)) att.shots++;
    if (R.chance(pg)) {
      // scorer
      const sc = R.weighted(att.xi, (p) => (p.pos === 'GK' ? 0 : p.pos === 'DF' ? 0.08 * p.ovr : p.pos === 'MF' ? 0.35 * p.ovr : p.ovr * 1.0));
      const assist = R.chance(0.7) ? R.weighted(att.xi.filter((p) => p !== sc), (p) => (p.pos === 'GK' ? 0 : p.pos === 'MF' ? 1.2 * p.ovr : p.ovr)) : null;
      att.goals++;
      this.ev({ t: 'goal', side, pid: sc.id, pid2: assist ? assist.id : 0 });
    } else if (att.shots && R.chance(0.34)) {
      // a chance worth telling: saved, wide or off the woodwork
      const sh = R.weighted(att.xi, (p) => (p.pos === 'GK' ? 0 : p.pos === 'DF' ? 0.1 * p.ovr : p.pos === 'MF' ? 0.4 * p.ovr : p.ovr));
      const gkp = def.xi.find((p) => p.pos === 'GK');
      this.ev({ t: 'shot', side, pid: sh.id, pid2: gkp ? gkp.id : 0, r: R.pick(['save', 'save', 'miss', 'miss', 'post', 'block']) });
    }
  };

  /** a penalty: the best finisher takes it; the fouling defender may be booked */
  Match.prototype.penalty = function (side, att, def) {
    const taker = att.xi.filter((p) => p.pos !== 'GK').reduce((a, b) => (b.ovr + (b.pos === 'FW' ? 3 : 0) > a.ovr + (a.pos === 'FW' ? 3 : 0) ? b : a));
    const gk = def.xi.find((p) => p.pos === 'GK');
    const foul = R.weighted(def.xi, (x) => (x.pos === 'DF' ? 1.4 : x.pos === 'MF' ? 1 : x.pos === 'GK' ? 0.3 : 0.4) * SF.Body.cardF(x));
    att.shots++;
    const pOk = util.clamp(0.76 + (taker.ovr - (gk ? gk.ovr : 55)) / 300, 0.6, 0.88);
    const r = R.chance(pOk) ? 'goal' : R.pick(['save', 'miss', 'post']);
    this.ev({ t: 'pen', side, pid: taker.id, pid2: foul.id, r });
    if (r === 'goal') { att.goals++; this.ev({ t: 'goal', side, pid: taker.id, pid2: 0, pen: 1 }); }
    if (R.chance(0.35)) this.card(side === 'h' ? 'a' : 'h', def, foul);
  };

  /** a yellow card; the second one is a red */
  Match.prototype.card = function (side, s, p) {
    s.yel[p.id] = (s.yel[p.id] || 0) + 1;
    if (s.yel[p.id] >= 2) { this.ev({ t: 'red', side, pid: p.id, second: 1 }); this.remove(side, p, false); }
    else this.ev({ t: 'yellow', side, pid: p.id });
  };

  Match.prototype.step = function () {
    if (this.done) return [];
    const start = this.events.length;
    this.min++;
    const m = this.min;
    const h = this.h, a = this.a;
    const rate = (this.et ? 0.8 : 1) * CFG.baseAttack;
    if (R.chance(rate)) {
      const d = h.pw.Mp + (this.neutral ? 0 : CFG.homeMid) - a.pw.Mp;
      this.attackFrom(R.chance(1 / (1 + Math.exp(-CFG.gamM * d))) ? 'h' : 'a');
    }
    for (const side of ['h', 'a']) {
      const s = side === 'h' ? h : a;
      const B = Body();
      if (R.chance((this.derby ? 0.025 : 0.019) * (s.cf || 1))) {
        const p = R.weighted(s.xi, (x) => (x.pos === 'GK' ? 0.2 : x.pos === 'DF' ? 1.3 : x.pos === 'MF' ? 1.1 : 0.8) * B.cardF(x));
        this.card(side, s, p);
      }
      if (s.xi.length > 8 && R.chance(0.0005 * (s.rf || 1))) {
        const p = R.weighted(s.xi, (x) => B.redF(x));
        this.ev({ t: 'red', side, pid: p.id });
        this.remove(side, p, false);
      }
      if (R.chance(0.0006 * (s.im || 1)) && s.xi.length > 8) {
        const p = R.weighted(s.xi, (x) => 1 + (100 - B.cond(x)) / 60);
        const inj = B.rollInjury();
        this.ev({ t: 'inj', side, pid: p.id, n: inj.n });
        this.remove(side, p, true);
      }
      if (s.auto && (m === 62 || m === 74) && s.subs < (m === 62 ? 3 : CFG.subs) && s.bench.length) {
        // fresh legs: replace the weakest outfield starter with a better/equal bench player of the same position
        const out = s.xi.filter((x) => x.pos !== 'GK').sort((x, y) => (x.ovr + B.condAdj(x)) - (y.ovr + B.condAdj(y)))[0];
        const cand = out && s.bench.filter((b) => b.pos === out.pos).sort((x, y) => y.ovr - x.ovr)[0];
        if (cand && cand.ovr + B.condAdj(cand) >= out.ovr + B.condAdj(out) - 4) this.sub(side, out.id, cand.id);
      }
    }
    if (m % 15 === 0) this.refresh();
    const limit = this.et ? 120 : 90;
    if (m >= limit) {
      if (this.knockout && h.goals === a.goals) {
        if (!this.et) { this.et = true; this.phase = 'et'; this.ev({ t: 'et' }); }
        else this.shootout();
      } else this.done = true;
    }
    return this.events.slice(start);
  };

  Match.prototype.shootout = function () {
    this.phase = 'pens';
    const kick = (s, o) => {
      const fw = util.avg(s.xi.map((p) => p.ovr));
      const gk = o.xi.find((p) => p.pos === 'GK');
      return R.chance(util.clamp(0.74 + (fw - (gk ? gk.ovr : 50)) / 400, 0.6, 0.85));
    };
    let hp = 0, ap = 0, hk = [], ak = [];
    for (let i = 0; i < 5; i++) { const x = kick(this.h, this.a); hk.push(x); hp += x; const y = kick(this.a, this.h); ak.push(y); ap += y; }
    let g = 0;
    while (hp === ap && g++ < 30) { const x = kick(this.h, this.a); hk.push(x); hp += x; const y = kick(this.a, this.h); ak.push(y); ap += y; }
    if (hp === ap) { if (R.chance(0.5)) hp++; else ap++; }
    this.pens = { h: hp, a: ap, hk, ak };
    this.ev({ t: 'pens', h: hp, a: ap });
    this.done = true;
  };

  Match.prototype.run = function () { let g = 0; while (!this.done && g++ < 400) this.step(); return this; };

  Match.prototype.winner = function () {
    if (this.h.goals > this.a.goals) return 'h';
    if (this.a.goals > this.h.goals) return 'a';
    if (this.pens) return this.pens.h > this.pens.a ? 'h' : 'a';
    return null;
  };

  Match.prototype.summary = function () {
    const tot = this.h.poss + this.a.poss || 1;
    return {
      hg: this.h.goals, ag: this.a.goals, pens: this.pens ? { h: this.pens.h, a: this.pens.a } : null, et: this.et,
      events: this.events, hs: this.h.shots, as: this.a.shots, hp: Math.round((this.h.poss / tot) * 100),
    };
  };

  SF.Match = Match;
  SF.matchPower = power;
})();
