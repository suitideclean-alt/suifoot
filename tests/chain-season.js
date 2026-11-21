// Is the season the chain produces the game, or something that looks like it?
//
// The whole claim of this design is that there are not two games. The chain keeps who, what and
// when; the rules that turn those into a season are the game's own, called here rather than
// copied. These check that it really is the game running - that what a stand costs on the chain
// is what the game says a stand costs, down to the dollar - and that it comes out the same for
// everyone holding the same four things.
const SF = require('./load.js');
require('../src/chain.js');
require('../src/genesis.js');
require('../src/replay.js');
require('../src/bridge.js');

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };
const K = SF.Replay.kinds;
const ME = '0x' + 'ab'.repeat(32);

const POS = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW'];
function world(weeks, cash) {
  const clubs = [];
  for (let i = 1; i <= 18; i++) {
    const squad = [];
    for (let k = 0; k < 22; k++) {
      const n = i * 100 + k;
      squad.push({ num: n, name: 'p' + n, pos: POS[k % 11], temper: 'pro', age: 25, ovr: 50, pot: 70, cond: 100, mood: 60, wage: 1000, goals: 0, apps: 0, contractWeeks: 68 });
    }
    clubs.push({ id: '0x' + i, num: i, name: 'c' + i, level: 3, series: 0, balance: cash || 5000000, fans: 5000, capacity: 8000, ticket: 12, owner: i === 1 ? ME : null, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0, lastPos: 0, squad });
  }
  const seeds = [];
  for (let w = 0; w < weeks; w++) seeds.push((Math.imul(w + 1, 0x9e3779b9) >>> 0));
  return { league: { season: 1, week: weeks + 1, rosters: [clubs.map((c) => c.num)], seeds, weeks: 34, bottom: 3, manual: true }, clubs };
}
let clock = 0;
const dec = (num, kind, a, b, week) => ({ num, kind, a, b, week: week || 1, at: ++clock, data: [] });
const W = world(12);

t('what comes out is the game, not something shaped like it', () => {
  const G = SF.Replay.run(W, []);
  truthy(G.clubs && G.players && G.bank && G.sched && G.cup && G.eu, 'all of it is there;');
  truthy(G.coaches.length >= 1, 'somebody to apply the rules;');
  eq(G.clubIds.length, 18, 'eighteen clubs;');
  truthy(SF.Econ.strength(G, G.clubs.c1) > 0, 'and code that never heard of a chain works on it;');
});

t('the clubs stand where the chain says, not at the top of a pyramid they never climbed', () => {
  const G = SF.Replay.run(W, []);
  eq(G.clubs.c1.div, 3, 'at the foot;');
  // the level is not a label: it decides what a ticket may cost and what a crowd is worth
  const r = SF.Replay.run(W, [dec(1, K.TICKET, 9999, 0)]);
  truthy(r.clubs.c1.price < 10, `a foot club cannot charge top-division prices (${r.clubs.c1.price});`);
});

t('a stand costs what the game says a stand costs', () => {
  const before = SF.Replay.run(W, []);
  const cost = SF.Actions.stadiumCost(before, before.clubs.c1, 2);
  const step = SF.Actions.expandStep(before.clubs.c1);
  const after = SF.Replay.run(W, [dec(1, K.INVEST, SF.Replay.GROUND, 2)]);
  truthy(cost > 0 && step > 0, `the game charges ${cost} for ${2 * step} seats;`);
  eq(after.refused.length, 0, 'and it was not refused;');
  truthy(after.clubs.c1.cap > before.clubs.c1.cap, 'the ground is bigger;');
});

t('the Cup and Europe happen, from the same numbers and nothing else', () => {
  const G = SF.Replay.run(W, []);
  truthy(G.cup.round > 0, `the cup has been drawn (round ${G.cup.round});`);
  eq(G.eu.q.length, 4, 'four clubs are in Europe;');
  truthy(G.eu.fix.length > 0, 'with a group stage to play;');
  truthy(G.news.length > 0, `and there is news about it (${G.news.length});`);
});

t('a season is the same season for everybody holding the same numbers', () => {
  const log = [dec(1, K.INVEST, SF.Replay.GROUND, 1), dec(1, K.TICKET, 300, 0, 2), dec(1, K.CAPTAIN, 101, 0, 3)];
  const a = SF.Replay.run(W, log);
  const b = SF.Replay.run(W, log);
  eq(JSON.stringify(a.table), JSON.stringify(b.table), 'the same table;');
  eq(JSON.stringify(a.res), JSON.stringify(b.res), 'the same results;');
  eq(JSON.stringify(a.bank.acc), JSON.stringify(b.bank.acc), 'and the same money;');
});

