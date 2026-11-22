// Can somebody who owns nothing show what they are worth?
//
// A league of people needs people to be known. Owning a club is the loud way; most of the work in
// football is done by somebody who owns nothing. These check that a career is readable from what
// the chain recorded, that it counts the right things, and that a coach at a club nobody owns -
// the very person with the most to prove - has a record like anybody else.
const SF = require('./load.js');
require('../src/chain.js');
require('../src/genesis.js');
require('../src/replay.js');
require('../src/careers.js');

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };
const K = SF.Careers.kinds;

const ANA = '0x' + 'a1'.repeat(32);
const BRUNO = '0x' + 'b2'.repeat(32);
const CARLA = '0x' + 'c3'.repeat(32);

const POS = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW'];
const clubs = [];
for (let i = 1; i <= 18; i++) {
  const squad = [];
  for (let k = 0; k < 22; k++) {
    const n = i * 100 + k;
    squad.push({ num: n, name: 'p' + n, pos: POS[k % 11], temper: 'pro', age: 25, ovr: 50, pot: 70, cond: 100, mood: 60, wage: 1000, goals: 0, apps: 0, contractWeeks: 68 });
  }
  clubs.push({ id: '0x' + i, num: i, name: 'club ' + i, level: 3, series: 0, balance: 500000, fans: 5000, capacity: 8000, ticket: 12, owner: i === 1 ? ANA : null, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0, lastPos: 0, squad });
}
const seeds = [];
for (let w = 0; w < 6; w++) seeds.push((Math.imul(w + 1, 0x9e3779b9) >>> 0));
const world = { league: { season: 1, week: 7, rosters: [clubs.map((c) => c.num)], seeds, weeks: 34, bottom: 3, manual: true }, clubs };
const G = SF.Replay.run(world, []);

let clock = 0;
const ev = (who, kind, num, wage) => ({ who, by: who, kind, num, wage: wage || 0, weeks: 68, win: 0, season: 1, week: 1, at: ++clock });

t('a job taken and still running shows as work in hand', () => {
  const all = SF.Careers.build([ev(BRUNO, K.ACCEPTED, 2, 5000)], G);
  eq(all.length, 1, 'one person;');
  const b = all[0];
  truthy(b.now, 'he is in a job;');
  eq(b.now.club, 2, 'at club two;');
  eq(b.wage, 5000, 'on the wage that was agreed;');
  truthy(b.now.record && b.now.record.p > 0, 'with matches behind him already;');
});

t('an offer nobody took is not a career', () => {
  const all = SF.Careers.build([ev(CARLA, K.OFFERED, 3, 9000)], G);
  eq(all.length, 0, 'nothing happened;');
});

t('a coach at a club nobody owns has a record like anybody else', () => {
  // the whole point: somebody with nothing to show but the work
  const all = SF.Careers.build([ev(CARLA, K.TAKEN, 5, 0)], G);
  const c = all[0];
  truthy(c.now, 'she is in a job;');
  eq(c.now.agreed, false, 'nobody negotiated it;');
  truthy(c.wage > 0, `and it pays what the rules say such a club pays (${c.wage});`);
  truthy(c.now.record && c.now.record.p > 0, 'with a record to show;');
});

t('leaving a job closes it, and how it ended is remembered', () => {
  const quit = SF.Careers.build([ev(BRUNO, K.ACCEPTED, 2, 5000), ev(BRUNO, K.RESIGNED, 2)], G)[0];
  eq(quit.now, null, 'out of work;');
  eq(quit.jobs[0].ended, 'resigned', 'he walked;');

  const sacked = SF.Careers.build([ev(BRUNO, K.ACCEPTED, 2, 5000), ev(BRUNO, K.DISMISSED, 2)], G)[0];
  eq(sacked.jobs[0].ended, 'dismissed', 'he was let go;');
});

t('a career survives the job that ended it', () => {
  const all = SF.Careers.build([
    ev(BRUNO, K.ACCEPTED, 2, 5000), ev(BRUNO, K.DISMISSED, 2),
    ev(BRUNO, K.TAKEN, 6, 0),
  ], G)[0];
  eq(all.jobs.length, 2, 'two jobs;');
  truthy(all.now, 'and he is working again;');
  eq(all.now.club, 6, 'somewhere else;');
});

t('who is in work and who is looking are told apart', () => {
  const all = SF.Careers.build([
    ev(ANA, K.ACCEPTED, 1, 8000),
    ev(BRUNO, K.ACCEPTED, 2, 5000), ev(BRUNO, K.RESIGNED, 2),
    ev(CARLA, K.TAKEN, 5, 0),
  ], G);
  const working = SF.Careers.employed(all).map((p) => p.addr);
  const looking = SF.Careers.looking(all).map((p) => p.addr);
  truthy(working.includes(ANA) && working.includes(CARLA), 'two in jobs;');
  eq(looking.length, 1, 'one looking;');
  eq(looking[0], BRUNO, 'the one who walked;');
});

t('standing is earned on the pitch, and being sacked is not a life sentence', () => {
  const steady = SF.Careers.build([ev(ANA, K.ACCEPTED, 1, 8000)], G)[0];
  const once = SF.Careers.build([ev(BRUNO, K.ACCEPTED, 1, 8000), ev(BRUNO, K.DISMISSED, 1), ev(BRUNO, K.TAKEN, 1, 0)], G)[0];
  truthy(Number.isFinite(steady.rep) && Number.isFinite(once.rep), 'both have a standing;');
  // taking another job after being let go leaves somebody ahead of where one sacking left them
  const sackedOnly = SF.Careers.build([ev(CARLA, K.ACCEPTED, 1, 8000), ev(CARLA, K.DISMISSED, 1)], G)[0];
  truthy(once.rep > sackedOnly.rep, `getting back to work counts (${once.rep} vs ${sackedOnly.rep});`);
});

t('two readings give the same careers', () => {
  const log = [ev(ANA, K.ACCEPTED, 1, 8000), ev(BRUNO, K.TAKEN, 2, 0), ev(CARLA, K.ACCEPTED, 3, 4000)];
  eq(JSON.stringify(SF.Careers.build(log, G)), JSON.stringify(SF.Careers.build(log.slice().reverse(), G)), 'however they arrive;');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
