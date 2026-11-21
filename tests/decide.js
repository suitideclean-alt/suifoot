// Do the decisions people make actually change the league, and do the illegal ones get refused?
//
// The contract writes a decision down after checking two things: whose it is, and whether it came
// in time. It never checks whether the money was there or the man was yours to sell. Those are
// rules of the game, enforced here, where everyone working the season out enforces them the same
// way and arrives at the same answer. That is what these check.
const SF = require('./load.js');
require('../src/chain.js');
require('../src/replay.js');

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };
const K = SF.Replay.kinds;

const POS = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW'];
function makeWorld(weeks) {
  const clubs = [];
  for (let i = 1; i <= 18; i++) {
    const squad = [];
    for (let k = 0; k < 22; k++) {
      const n = i * 100 + k;
      squad.push({
        num: n, name: 'p' + n, pos: POS[k % 11], temper: 'pro', age: 25, ovr: 50, pot: 70,
        cond: 100, mood: 60, wage: 1000, goals: 0, apps: 0, contractWeeks: 68,
      });
    }
    clubs.push({
      id: '0x' + i, num: i, name: 'club ' + i, level: 3, series: 0,
      balance: 1000000, fans: 5000, capacity: 8000, ticket: 12, owner: null,
      played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0, lastPos: 0, squad,
    });
  }
  const seeds = [];
  for (let w = 0; w < weeks; w++) seeds.push((Math.imul(w + 1, 0x9e3779b9) >>> 0));
  return { league: { season: 1, week: weeks + 1, rosters: [clubs.map((c) => c.num)], seeds, weeks: 34, bottom: 3, manual: true }, clubs };
}
let clock = 0;
const dec = (num, kind, a, b, week, data) => ({ num, kind, a, b, week: week || 1, at: ++clock, data: data || [] });
const world = makeWorld(2);
const of = (out, num) => out.clubs.find((c) => c.num === num);

t('a stand gets built, and paid for', () => {
  const out = SF.Replay.run(world, [dec(1, K.INVEST, SF.Replay.GROUND, 4)]);
  const c = of(out, 1);
  eq(c.capacity, 8000 + 4 * 500, 'two thousand more seats;');
  eq(c.balance, 1000000 - 4 * 500 * 420, 'and the money gone;');
  eq(out.refused.length, 0, 'nothing refused;');
});

t('a stand nobody can afford does not get built', () => {
  const out = SF.Replay.run(world, [dec(1, K.INVEST, SF.Replay.GROUND, 40)]);
  const c = of(out, 1);
  eq(c.capacity, 8000, 'the ground is as it was;');
  eq(c.balance, 1000000, 'and so is the money;');
  eq(out.refused.length, 1, 'and it was refused;');
  truthy(/not enough money/.test(out.refused[0].why), 'for want of money: ' + out.refused[0].why);
});

t('a scout is taken on, and paid for', () => {
  const out = SF.Replay.run(world, [dec(1, K.INVEST, SF.Replay.SCOUT, 0)]);
  eq(of(out, 1).scout, 1, 'one scout;');
  eq(of(out, 1).balance, 1000000 - 60000, 'and he costs money;');
});

t('a club goes as far up as it can pay for, and no further', () => {
  const log = [];
  for (let i = 0; i < 6; i++) log.push(dec(1, K.INVEST, SF.Replay.SCOUT, 0));
  const out = SF.Replay.run(world, log);
  const c = of(out, 1);
  eq(c.scout, 3, 'a million buys three levels;');
  truthy(c.balance >= 0, 'and it never goes into the red to do it;');
  truthy(out.refused.length >= 1, 'the rest were refused;');
  truthy(/not enough money/.test(out.refused[0].why), out.refused[0].why);
});