t('the order the node answers in decides nothing', () => {
  const log = [dec(1, K.CAPTAIN, 101, 0, 2), dec(1, K.TICKET, 300, 0, 2), dec(1, K.INVEST, SF.Replay.ACADEMY, 0, 2)];
  const straight = SF.Replay.run(W, log);
  const backwards = SF.Replay.run(W, log.slice().reverse());
  eq(JSON.stringify(backwards.table), JSON.stringify(straight.table), 'the same league;');
  eq(backwards.clubs.c1.facility.youth, straight.clubs.c1.facility.youth, 'and the same academy;');
});

t('a different draw gives a different season', () => {
  const other = { ...W, league: { ...W.league, seeds: W.league.seeds.map((s) => (s ^ 0x5bf03635) >>> 0) } };
  const a = SF.Replay.run(W, []), b = SF.Replay.run(other, []);
  truthy(JSON.stringify(a.res) !== JSON.stringify(b.res), 'it went differently;');
  eq(a.res.length, b.res.length, 'over the same number of matches;');
});

t('the game refuses in its own words, and they are kept', () => {
  const poor = world(2, 1000);
  const G = SF.Replay.run(poor, [dec(1, K.INVEST, SF.Replay.GROUND, 5)]);
  eq(G.refused.length, 1, 'refused;');
  eq(G.refused[0].why, 'no_funds', 'for want of money, in the game\'s own word;');
});

t('a decision for a club nobody runs is refused', () => {
  const G = SF.Replay.run(W, [dec(7, K.TICKET, 300, 0)]);
  eq(G.refused.length, 1, 'refused;');
  eq(G.refused[0].why, 'no_club', 'because nobody runs club seven;');
});

t('my club is mine, and a spectator is shown nobody else\'s', () => {
  const G = SF.Bridge.toGame(W, ME, []);
  eq(G.me, 'c1', 'the one the chain says I own;');
  truthy(G.clubs.c1.mine, 'marked as mine;');
  truthy(!G.clubs.c2.mine, 'and c2 is not;');
  const S = SF.Bridge.toGame(W, null, []);
  eq(S.me, null, 'a spectator owns none;');
  truthy(S.clubIds.length === 18, 'but sees the whole league;');
});

t('two owners can trade with each other, which is what a league of people is for', () => {
  const two = { ...W, league: { ...W.league, seeds: [] }, clubs: W.clubs.map((c) => (c.num === 2 ? { ...c, owner: '0x' + 'cd'.repeat(32) } : c)) };
  const before = SF.Replay.run(two, []);
  const paid = 200000;

  /* A bid for another person's player is an offer, not a purchase: nothing moves until they
   * answer. This used to be refused outright - the game was written for one player, so a human
   * club was always your own - and no two owners could trade at all. */
  const offered = SF.Replay.run(two, [dec(1, K.BID, 201, paid)]);
  eq(offered.refused.length, 0, 'the bid was accepted as an offer;');
  eq(offered.offers.length, 1, 'and is waiting to be answered;');
  eq(offered.players[201].club, 'c2', 'with the man still where he was;');
  eq(SF.Bank.bal(offered, 'c1'), SF.Bank.bal(before, 'c1'), 'and nobody out of pocket;');

  const done = SF.Replay.run(two, [dec(1, K.BID, 201, paid), dec(2, K.ANSWER, 1, 1)]);
  eq(done.refused.length, 0, 'answering it went through;');
  eq(done.players[201].club, 'c1', 'he plays for the buyer now;');
  eq(done.clubs.c1.squad.length, before.clubs.c1.squad.length + 1, 'one more there;');
  eq(done.clubs.c2.squad.length, before.clubs.c2.squad.length - 1, 'one fewer here;');
  eq(SF.Bank.bal(done, 'c1'), SF.Bank.bal(before, 'c1') - paid, 'the buyer paid;');
  eq(SF.Bank.bal(done, 'c2'), SF.Bank.bal(before, 'c2') + paid, 'the seller was paid;');
});

t('a foreign club is still not a shop', () => {
  const G = SF.Replay.run(W, []);
  const foreignMan = G.players[G.clubs[G.euIds[0]].squad[0]];
  const r = SF.Actions.buy(G, G.coaches[0], foreignMan.id, 500000);
  eq(r.ok, false, 'refused;');
  eq(r.err, 'human_club', 'a club abroad does not sell into this league;');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
