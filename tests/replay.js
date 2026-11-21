// Does working the season out give a season worth having?
//
// The chain keeps the clubs as they were made and one number a matchday. Everything else is worked
// out here. These checks ask the two questions that matter: that the answer is the same every time
// (otherwise two people see two leagues), and that it is a football season rather than noise.
const SF = require('./load.js');
require('../src/chain.js');
require('../src/replay.js');

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };

// a world shaped exactly as the chain hands one over
const POS = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW'];
function squadOf(clubNum) {
  const out = [];
  for (let i = 0; i < 22; i++) {
    const n = clubNum * 100 + i;
    out.push({
      num: n, name: SF.Chain.playerName(n), pos: POS[i % POS.length], temper: 'pro',
      age: 20 + (n % 15), ovr: 40 + ((n * 7) % 30), pot: 70 + (n % 20),
      cond: 100, mood: 60, wage: 1000, goals: 0, apps: 0,
    });
  }
  return out;
}
const clubs = [];
for (let i = 1; i <= 12; i++) {
  clubs.push({
    id: '0x' + String(i).padStart(64, '0'), num: i, name: SF.Chain.clubName(i),
    level: 3, series: 0, balance: 50000, fans: 5000, capacity: 8000, ticket: 12, owner: null,
    played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0, lastPos: 0,
    squad: squadOf(i),
  });
}
const weeks = 22;
const seeds = [];
for (let w = 0; w < weeks; w++) seeds.push((Math.imul(w + 1, 0x9e3779b9) >>> 0));
const world = {
  league: { season: 1, week: weeks + 1, rosters: [clubs.map((c) => c.num)], seeds, weeks, manual: true },
  clubs,
};

const a = SF.Replay.run(world, null);
const b = SF.Replay.run(world, null);

t('two people working out the same season get the same season', () => {
  eq(JSON.stringify(a.results), JSON.stringify(b.results), 'every result, in order;');
  eq(JSON.stringify(a.clubs), JSON.stringify(b.clubs), 'and every club after it;');
});

t('the clubs the chain gave us are not touched', () => {
  eq(world.clubs[0].played, 0, 'the genesis club has played nothing;');
  eq(world.clubs[0].squad[0].apps, 0, 'and its men have no games;');
  truthy(a.clubs[0].played > 0, 'while the worked-out one has;');
});

t('a whole season was played', () => {
  eq(a.results.length, weeks * 6, 'six matches a matchday;');
  for (const c of a.clubs) eq(c.played, weeks, c.name + ' played every matchday;');
});

t('the table adds up', () => {
  let gf = 0, ga = 0, pts = 0, won = 0, drawn = 0;
  for (const c of a.clubs) {
    eq(c.won + c.drawn + c.lost, c.played, c.name + ': every game is a win, a draw or a loss;');
    eq(c.points, c.won * 3 + c.drawn, c.name + ': points follow results;');
    gf += c.gf; ga += c.ga; pts += c.points; won += c.won; drawn += c.drawn;
  }
  eq(gf, ga, 'every goal scored was conceded by somebody;');
  eq(drawn % 2, 0, 'a draw is drawn by two;');
  eq(pts, won * 3 + drawn, 'and the points in the league are the results in it;');
});

t('it looks like football', () => {
  const goals = a.results.reduce((n, r) => n + r.hg + r.ag, 0) / a.results.length;
  truthy(goals > 1.5 && goals < 4.5, `${goals.toFixed(2)} goals a game;`);
  const home = a.results.filter((r) => r.hg > r.ag).length;
  const away = a.results.filter((r) => r.ag > r.hg).length;
  truthy(home > away, `home wins ${home}, away wins ${away};`);
});

t('the men are marked by the matches they played', () => {
  const c = a.clubs[0];
  const played = c.squad.filter((p) => p.apps > 0);
  truthy(played.length >= 11, `${played.length} men got a game;`);
  truthy(played.every((p) => p.cond < 100), 'and every one of them is tired;');
  const scorers = c.squad.filter((p) => p.goals > 0);
  truthy(scorers.length > 0, `${scorers.length} of them scored;`);
  eq(c.squad.reduce((n, p) => n + p.goals, 0), c.gf, 'and their goals are the club\'s goals;');
});

t('a different draw gives a different season', () => {
  const other = { ...world, league: { ...world.league, seeds: seeds.map((s) => (s ^ 0x5bf03635) >>> 0) } };
  const c = SF.Replay.run(other, null);
  truthy(JSON.stringify(c.results) !== JSON.stringify(a.results), 'the matchdays went differently;');
  eq(c.results.length, a.results.length, 'but it was the same length of season;');
});

t('each match in a matchday has dice of its own', () => {
  const s = new Set();
  for (let i = 0; i < 6; i++) s.add(SF.Replay.seedFor(seeds[0], i));
  eq(s.size, 6, 'six matches, six numbers;');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
