/* SuiFoot world: fictional clubs, invented player names, player/club generation and economy formulas.
 * Everything here is original: no real clubs, players, badges or kits. */
(function () {
  const SF = globalThis.SF;
  const { R, CFG, util } = SF;

  const FIRST = ['Adrian', 'Aleksi', 'Anton', 'Arlo', 'Bastian', 'Bruno', 'Caio', 'Callum', 'Dario', 'Davi', 'Dmitri', 'Elias', 'Emil', 'Enzo', 'Felix', 'Finn', 'Gabin', 'Hugo', 'Ibrahim', 'Ivo', 'Jonas', 'Joris', 'Kai', 'Kasper', 'Leon', 'Lucas', 'Luka', 'Mateo', 'Milo', 'Nico', 'Noel', 'Oscar', 'Otto', 'Pablo', 'Pedro', 'Rafael', 'Remy', 'Rui', 'Samir', 'Sven', 'Tiago', 'Theo', 'Viktor', 'Willem', 'Yann', 'Yusuf', 'Zane', 'Ruben', 'Tomas', 'Marek'];
  const S1 = ['Ba', 'Be', 'Bo', 'Ca', 'Ce', 'Da', 'De', 'Do', 'Fa', 'Ga', 'Ge', 'Ha', 'Ka', 'Ke', 'La', 'Le', 'Lo', 'Ma', 'Me', 'Mo', 'Na', 'Ne', 'No', 'Pa', 'Pe', 'Ra', 'Re', 'Ro', 'Sa', 'Se', 'So', 'Ta', 'Te', 'To', 'Va', 'Ve', 'Vo', 'Za', 'Ze', 'Bra', 'Dro', 'Gri', 'Tro'];
  const S2 = ['bor', 'dan', 'gar', 'lin', 'mar', 'nor', 'pen', 'ran', 'sil', 'tan', 'ver', 'wen', 'zor', 'cal', 'dor', 'fen', 'har', 'kel', 'lan', 'mon', 'pol', 'rin', 'sen', 'tol', 'vik', 'berg', 'lund', 'mer'];
  const S3 = ['', '', '', 'o', 'a', 'ez', 'ski', 'ens', 'ini', 'er', 'ton', 'ov', 'es', 'i'];
  const PRE = ['Aster', 'Bryn', 'Cald', 'Dun', 'Elm', 'Fen', 'Glen', 'Hal', 'Iron', 'Kes', 'Lark', 'Mar', 'Nor', 'Oak', 'Pen', 'Quil', 'Ros', 'Sel', 'Thorn', 'Ulm', 'Vale', 'Wyn', 'Yar', 'Zan'];
  const SUF = ['ford', 'mouth', 'ton', 'haven', 'wick', 'dale', 'bridge', 'port', 'field', 'stead', 'holm', 'crest'];
  const KIND = ['FC', 'United', 'Athletic', 'Rovers', 'Wanderers', 'Town', 'Sporting', 'Union', 'Racing', 'Rangers'];

  const w = (o) => { for (const k in o) w[k] = o[k]; };

  function playerName() { return R.pick(FIRST) + ' ' + R.pick(S1) + R.pick(S2) + R.pick(S3); }

  const E = (SF.Econ = {
    value(p) {
      let v = 7500 * SF.Q.exp(0.11 * (p.ovr - 40));
      const a = p.age;
      const af = a <= 21 ? 1.25 : a <= 25 ? 1.1 : a <= 29 ? 1 : a === 30 ? 0.8 : a === 31 ? 0.65 : a === 32 ? 0.5 : a === 33 ? 0.35 : 0.2;
      v *= af;
      if (E.isStar(p)) v *= CFG.starValue;
      if (a <= 24) v *= 1 + Math.max(0, p.pot - p.ovr) * 0.012;
      v *= SF.Body.valueF(p);
      return Math.max(500, Math.round(v / 100) * 100);
    },
    moodAdj(p) { const m = p.mood == null ? 70 : p.mood; return m < 35 ? -(35 - m) / 12 : 0; }, // unhappy players play worse
    clause(p) { return Math.round((E.value(p) * 2.2) / 100) * 100; }, // release clause: pay it and the club cannot refuse
    isIdol(p) { return (p.yrs || 0) >= 4 && p.age >= 24; },
    tagOf(p) {
      if (E.isIdol(p)) return 'idol';
      if (E.isStar(p)) return 'star';
      if (p.age <= 21 && p.pot >= p.ovr + 10) return 'prospect';
      if (p.gt >= 30 && p.pos === 'FW') return 'scorer';
      if (p.age >= 32) return 'veteran';
      if (p.apt >= 80) return 'regular';
      return p.age <= 23 ? 'young' : 'prime';
    },
    isStar(p) { return p.ovr >= CFG.starOvr; },
    wage(p) { return Math.max(40, Math.round((E.wageFor(p.ovr) * (p.ovr >= CFG.starOvr ? CFG.starWage : 1)) / 10) * 10); },
    starCount(list) { return list.filter((p) => p.ovr >= CFG.starOvr).length; },
    wageFor(ovr) { return Math.max(40, Math.round((120 * SF.Q.exp(0.065 * (ovr - 30))) / 10) * 10); },
    strength(G, club) {
      const sq = club.squad.map((id) => G.players[id]).sort((a, b) => b.ovr - a.ovr);
      return util.avg(sq.slice(0, 14).map((p) => p.ovr));
    },
  });

  const POSN = { GK: 2, DF: 7, MF: 7, FW: 6 };

  SF.World = {
    playerName,
    newPlayer(G, o) {
      const age = o.age != null ? o.age : util.clamp(Math.round(R.gauss(26, 4.5)), 17, 36);
      const ovr = util.clamp(Math.round(o.ovr), 25, 93);
      let pot = ovr;
      if (age < 28) pot = Math.min(95, ovr + Math.round(Math.max(0, 27 - age) * R.range(0.4, 1.5)));
      if (o.pot != null) pot = Math.max(ovr, o.pot);
      const p = {
        id: G.nextPid++, n: playerName(), pos: o.pos, age, ovr, pot,
        wage: 0, ct: o.ct || R.int(1, 4), club: o.club || null,
        mood: 70, tp: SF.Body.roll(o.pos), cond: 100, yrs: 0, inj: 0, sus: 0, yc: 0, g: 0, ap: 0, gt: 0, apt: 0, ask: Math.round(R.range(0.95, 1.3) * 100) / 100, listed: 0,
      };
      p.wage = E.wage(p);
      G.players[p.id] = p;
      return p;
    },
    makeSquad(G, club, meanOvr) {
      for (const pos in POSN) {
        for (let i = 0; i < POSN[pos]; i++) {
          const p = SF.World.newPlayer(G, { pos, ovr: meanOvr + R.gauss(0, 6) - (i >= 3 ? 3 : 0), club: club.id });
          club.squad.push(p.id);
        }
      }
    },
    newFreeAgent(G, minOvr, maxOvr, forcePos) {
      const pos = forcePos || R.weighted(['GK', 'DF', 'MF', 'FW'], (x) => (x === 'GK' ? 1 : 3));
      const p = SF.World.newPlayer(G, { pos, ovr: R.range(minOvr, maxOvr), ct: 0 });
      G.free.push(p.id);
      return p;
    },
    clubName(used) {
      for (let i = 0; i < 200; i++) {
        const base = R.pick(PRE) + R.pick(SUF);
        const nm = base + ' ' + R.pick(KIND);
        if (!used.has(base)) { used.add(base); return nm; }
      }
      return 'Club ' + used.size;
    },
    makeForeign(G, idx, nat) {
      const used = (G._usedNames = G._usedNames || new Set());
      const hue = Math.round((idx * 137.508) % 360);
      const id = 'e' + idx;
      const club = {
        id, name: SF.World.clubName(used), div: 0, foreign: 1, nat,
        c1: `hsl(${hue} 62% 42%)`, c2: R.chance(0.5) ? '#ffffff' : '#111827',
        squad: [], fans: 30000, cap: 40000, price: 3, facility: { youth: 3, train: 3 }, build: null, lastRevenue: 0, hist: [], title: 0, cups: 0, human: 0, form: [], rev: 0, style: R.weighted(['att', 'bal', 'def'], (x) => ({ att: 3, bal: 4, def: 3 }[x])),
      };
      G.clubs[id] = club;
      SF.World.makeSquad(G, club, CFG.divOvr[0] + R.gauss(0, 2.2));
      return club;
    },
    refreshForeign(G) {
      for (const id of G.euIds) {
        const c = G.clubs[id];
        for (const pid of c.squad) delete G.players[pid];
        c.squad = [];
        SF.World.makeSquad(G, c, CFG.divOvr[0] + R.gauss(0, 2.2));
      }
    },
    makeClub(G, idx, div) {
      const used = (G._usedNames = G._usedNames || new Set());
      const hue = Math.round((idx * 137.508) % 360);
      const club = {
        id: 'c' + idx, name: SF.World.clubName(used), div,
        c1: `hsl(${hue} 62% 42%)`, c2: R.chance(0.5) ? '#ffffff' : '#111827',
        squad: [], fans: 0, cap: 0, price: 0, facility: { youth: [3, 2, 1, 1][div], train: [3, 2, 1, 1][div] },
        build: null, lastRevenue: 0, hist: [], title: 0, cups: 0, human: 0, rival: null, capt: 0, acad: [],
        style: R.weighted(['att', 'bal', 'def'], (x) => ({ att: 3, bal: 4, def: 3 }[x])),
      };
      const off = R.gauss(0, 2.6);
      club.fans = Math.round(CFG.fans[div] * R.range(0.8, 1.25));
      club.cap = Math.round((CFG.cap[div] * R.range(0.85, 1.2)) / 500) * 500;
      club.price = CFG.refPrice[div];
      G.clubs[club.id] = club;
      SF.World.makeSquad(G, club, CFG.divOvr[div] + off);
      SF.Bank.open(G, club.id, Math.round(CFG.startCash[div] * R.range(0.8, 1.25)), false);
      return club;
    },
    generate(G) {
      G.clubs = {}; G.players = {}; G.nextPid = 1; G.free = [];
      SF.Bank.init(G);
      let idx = 0;
      for (let d = 0; d < CFG.DIVS; d++) for (let i = 0; i < CFG.PER_DIV; i++) SF.World.makeClub(G, idx++, d);
      G.clubIds = Object.keys(G.clubs);
      G.euIds = [];
      for (let i = 0; i < CFG.EU_FOREIGN; i++) G.euIds.push(SF.World.makeForeign(G, idx++, i % CFG.euNat.length).id);
      for (let i = 0; i < 40; i++) SF.World.newFreeAgent(G, 35, 62);
      delete G._usedNames;
    },
  };
})();
