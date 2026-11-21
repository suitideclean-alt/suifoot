// Does the chain's league arrive as a game the browser can draw?
//
// The online league used to have a screen of its own. It should not: a club is a club and a squad
// is a squad, and whoever owns one ought to open the squad page and see it. These checks ask
// whether what comes back is the shape every existing screen already knows how to read.
const SF = require('./load.js');
require('../src/chain.js');
require('../src/replay.js');
require('../src/bridge.js');

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };

const ME = '0x' + 'ab'.repeat(32);
const POS = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW'];
const clubs = [];
for (let i = 1; i <= 18; i++) {
  const squad = [];
  for (let k = 0; k < 22; k++) {
    const n = i * 100 + k;
    squad.push({
      num: n, name: SF.Chain.playerName(n), pos: POS[k % 11], temper: 'pro',
      age: 20 + (n % 15), ovr: 40 + ((n * 7) % 30), pot: 80, cond: 100, mood: 60,
      wage: 1000, goals: 0, apps: 0, contractWeeks: 68,
    });
  }
  clubs.push({
    id: '0x' + String(i).padStart(64, '0'), num: i, name: SF.Chain.clubName(i),
    level: 3, series: 0, balance: 50000 + i * 1000, fans: 5000, capacity: 8000, ticket: 12,
    owner: i === 3 ? ME : null,
    played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0, lastPos: 0, squad,
  });
}
const seeds = [];
for (let w = 0; w < 10; w++) seeds.push((Math.imul(w + 1, 0x9e3779b9) >>> 0));
const world = {
  league: { season: 1, week: 11, rosters: [clubs.map((c) => c.num)], seeds, weeks: 34, bottom: 3, manual: true },
  clubs,
};

const G = SF.Bridge.toGame(world, ME);

t('it is the shape the game carries in memory', () => {
  truthy(G.clubs && G.players && G.bank, 'clubs, men and a bank;');
  eq(G.clubIds.length, 18, 'eighteen clubs;');
  eq(Object.keys(G.players).length, 18 * 22, 'and every man in them;');
  eq(G.season, 1, 'the season the chain says;');
  eq(G.week, 11, 'and the matchday;');
});

t('a club is a club', () => {
  const c = G.clubs[G.clubIds[0]];
  truthy(c.name && c.c1 && c.c2, 'a name and its colours;');
  eq(c.squad.length, 22, 'a squad;');
  truthy(c.fans > 0 && c.cap > 0, 'a crowd and a ground;');
  truthy(SF.Econ.strength(G, c) > 0, 'and a strength the game can work out;');
});

t('a man is a man, as the game expects one', () => {
  const p = G.players[G.clubs[G.clubIds[0]].squad[0]];
  for (const f of ['id', 'n', 'pos', 'age', 'ovr', 'pot', 'wage', 'ct', 'club', 'mood', 'tp', 'cond'])
    truthy(p[f] != null, `he has ${f};`);
  truthy(p.ct > 0, 'and a contract with time left on it;');
});

t('what the chain played is what the table says', () => {
  for (const id of G.clubIds) eq(G.clubs[id].table.p, 10, G.clubs[id].name + ' played ten;');
  const gf = G.clubIds.reduce((n, id) => n + G.clubs[id].table.gf, 0);
  const ga = G.clubIds.reduce((n, id) => n + G.clubs[id].table.ga, 0);
  eq(gf, ga, 'and every goal scored was conceded;');
});

t('my club is mine, and nobody else is', () => {
  const mine = G.clubIds.filter((id) => G.clubs[id].mine);
  eq(mine.length, 1, 'one club;');
  eq(G.clubs[mine[0]].num, 3, 'the one the chain says I own;');
  eq(G.coaches.length, 1, 'and I am its coach;');
  eq(G.coaches[0].club, mine[0], 'at that club;');
  eq(G.me, mine[0], 'which is the one the screens default to;');
});

t('somebody who owns nothing is a spectator, not an impostor', () => {
  const S = SF.Bridge.toGame(world, null);
  eq(S.me, null, 'no club of his own;');
  eq(S.coaches.length, 1, 'but a seat, because every screen asks whose view it draws;');
  eq(S.coaches[0].club, null, 'with no club in it;');
  eq(S.clubIds.length, 18, 'and the league all there to look at;');
});

t('the season has a shape the screens can read', () => {
  eq(G.sched.length, 34, 'thirty-four matchdays for eighteen clubs;');
  eq(G.sched[0].fx.length, 9, 'nine matches on each;');
  const first = G.sched[0].fx[0];
  truthy(G.clubs[first[0]] && G.clubs[first[1]], 'played by clubs the game knows;');
  truthy(G.cup, 'and a cup to be drawn;');
});

t('the bank knows what each club has', () => {
  for (const id of G.clubIds) {
    const c = G.clubs[id];
    truthy(SF.Bank.bal(G, id) !== 0, c.name + ' has an account with money in it;');
  }
});

t('it says it is the chain, so screens can tell', () => {
  truthy(SF.Bridge.isOnline(G), 'this one is;');
  truthy(!SF.Bridge.isOnline(SF.Game.newGame({ seed: 1 })), 'and an offline game is not;');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
