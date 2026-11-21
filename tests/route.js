// Do the game's own buttons turn into the right decisions, and does the screen answer with truth?
//
// The point of routing clicks rather than rewriting pages is that a person online presses the same
// button they press offline. These check the mapping is right, and - the part that matters - that
// what a person is shown a tenth of a second after pressing is what the chain's own log will say.
const SF = require('./load.js');
require('../src/chain.js');
require('../src/replay.js');
require('../src/bridge.js');
require('../src/online.js');

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };
const K = SF.Replay.kinds;

const ME = '0x' + 'cd'.repeat(32);
const POS = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW'];
const clubs = [];
for (let i = 1; i <= 18; i++) {
  const squad = [];
  for (let k = 0; k < 22; k++) {
    const n = i * 100 + k;
    squad.push({ num: n, name: 'p' + n, pos: POS[k % 11], temper: 'pro', age: 25, ovr: 50, pot: 70, cond: 100, mood: 60, wage: 1000, goals: 0, apps: 0, contractWeeks: 68 });
  }
  clubs.push({ id: '0x' + i, num: i, name: 'club ' + i, level: 3, series: 0, balance: 5000000, fans: 5000, capacity: 8000, ticket: 12, owner: i === 1 ? ME : null, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0, lastPos: 0, squad });
}
const world = { league: { season: 1, week: 1, rosters: [clubs.map((c) => c.num)], seeds: [], weeks: 34, bottom: 3, manual: true }, clubs };

globalThis.SF.Wallet = { addr: ME, short: (a) => a.slice(0, 6) };
const O = SF.Online;
O.genesis = world; O.decisions = []; O.pending = []; O.playing = true;
SF.UI = SF.UI || { G: null, ci: 0 };
O.build();
SF.UI.G = O.game; SF.setG(O.game);
const noop = () => {};

t('the club the chain says is mine is the one decisions are made for', () => {
  const c = O.myClub();
  truthy(c, 'there is one;');
  eq(c.num, 1, 'and it is the one I own;');
});

t('a ticket price button is a ticket price decision', () => {
  const made = [];
  const real = O.decide; O.decide = (k, a, b) => { made.push([k, a, b]); return true; };
  try { truthy(O.route('setprice', '25.5', noop), 'it was routed;'); } finally { O.decide = real; }
  eq(made[0][0], K.TICKET, 'a ticket decision;');
  eq(made[0][1], 2550, 'in cents, so two browsers cannot round it differently;');
});

t('a stand button is a stand, in steps the contract understands', () => {
  const made = [];
  const real = O.decide; O.decide = (k, a, b) => { made.push([k, a, b]); return true; };
  try { O.route('expand', '2000', noop); } finally { O.decide = real; }
  eq(made[0][0], K.INVEST, 'something bought;');
  eq(made[0][1], SF.Replay.GROUND, 'a stand;');
  eq(made[0][2], 4, 'four steps of five hundred seats;');
});

t('the academy and the training ground are not the same thing', () => {
  const made = [];
  const real = O.decide; O.decide = (k, a, b) => { made.push([k, a, b]); return true; };
  try { O.route('fac', 'youth', noop); O.route('fac', 'train', noop); } finally { O.decide = real; }
  eq(made[0][1], SF.Replay.ACADEMY, 'the academy;');
  eq(made[1][1], SF.Replay.TRAINING, 'and the training ground;');
  truthy(made[0][1] !== made[1][1], 'told apart;');
});

t('a button the chain knows nothing about is left to the offline game', () => {
  eq(O.route('tab', 'squad', noop), false, 'a tab is not a decision;');
  eq(O.route('snd', '', noop), false, 'and neither is the sound;');
});

t('what the screen shows at once is what the log will say', () => {
  const before = SF.UI.G.clubs['c1'].cap;
  // a decision made and not yet landed
  O.pending.push({ num: 1, kind: K.INVEST, a: SF.Replay.GROUND, b: 4, week: 1, at: 1, data: [] });
  O.build();
  const shown = O.game.clubs['c1'].cap;
  eq(shown, before + 2000, 'the stand is up on screen;');

  // and now the same decision, arrived from the chain instead of pending
  O.decisions = O.pending.slice(); O.pending = [];
  O.build();
  eq(O.game.clubs['c1'].cap, shown, 'and the landing changed nothing;');
});

t('a decision our own rules refuse never reaches a wallet', () => {
  O.decisions = []; O.pending = []; O.build();
  let asked = 0;
  const realTx = SF.Tx;
  SF.Tx = { decide: async () => { asked++; } };
  try {
    // forty steps of stand is far more than five million dollars buys
    O.decide(K.INVEST, SF.Replay.GROUND, 40, [], noop);
  } finally { SF.Tx = realTx; }
  eq(asked, 0, 'the wallet was never troubled;');
  eq(O.pending.length, 0, 'and nothing was left pending;');
  truthy(O.said && !O.said.ok, 'the screen was told why;');
  truthy(/not enough money/.test(O.said.why), O.said.why);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