t('with the money, it stops where the game says it stops', () => {
  const rich = { ...world, clubs: world.clubs.map((c) => (c.num === 1 ? { ...c, balance: 99000000 } : c)) };
  const log = [];
  for (let i = 0; i < 7; i++) log.push(dec(1, K.INVEST, SF.Replay.SCOUT, 0));
  const out = SF.Replay.run(rich, log);
  eq(of(out, 1).scout, 5, 'five is as far as it goes;');
  eq(out.refused.length, 2, 'and the last two were refused;');
  truthy(/as far as it goes/.test(out.refused[0].why), out.refused[0].why);
});

t('a ticket price is a price', () => {
  const out = SF.Replay.run(world, [dec(1, K.TICKET, 2550, 0), dec(2, K.TICKET, 999999, 0)]);
  eq(of(out, 1).ticket, 25.5, 'twenty-five fifty;');
  eq(of(out, 2).ticket, 12, 'and a silly one left alone;');
  eq(out.refused.length, 1, 'and refused;');
});

t('a man is bought when both sides agree', () => {
  const man = 201; // plays at club 2
  const out = SF.Replay.run(world, [
    dec(1, K.BID, man, 250000),
    dec(2, K.ANSWER, man, 1),
  ]);
  const buyer = of(out, 1), seller = of(out, 2);
  truthy(buyer.squad.some((p) => p.id === man), 'he plays for the buyer now;');
  truthy(!seller.squad.some((p) => p.id === man), 'and not for the seller;');
  eq(buyer.balance, 1000000 - 250000, 'the buyer paid;');
  eq(seller.balance, 1000000 + 250000, 'the seller was paid;');
  eq(buyer.squad.length, 23, 'one more at the buyer;');
  eq(seller.squad.length, 21, 'one fewer at the seller;');
});

t('nobody can sell a man who is not theirs', () => {
  const out = SF.Replay.run(world, [dec(1, K.BID, 201, 100), dec(3, K.ANSWER, 201, 1)]);
  eq(out.refused.length, 1, 'the answer was refused;');
  truthy(of(out, 1).squad.length === 22, 'and nobody moved;');
});

t('a bid nobody made cannot be accepted', () => {
  const out = SF.Replay.run(world, [dec(2, K.ANSWER, 201, 1)]);
  eq(out.refused.length, 1, 'refused;');
  truthy(/no such offer/.test(out.refused[0].why), out.refused[0].why);
});

t('a club that bids for three can only buy what it can pay for', () => {
  const log = [
    dec(1, K.BID, 201, 700000), dec(1, K.BID, 301, 700000),
    dec(2, K.ANSWER, 201, 1), dec(3, K.ANSWER, 301, 1),
  ];
  const out = SF.Replay.run(world, log);
  eq(of(out, 1).squad.length, 23, 'one signing, not two;');
  eq(out.refused.length, 1, 'the second was refused;');
  truthy(/cannot pay/.test(out.refused[0].why), out.refused[0].why);
});

t('and it refuses the same one, in the same order, every time', () => {
  const log = [
    dec(1, K.BID, 201, 700000), dec(1, K.BID, 301, 700000),
    dec(2, K.ANSWER, 201, 1), dec(3, K.ANSWER, 301, 1),
  ];
  const a = SF.Replay.run(world, log), b = SF.Replay.run(world, log);
  eq(JSON.stringify(a.refused), JSON.stringify(b.refused), 'the same refusals;');
  eq(JSON.stringify(a.clubs), JSON.stringify(b.clubs), 'and the same league;');
});

t('a squad cannot be sold down to nothing', () => {
  const log = [];
  for (let k = 0; k < 8; k++) { log.push(dec(1, K.BID, 200 + k, 1000)); log.push(dec(2, K.ANSWER, 200 + k, 1)); }
  const out = SF.Replay.run(world, log);
  truthy(of(out, 2).squad.length >= 16, `the seller kept a team: ${of(out, 2).squad.length};`);
  truthy(out.refused.length > 0, 'and the rest were refused;');
});

