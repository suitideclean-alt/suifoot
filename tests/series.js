/* Two series at the same level.
 *
 * A league opens with one series at the foot and opens another when the first is full. The chain
 * has always carried this - a club knows its series, the league holds one roster per series - but
 * the reader used to set a club's series to its level, which is only right while there is one
 * series per level. Two series of eighteen became a single division of thirty-six: one table, the
 * wrong fixtures, and a season of the wrong length.
 *
 * These are the properties that must hold however wide the foot gets. */
const SF = require('./load.js');
require('../src/chain.js'); require('../src/genesis.js'); require('../src/replay.js');

let pass = 0, fail = 0;
const ok = (name, cond, note) => {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (note ? '\n      ' + note : '')); }
};

const POS = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW'];

/** a chain world with `sers` series of `size` clubs standing at the foot */
function world(sers, size, weeks) {
  const clubs = [];
  for (let i = 1; i <= sers * size; i++) {
    const squad = [];
    for (let k = 0; k < 22; k++) {
      const n = i * 100 + k;
      squad.push({ num: n, name: 'p' + n, pos: POS[k % 11], temper: 'pro', age: 25, ovr: 50,
        pot: 70, cond: 100, mood: 60, wage: 1000, goals: 0, apps: 0, contractWeeks: 68 });
    }
    clubs.push({ id: '0x' + i, num: i, name: 'c' + i, level: 3, series: Math.floor((i - 1) / size),
      balance: 500000, fans: 5000, capacity: 8000, ticket: 12, owner: null, coach: null,
      played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0, lastPos: 0, squad });
  }
  const rosters = [];
  for (let s = 0; s < sers; s++) rosters.push(clubs.filter((c) => c.series === s).map((c) => c.num));
  const seeds = [];
  for (let w = 0; w < weeks; w++) seeds.push(Math.imul(w + 1, 0x9e3779b9) >>> 0);
  return { league: { season: 1, week: weeks + 1, rosters, seeds, weeks: 50, bottom: 3, manual: true }, clubs };
}

function sizes(G) {
  const by = {};
  for (const id of G.clubIds) { const s = SF.Game.serOf(G.clubs[id]); by[s] = (by[s] || 0) + 1; }
  return by;
}

/* One series: the case that is live today. Nothing about it may change. */
{
  const G = SF.Replay.run(world(1, 18, 50), []);
  const by = sizes(G);
  ok('one series stands alone at the foot', Object.keys(by).length === 1 && by[3] === 18, JSON.stringify(by));
  ok('one series is one division', G.divs.filter((d) => d.length).length === 1);
}

/* Two series: side by side, not merged. */
{
  const G = SF.Replay.run(world(2, 18, 50), []);
  const by = sizes(G);
  ok('two series are two series', Object.keys(by).length === 2, JSON.stringify(by));
  ok('neither holds the other\'s clubs', by[3] === 18 && by[4] === 18, JSON.stringify(by));
  ok('two divisions of eighteen, not one of thirty-six',
    G.divs.filter((d) => d.length === 18).length === 2 && !G.divs.some((d) => d.length > 18),
    G.divs.map((d) => d.length).join('/'));
  const played = G.clubIds.map((id) => G.table[id].p);
  ok('every club plays the same season', Math.min(...played) === Math.max(...played),
    Math.min(...played) + '-' + Math.max(...played));
  /* Eighteen clubs play seventeen at home and seventeen away, whatever else stands beside them.
   * A wider foot puts more Cup rounds in the calendar, so the league matchdays sit further apart -
   * but there are still exactly thirty-four of them. */
  ok('a season is the length of a series, not of the foot', Math.max(...played) === 34,
    String(Math.max(...played)));
  /* Each series must have its own table: a club can only be first in its own. */
  const tops = G.divs.filter((d) => d.length).map((d) => d.slice().sort((a, b) => G.table[b].pts - G.table[a].pts)[0]);
  ok('each series crowns its own', new Set(tops).size === 2);
  /* Nobody may play a club from the other series. */
  let crossed = 0;
  for (const r of G.res || []) {
    const h = G.clubs[r.h], a = G.clubs[r.a];
    if (h && a && SF.Game.serOf(h) !== SF.Game.serOf(a)) crossed++;
  }
  ok('no club meets the other series in the league', crossed === 0, crossed + ' cross-series matches');
}

/* Three series, and an odd one of a different size - a series that has just opened and is not
 * full yet. The short one must not drag the others down or crash the weeks it has no fixtures. */
{
  const w = world(2, 18, 50);
  /* bolt on a third series holding only six clubs */
  for (let i = 101; i <= 106; i++) {
    const squad = [];
    for (let k = 0; k < 22; k++) {
      const n = i * 100 + k;
      squad.push({ num: n, name: 'p' + n, pos: POS[k % 11], temper: 'pro', age: 25, ovr: 50,
        pot: 70, cond: 100, mood: 60, wage: 1000, goals: 0, apps: 0, contractWeeks: 68 });
    }
    w.clubs.push({ id: '0x' + i, num: i, name: 'c' + i, level: 3, series: 2, balance: 500000,
      fans: 5000, capacity: 8000, ticket: 12, owner: null, coach: null, played: 0, won: 0,
      drawn: 0, lost: 0, gf: 0, ga: 0, points: 0, lastPos: 0, squad });
  }
  w.league.rosters.push([101, 102, 103, 104, 105, 106]);
  let G = null, err = null;
  try { G = SF.Replay.run(w, []); } catch (e) { err = e; }
  ok('a half-full series does not bring the league down', !err, err && err.message);
  if (G) {
    const by = sizes(G);
    ok('the short series keeps its own six', by[5] === 6, JSON.stringify(by));
    const big = G.clubIds.filter((id) => SF.Game.serOf(G.clubs[id]) === 3).map((id) => G.table[id].p);
    ok('the full series still plays its full season', Math.max(...big) === 34, String(Math.max(...big)));
    const small = G.clubIds.filter((id) => SF.Game.serOf(G.clubs[id]) === 5).map((id) => G.table[id].p);
    /* Six clubs play five at home and five away: ten matchdays, then nothing. */
    ok('the short series plays only the matches it has', Math.max(...small) === 10, String(Math.max(...small)));
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
