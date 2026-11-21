// What the working-out has to survive.
//
// The contract guards who and when; it deliberately does not guard arithmetic. So anybody may
// write any number they like into the log - a bid of eighteen quintillion, a price of minus one,
// an offer for a player who does not exist - and every browser has to arrive at the same league
// in spite of it. These are the attacks that are *allowed* onto the chain, which is why they have
// to be stopped here, and stopped identically everywhere.
const SF = require('./load.js');
require('../src/chain.js');
require('../src/genesis.js');
require('../src/replay.js');

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };
const K = SF.Replay.kinds;

const POS = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW'];
function makeWorld() {
  const clubs = [];
  for (let i = 1; i <= 18; i++) {
    const squad = [];
    for (let k = 0; k < 22; k++) {
      const n = i * 100 + k;
      squad.push({ num: n, name: 'p' + n, pos: POS[k % 11], temper: 'pro', age: 25, ovr: 50, pot: 70, cond: 100, mood: 60, wage: 1000, goals: 0, apps: 0, contractWeeks: 68 });
    }
    clubs.push({ id: '0x' + i, num: i, name: 'c' + i, level: 3, series: 0, balance: 500000, fans: 5000, capacity: 8000, ticket: 12, owner: null, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0, lastPos: 0, squad });
  }
  return { league: { season: 1, week: 3, rosters: [clubs.map((c) => c.num)], seeds: [111, 222], weeks: 34, bottom: 3, manual: true }, clubs };
}
const world = makeWorld();
const START = 18 * 500000;
const HUGE = Number.MAX_SAFE_INTEGER;

/** a seeded source of nonsense, so a failure can be reproduced exactly */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) >>> 0; return s / 4294967296; };
}

function garbage(seed, n) {
  const r = rng(seed);
  const kinds = Object.values(K);
  const out = [];
  for (let i = 0; i < n; i++) {
    const wild = r();
    out.push({
      num: 1 + Math.floor(r() * 20),                       // sometimes a club that is not here
      kind: kinds[Math.floor(r() * kinds.length)],
      a: wild < 0.2 ? Math.floor(r() * HUGE) : wild < 0.3 ? -Math.floor(r() * 1e9) : Math.floor(r() * 2000),
      b: wild < 0.25 ? Math.floor(r() * HUGE) : wild < 0.35 ? -Math.floor(r() * 1e9) : Math.floor(r() * 900000),
      week: 1 + Math.floor(r() * 4),
      at: i,
      data: [],
    });
  }
  return out;
}

const check = (G, what) => {
  let money = 0;
  const seen = new Map();
  for (const id of G.clubIds) {
    const c = G.clubs[id];
    const bal = SF.Bank.bal(G, id);
    truthy(Number.isFinite(bal), `${what}: ${c.name} has a real balance;`);
    truthy(c.cap >= 0 && Number.isFinite(c.cap), `${what}: a real ground;`);
    truthy(c.price >= 0 && Number.isFinite(c.price), `${what}: a real ticket price (${c.price});`);
    truthy(c.squad.length >= 11, `${what}: ${c.name} can still field a team (${c.squad.length});`);
    truthy(c.squad.length <= 40, `${what}: ${c.name} is not hoarding (${c.squad.length});`);
    money += bal;
    for (const pid of c.squad) {
      truthy(!seen.has(pid), `${what}: ${pid} plays in one place, not two (${seen.get(pid)} and ${c.name});`);
      seen.set(pid, c.name);
      const p = G.players[pid];
      truthy(p && p.club === id, `${what}: ${pid} knows where he plays;`);
      truthy(Number.isFinite(p.ovr) && p.ovr > 0, `${what}: ${pid} has a rating;`);
    }
  }
  return { money };
};

t('a thousand pieces of nonsense leave a league standing', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const G = SF.Replay.run(world, garbage(seed, 400));
    check(G, 'seed ' + seed);
    truthy(G.refused.length > 0, `seed ${seed}: and most of it was refused (${G.refused.length});`);
  }
});

t('and leave it the same league twice', () => {
  const log = garbage(42, 400);
  const a = SF.Replay.run(world, log);
  const b = SF.Replay.run(world, log);
  eq(JSON.stringify(a.table), JSON.stringify(b.table), 'the same table;');
  eq(JSON.stringify(a.bank.acc), JSON.stringify(b.bank.acc), 'the same money;');
  eq(JSON.stringify(a.refused), JSON.stringify(b.refused), 'refused for the same reasons;');
});