t('the decisions are done before the matchday they were made for', () => {
  const out = SF.Replay.run(world, [dec(1, K.INVEST, SF.Replay.GROUND, 2, 1)]);
  eq(of(out, 1).capacity, 9000, 'the stand was up before the game;');
  eq(out.played, 2, 'and both matchdays were played;');
});

t('a man can be sold in a hurry, for less than he is worth', () => {
  const out = SF.Replay.run(world, [dec(1, K.SELLNOW, 101, 0)]);
  const c = of(out, 1);
  eq(c.squad.length, 21, 'he is gone;');
  truthy(c.balance > 1000000, 'and the money came in;');
  const got = c.balance - 1000000;
  truthy(got < SF.Replay.worth({ ovr: 50, pot: 70, age: 25 }), `${got} is less than he is worth;`);
});

t('a man is paid off, and it costs what is left of his contract', () => {
  const out = SF.Replay.run(world, [dec(1, K.RELEASE, 101, 0)]);
  const c = of(out, 1);
  eq(c.squad.length, 21, 'he is gone;');
  eq(c.balance, 1000000 - Math.round((1000 * 68) / 34), 'two seasons of wages paid;');
});

t('a captain has to play here', () => {
  const out = SF.Replay.run(world, [dec(1, K.CAPTAIN, 101, 0), dec(1, K.CAPTAIN, 999, 0)]);
  eq(of(out, 1).captain, 101, 'the one who does;');
  eq(out.refused.length, 1, 'and the one who does not was refused;');
});

t('a club can borrow, but not its way out of a league', () => {
  const limit = SF.Replay.creditLimit(world.clubs[0]);
  const ok = SF.Replay.run(world, [dec(1, K.LOAN, Math.floor(limit / 2), 0)]);
  eq(of(ok, 1).debt, Math.floor(limit / 2), 'half the limit went through;');
  eq(of(ok, 1).balance, 1000000 + Math.floor(limit / 2), 'and the money arrived;');

  const no = SF.Replay.run(world, [dec(1, K.LOAN, limit * 3, 0)]);
  eq(of(no, 1).debt, 0, 'three times the limit did not;');
  truthy(/pay back/.test(no.refused[0].why), no.refused[0].why);
});

t('a debt gets repaid, and offering more than is owed just clears it', () => {
  const some = SF.Replay.run(world, [dec(1, K.LOAN, 100000, 0), dec(1, K.REPAY, 40000, 0)]);
  eq(of(some, 1).debt, 60000, 'part of it;');
  eq(of(some, 1).balance, 1000000 + 100000 - 40000, 'and the money adds up;');

  // somebody who types a big number means "pay it off", so it is paid off rather than refused
  const all = SF.Replay.run(world, [dec(1, K.LOAN, 100000, 0), dec(1, K.REPAY, 500000, 0)]);
  eq(of(all, 1).debt, 0, 'the debt is gone;');
  eq(of(all, 1).balance, 1000000, 'and only what was owed was taken;');
  eq(all.refused.length, 0, 'nothing refused;');

  const none = SF.Replay.run(world, [dec(1, K.REPAY, 1000, 0)]);
  eq(none.refused.length, 1, 'but repaying a debt nobody has is refused;');
});

t('what a man is worth is the same number everywhere', () => {
  const p = { ovr: 62, pot: 78, age: 23 };
  eq(SF.Replay.worth(p), SF.Replay.worth(p), 'twice the same;');
  truthy(Number.isInteger(SF.Replay.worth(p)), 'and a whole number of dollars;');
  truthy(SF.Replay.worth({ ovr: 70, pot: 70, age: 25 }) > SF.Replay.worth({ ovr: 50, pot: 50, age: 25 }), 'better is worth more;');
  truthy(SF.Replay.worth({ ovr: 60, pot: 85, age: 20 }) > SF.Replay.worth({ ovr: 60, pot: 60, age: 34 }), 'and young with a future beats old without one;');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
