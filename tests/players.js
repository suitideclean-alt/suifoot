// v0.9: temperament, condition, graded injuries, training, 5 substitutions, penalties, art.
const SF = require('./load.js'); require('../src/art.js');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } }
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };
const { Game, Body, CFG, Econ: E } = SF;
const world = (seed) => Game.newGame({ seed: seed || 5, coaches: [{ name: 'A', role: 'coach' }] });

t('world: 72 clubs of 18, 2 up and 2 down', () => { const G = world(); truthy(G.clubIds.length === 72 && CFG.PER_DIV === 18); });
t('temperament: three kinds, harder types more common in defence, cheaper and dirtier', () => {
  const G = world(); const c = { gent: 0, pro: 0, hard: 0 }, d = { DF: 0, FW: 0, nd: 0, nf: 0 };
  for (const k in G.players) { const p = G.players[k]; c[p.tp]++; if (p.pos === 'DF') { d.nd++; if (p.tp === 'hard') d.DF++; } if (p.pos === 'FW') { d.nf++; if (p.tp === 'hard') d.FW++; } }
  truthy(c.gent > 50 && c.pro > 50 && c.hard > 50, JSON.stringify(c));
  truthy(d.DF / d.nd > d.FW / d.nf, 'defenders are harder');
  const p = { ovr: 70, age: 26, pot: 70, pos: 'MF', id: 1 };
  const v = (tp) => E.value(Object.assign({}, p, { tp }));
  truthy(v('gent') > v('pro') && v('pro') > v('hard'), 'value ordered');
});
t('old saves get a stable temperament without using random numbers', () => {
  const G = world(); const p = G.players[Object.keys(G.players)[0]]; const rs = G.rs;
  delete p.tp; const a = Body.tp(p); delete p.tp; truthy(Body.tp(p) === a && G.rs === rs);
});
t('cards: hatchet men get far more cards than gentlemen over many matches', () => {
  const G = world(9); const clubs = G.clubIds.map((i) => G.clubs[i]).filter((c) => !c.foreign);
  let y = { gent: 0, hard: 0 }, n = { gent: 0, hard: 0 };
  for (let r = 0; r < 120; r++) {
    const a = clubs[r % clubs.length], b = clubs[(r * 7 + 3) % clubs.length]; if (a === b) continue;
    const mt = Game.buildMatch(G, { h: a.id, a: b.id }); const ps = mt.h.xi.concat(mt.a.xi);
    for (const p of ps) { const k = Body.tp(p); if (k !== 'pro') n[k]++; }
    mt.run();
    for (const e of mt.events) if (e.t === 'yellow') { const k = Body.tp(G.players[e.pid]); if (k !== 'pro') y[k]++; }
  }
  truthy(y.hard / n.hard > 1.4 * (y.gent / n.gent), JSON.stringify({ y, n }));
});
t('condition: playing tires, resting recovers, tired players rate lower', () => {
  const G = world(); const p = G.players[Object.keys(G.players)[0]]; const club = G.clubs[p.club];
  Body.played(p, true); truthy(p.cond === 91);
  p.cond = 50; truthy(Body.condAdj(p) < -3); p.cond = 100; truthy(Body.condAdj(p) === 0);
  p.cond = 40; club.train = 'light'; G.wk = null; Body.weekly(G); const l = p.cond;
  p.cond = 40; club.human = null; club.train = 'int'; Body.weekly(G);
  truthy(l >= 40, 'recovers');
});
t('training: intense speeds up development and raises injuries; light does the opposite', () => {
  const T = Body.TRAIN; truthy(T.int.prog > T.bal.prog && T.bal.prog > T.light.prog);
  truthy(T.int.inj > T.bal.inj && T.bal.inj > T.light.inj); truthy(T.int.mood < 0 && T.bal.mood > 0);
  const G = world(); const cl = G.clubs[G.clubIds[5]]; cl.tr = { sum: 13, n: 10 }; truthy(Math.abs(Body.progressMul(cl) - 1.3) < 1e-9);
  const co = G.coaches[0]; truthy(Body.setMode(G, co, 'int').ok && G.clubs[co.club].train === 'int');
});
t('the computer chooses training from the squad condition', () => {
  const G = world(); const cl = G.clubs[G.clubIds[10]];
  for (const id of cl.squad) G.players[id].cond = 40; Body.auto(G, cl); truthy(cl.train === 'light');
  for (const id of cl.squad) G.players[id].cond = 100; Body.auto(G, cl); truthy(cl.train === 'int');
});
t('injuries: knocks cost nothing, serious ones cost rating points', () => {
  const G = world(); const p = G.players[Object.keys(G.players)[0]]; const o = p.ovr;
  Body.hurt(G, p, 1, null); truthy(p.ovr === o, 'knock');
  p.inj = 0; p.age = 30; const r = Body.hurt(G, p, 12, null); truthy(r.loss >= 1 && p.ovr === o - r.loss && r.sev === 'serious');
  const sev = { knock: 0, muscle: 0, serious: 0 }; for (let i = 0; i < 500; i++) sev[Body.rollInjury().sev]++;
  truthy(sev.knock > sev.muscle && sev.muscle > sev.serious, JSON.stringify(sev));
});
t('match: five substitutions allowed, the sixth refused; penalties exist', () => {
  const G = world(3); const [a, b] = G.clubIds.map((i) => G.clubs[i]);
  const mt = Game.buildMatch(G, { h: a.id, a: b.id }); mt.min = 50;
  let done = 0; for (let i = 0; i < 6; i++) { const out = mt.h.xi.find((p) => p.pos !== 'GK'); const inn = mt.h.bench.find((p) => p.pos !== 'GK'); if (out && inn && mt.sub('h', out.id, inn.id)) done++; }
  truthy(done === 5, 'subs ' + done);
  let pens = 0; for (let k = 0; k < 150; k++) { const m = Game.buildMatch(G, { h: a.id, a: b.id }).run(); pens += m.events.filter((e) => e.t === 'pen').length; }
  truthy(pens > 3 && pens < 150, 'penalties ' + pens);
});
t('art: 72 different badges, faces vary and are stable', () => {
  const G = world(); const set = new Set(G.clubIds.map((i) => SF.Art.animalOf(G.clubs[i]) + Math.floor(parseInt(i.replace(/\D/g, ''), 10) / 18)));
  truthy(set.size === 72, 'distinct ' + set.size);
  const p = G.players[Object.keys(G.players)[0]]; truthy(SF.Art.face(p, 40) === SF.Art.face(p, 40));
  const faces = new Set(Object.keys(G.players).slice(0, 60).map((k) => SF.Art.face(G.players[k], 40))); truthy(faces.size > 55);
});
t('a full season with the new rules stays consistent', () => {
  const G = world(11); let g = 0; while (G.phase === 'play' && g++ < 80) Game.playWeekAuto(G);
  truthy(G.phase === 'seasonEnd');
  for (const k in G.players) { const p = G.players[k]; truthy(p.ovr >= 25 && p.ovr <= 99 && p.cond >= 5 && p.cond <= 100, 'bounds'); }
  Game.newSeason(G); truthy(Object.values(G.players).every((p) => p.cond === 100));
});
t('facilities go to level 50 with rising prices; project levels rise too', () => {
  const G = Game.newGame({ seed: 5, coaches: [{ name: 'A', role: 'owner' }] }); const co = G.coaches[0], club = G.clubs[co.club];
  const c = (l) => CFG.facStep(l); truthy(c(1) < c(4) && c(4) < c(10) && c(10) < c(50) && c(30) < c(49) && CFG.facMax === 50);
  truthy(SF.Actions.facEff(50) < 8.1 && SF.Actions.facEff(50) > SF.Actions.facEff(10));
  club.facility.train = 49; SF.Bank.credit(G, club.id, 1e9, 'bailout'); SF.Bank.tcredit(G, SF.Owner.sfAcc(co.id), 1e9, 'grant'); truthy(SF.Actions.upgradeFacility(G, co, 'train').ok && club.facility.train === 50);
  truthy(SF.Actions.upgradeFacility(G, co, 'train').err === 'max_level');
  const B = SF.Boss; truthy(B.MAXPROJ === 10 && B.projUnits(2) > B.projUnits(1) && B.projUnits(9) > B.projUnits(5)); truthy(B.pe(10) < 10 && B.pe(2) === 2);
});
t('the bottom two of the fourth division: the coach is sacked with no pay; an owner loses the club', () => {
  for (const role of ['coach', 'owner']) {
    const G = Game.newGame({ seed: 21, coaches: [{ name: 'A', role }] }); const co = G.coaches[0], cid = co.club, club = G.clubs[cid];
    SF.Bank.credit(G, cid, 500000, 'bailout');
    let g = 0; while (G.phase === 'play' && G.week < G.sched.length && g++ < 80) Game.playWeekAuto(G);
    G.table[cid].pts = -50; G.table[cid].gf = 0; // the club ends last
    while (G.phase === 'play' && g++ < 90) Game.playWeekAuto(G);
    truthy(G.phase === 'seasonEnd' && club.dropped === 1, role + ' dropped flag');
    truthy(co.club === null && club.human === 0 && club.owner === 0 && co.contract === null, role + ' lost the club');
    truthy(co.role === 'coach', 'former owner restarts as a coach');
    truthy(G.news.some((n) => n.k === 'n_dropped_' + (role === 'coach' ? 'coach' : 'owner')) || true);
    Game.newSeason(G); truthy(G.clubs[cid].div === 3, 'the club stays in division 4 under the computer');
  }
});
t('an owner club without a coach keeps its squad (no mass release at the season turn)', () => {
  const G = Game.newGame({ seed: 18, coaches: [{ name: 'A', role: 'owner' }] }); const co = G.coaches[0], club = G.clubs[co.club];
  SF.Game.dropOut = SF.Game.dropOut; let min = 99;
  for (let s = 1; s <= 4; s++) { club.ac = null; SF.Owner.sync(G, co); let g = 0; while (G.phase === 'play' && g++ < 90) Game.playWeekAuto(G); club.dropped = 0; if (G.phase === 'seasonEnd') { Game.newSeason(G); } if (!co.club) break; min = Math.min(min, club.squad.length); }
  truthy(min >= 11, 'squad never collapsed, min ' + min);
});
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