t('the order the node happens to answer in decides nothing', () => {
  // A node may hand the same events back in any order, and two people asking a second apart may
  // be answered differently. If arrival order decided which of two offers went through, two
  // browsers would hold two leagues. So the reader puts the log in an order of its own.
  const log = garbage(7, 300);
  const straight = SF.Replay.run(world, log);

  const r = rng(5);
  const shuffled = log.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const other = SF.Replay.run(world, shuffled);
  eq(JSON.stringify(other.table), JSON.stringify(straight.table), 'the same league;');
  eq(JSON.stringify(other.bank.acc), JSON.stringify(straight.bank.acc), 'the same money;');
});

t('two decisions landing in the same millisecond still settle the same way', () => {
  // the narrow case the content-sort exists for: same week, same instant, two buyers
  const tie = (num, a, b) => ({ num, kind: K.BID, a, b, week: 1, at: 1000, data: [] });
  const log = [tie(1, 201, 5000), tie(3, 201, 5000), { num: 2, kind: K.ANSWER, a: 201, b: 1, week: 1, at: 1000, data: [] }];
  const forwards = SF.Replay.run(world, log);
  const backwards = SF.Replay.run(world, log.slice().reverse());
  eq(JSON.stringify(backwards.clubs), JSON.stringify(forwards.clubs), 'the same league either way;');
});

t('nobody prints money by buying and selling', () => {
  // no matchdays here: wages and gate money would move the total honestly, and what is being
  // asked is whether a transfer can move it dishonestly
  const still = { ...world, league: { ...world.league, seeds: [] } };
  const start = SF.Replay.run(still, []);
  const before = start.clubIds.reduce((n, id) => n + SF.Bank.bal(start, id), 0);

  const r = rng(99);
  const log = [];
  for (let i = 0; i < 300; i++) {
    const buyer = 1 + Math.floor(r() * 18);
    const pid = (1 + Math.floor(r() * 18)) * 100 + Math.floor(r() * 22);
    log.push({ num: buyer, kind: K.BID, a: pid, b: Math.floor(r() * 400000), week: 1, at: log.length, data: [] });
  }
  const G = SF.Replay.run(still, log);
  const sums = check(G, 'transfers');
  eq(sums.money, before, 'every dollar that left one club arrived at another;');
});

t('a bid of eighteen quintillion is still only what the club has', () => {
  const still = { ...world, league: { ...world.league, seeds: [] } };
  const base = SF.Replay.run(still, []);
  const G = SF.Replay.run(still, [{ num: 1, kind: K.BID, a: 201, b: HUGE, week: 1, at: 1, data: [] }]);
  eq(SF.Bank.bal(G, 'c1'), SF.Bank.bal(base, 'c1'), 'nothing was paid;');
  eq(G.clubs.c1.squad.length, base.clubs.c1.squad.length, 'and nobody arrived;');
  truthy(G.refused.length === 1, 'it was refused;');
});

t('a club cannot bid for its own player to move money about', () => {
  const still = { ...world, league: { ...world.league, seeds: [] } };
  const base = SF.Replay.run(still, []);
  const G = SF.Replay.run(still, [{ num: 2, kind: K.BID, a: 201, b: 400000, week: 1, at: 1, data: [] }]);
  eq(SF.Bank.bal(G, 'c2'), SF.Bank.bal(base, 'c2'), 'no money moved;');
  eq(G.clubs.c2.squad.length, base.clubs.c2.squad.length, 'and nobody moved;');
  truthy(G.refused.length === 1, 'refused;');
});

t('a negative price is not a price, and a negative loan is not a loan', () => {
  const still = { ...world, league: { ...world.league, seeds: [] } };
  const base = SF.Replay.run(still, []);
  const G = SF.Replay.run(still, [
    { num: 1, kind: K.TICKET, a: -5000, b: 0, week: 1, at: 1, data: [] },
    { num: 1, kind: K.LOAN, a: -900000, b: 0, week: 1, at: 2, data: [] },
    { num: 1, kind: K.INVEST, a: SF.Replay.GROUND, b: -40, week: 1, at: 3, data: [] },
  ]);
  check(G, 'negatives');
  truthy(G.clubs.c1.price > 0, `the price is still a price (${G.clubs.c1.price});`);
  truthy(SF.Bank.bal(G, 'c1') <= SF.Bank.bal(base, 'c1') + 1, 'and nobody was handed money;');
});

t('a man cannot be in two squads however hard the log tries', () => {
  const still = { ...world, league: { ...world.league, seeds: [] } };
  const log = [];
  for (let i = 0; i < 40; i++) {
    log.push({ num: 1 + (i % 17), kind: K.BID, a: 201, b: 50000, week: 1, at: i, data: [] });
  }
  const G = SF.Replay.run(still, log);
  check(G, 'one man, many buyers');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
