// What the working-out has to survive.
//
// The contract guards who and when; it deliberately does not guard arithmetic. So anybody may
// write any number they like into the log - a bid of eighteen quintillion, a price of minus one,
// an offer for a player who does not exist - and every browser has to arrive at the same league
// in spite of it. These are the attacks that are *allowed* onto the chain, which is why they have
// to be stopped here, and stopped identically everywhere.
const SF = require('./load.js');
require('../src/chain.js');
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

const check = (out, what) => {
  let money = 0, debt = 0, spent = 0;
  const seen = new Map();
  for (const c of out.clubs) {
    truthy(c.balance >= 0, `${what}: ${c.name} is not in the red (${c.balance});`);
    truthy(Number.isFinite(c.balance), `${what}: ${c.name} has a real balance;`);
    truthy(Number.isInteger(c.balance), `${what}: ${c.name}'s money is whole (${c.balance});`);
    truthy(c.capacity >= 0 && Number.isFinite(c.capacity), `${what}: a real ground;`);
    truthy(c.ticket >= 0 && Number.isFinite(c.ticket), `${what}: a real ticket price;`);
    truthy(c.squad.length >= 16, `${what}: ${c.name} can still field a team (${c.squad.length});`);
    truthy(c.squad.length <= 30, `${what}: ${c.name} is not hoarding (${c.squad.length});`);
    money += c.balance; debt += c.debt; spent += c.spent;
    for (const p of c.squad) {
      truthy(!seen.has(p.id), `${what}: ${p.id} plays in one place, not two (${seen.get(p.id)} and ${c.name});`);
      seen.set(p.id, c.name);
    }
  }
  return { money, debt, spent };
};

t('a thousand pieces of nonsense leave a league standing', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const out = SF.Replay.run(world, garbage(seed, 1000));
    check(out, 'seed ' + seed);
    truthy(out.refused.length > 0, `seed ${seed}: and most of it was refused (${out.refused.length});`);
  }
});

t('and leave it the same league twice', () => {
  const log = garbage(42, 1000);
  const a = SF.Replay.run(world, log);
  const b = SF.Replay.run(world, log);
  eq(JSON.stringify(a.clubs), JSON.stringify(b.clubs), 'the same clubs;');
  eq(JSON.stringify(a.refused), JSON.stringify(b.refused), 'refused for the same reasons;');
});

t('the order the node happens to answer in decides nothing', () => {
  // A node may hand the same events back in any order, and two people asking a second apart may
  // be answered differently. If arrival order decided which of two offers went through, two
  // browsers would hold two leagues. So the reader puts the log in an order of its own.
  const log = garbage(7, 400);
  const straight = SF.Replay.run(world, log);

  const r = rng(5);
  const shuffled = log.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const other = SF.Replay.run(world, shuffled);
  eq(JSON.stringify(other.clubs), JSON.stringify(straight.clubs), 'the same league;');
  eq(JSON.stringify(other.refused), JSON.stringify(straight.refused), 'refused for the same reasons;');
  eq(JSON.stringify(SF.Replay.run(world, log.slice().reverse()).clubs), JSON.stringify(straight.clubs), 'and backwards too;');
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
  const r = rng(99);
  const log = [];
  for (let i = 0; i < 600; i++) {
    const buyer = 1 + Math.floor(r() * 18);
    const pid = (1 + Math.floor(r() * 18)) * 100 + Math.floor(r() * 22);
    const fee = Math.floor(r() * 400000);
    log.push({ num: buyer, kind: K.BID, a: pid, b: fee, week: 1, at: log.length, data: [] });
    const holder = Math.floor(pid / 100);
    log.push({ num: holder, kind: K.ANSWER, a: pid, b: buyer, week: 1, at: log.length, data: [] });
  }
  const out = SF.Replay.run(world, log);
  const sums = check(out, 'transfers');
  eq(sums.money, START, 'every dollar that left one club arrived at another;');
});

t('a bid of eighteen quintillion is still only what the club has', () => {
  const log = [
    { num: 1, kind: K.BID, a: 201, b: HUGE, week: 1, at: 1, data: [] },
    { num: 2, kind: K.ANSWER, a: 201, b: 1, week: 1, at: 2, data: [] },
  ];
  const out = SF.Replay.run(world, log);
  eq(out.clubs.find((c) => c.num === 1).balance, 500000, 'nothing was paid;');
  eq(out.clubs.find((c) => c.num === 2).balance, 500000, 'and nothing received;');
  truthy(out.refused.some((x) => /cannot pay/.test(x.why)), 'it was refused for want of money;');
});

t('a club cannot sell the same man to two people', () => {
  const log = [
    { num: 1, kind: K.BID, a: 201, b: 1000, week: 1, at: 1, data: [] },
    { num: 3, kind: K.BID, a: 201, b: 1000, week: 1, at: 2, data: [] },
    { num: 2, kind: K.ANSWER, a: 201, b: 1, week: 1, at: 3, data: [] },
    { num: 2, kind: K.ANSWER, a: 201, b: 3, week: 1, at: 4, data: [] },
  ];
  const out = SF.Replay.run(world, log);
  check(out, 'double sale');
  eq(out.clubs.find((c) => c.num === 1).squad.length, 23, 'the first buyer has him;');
  eq(out.clubs.find((c) => c.num === 3).squad.length, 22, 'the second does not;');
  truthy(out.refused.some((x) => /no longer plays here/.test(x.why)), 'and was told why;');
});

t('a club cannot bid for its own player to move money about', () => {
  const log = [{ num: 2, kind: K.BID, a: 201, b: 400000, week: 1, at: 1, data: [] }];
  const out = SF.Replay.run(world, log);
  eq(out.clubs.find((c) => c.num === 2).balance, 500000, 'no money moved;');
  truthy(/already plays here/.test(out.refused[0].why), out.refused[0].why);
});

t('a negative price is not a price, and a negative loan is not a loan', () => {
  const log = [
    { num: 1, kind: K.TICKET, a: -5000, b: 0, week: 1, at: 1, data: [] },
    { num: 1, kind: K.LOAN, a: -900000, b: 0, week: 1, at: 2, data: [] },
    { num: 1, kind: K.REPAY, a: -900000, b: 0, week: 1, at: 3, data: [] },
    { num: 1, kind: K.INVEST, a: SF.Replay.GROUND, b: -40, week: 1, at: 4, data: [] },
  ];
  const out = SF.Replay.run(world, log);
  const c = out.clubs.find((x) => x.num === 1);
  eq(c.ticket, 12, 'the price is as it was;');
  eq(c.balance, 500000, 'the money is as it was;');
  eq(c.debt, 0, 'and nothing is owed;');
  eq(out.refused.length, 4, 'all four refused;');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
