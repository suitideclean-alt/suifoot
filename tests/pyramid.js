// The league grows downwards: a level holds several series, and what climbs out of them matches
// what comes down from above. With one series per level this is the ladder the game has always had.
const SF = require('./load.js');
const { Game, CFG, Bank: B } = SF;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };

const withShape = (shape, promote, fn) => {
  const s0 = CFG.series, p0 = CFG.promote;
  CFG.series = shape; CFG.promote = promote;
  try { return fn(); } finally { CFG.series = s0; CFG.promote = p0; }
};

t('the ladder we already had is one series per level', () => {
  const sers = Game.buildSeries();
  eq(sers.length, 4, 'four series;');
  eq(sers[0].parent, -1, 'the top has nothing above it;');
  eq(sers[0].kids.length, 1); eq(sers[1].parent, 0);
  eq(sers[3].kids.length, 0, 'the bottom has nothing below it;');
});

t('a pyramid that quadruples: 1, 4, 16, 64 series', () => withShape([1, 4, 16, 64], 1, () => {
  const sers = Game.buildSeries();
  eq(sers.length, 85, 'series;');
  eq(sers.filter((x) => x.lvl === 0).length, 1);
  eq(sers.filter((x) => x.lvl === 3).length, 64);
  eq(sers[0].kids.length, 4, 'the top series feeds four below it;');
  for (const s of sers) if (s.parent >= 0) truthy(sers[s.parent].kids.includes(sers.indexOf(s)), 'a series is not among its parent children');
  eq(sers.length * CFG.PER_DIV, 1530, 'clubs in the pyramid;');
}));

t('what goes up and what comes down always balance', () => {
  for (const [shape, promote] of [[[1, 1, 1, 1], 2], [[1, 4, 16, 64], 1], [[1, 4, 16, 64], 2], [[1, 2, 4], 3]]) {
    withShape(shape, promote, () => {
      const G = { sers: Game.buildSeries() };
      for (let si = 0; si < G.sers.length; si++) {
        const kids = G.sers[si].kids;
        if (!kids.length) continue;
        const down = Game.downFrom(G, si);
        const sobem = kids.length * CFG.promote; // one promotion from each series below
        eq(down, sobem, `shape ${JSON.stringify(shape)} promote ${promote}, series ${si}: places freed and places claimed differ;`);
      }
    });
  }
});

t('a pyramid season runs: every series plays, promotes and relegates', () => withShape([1, 4, 16], 1, () => {
  const G = Game.newGame({ seed: 5, coaches: [{ name: 'A', role: 'both' }] });
  eq(G.divs.length, 21, 'series in play;');
  eq(G.clubIds.length, 21 * CFG.PER_DIV, 'clubs;');
  for (const d of G.divs) eq(d.length, CFG.PER_DIV, 'a series does not hold a full set;');
  Game.simulateSeason(G);
  eq(G.phase, 'seasonEnd');
  // every club played a full programme in its own series
  for (const id of G.clubIds) eq(G.table[id].p, CFG.LEAGUE_WEEKS, `${id} did not play every match;`);
  const s = G.summary;
  eq(s.champions.length, 21, 'one champion per series;');
  eq(s.promoted.length, 20, 'one climbs out of every series but the top;');
  eq(s.relegated.length, 5 * CFG.promote * 4, 'four come down from each series that has children;');
  Game.newSeason(G);
  // and the shape survives the turn of the season
  eq(G.divs.length, 21);
  for (const d of G.divs) eq(d.length, CFG.PER_DIV, 'a series lost or gained clubs over the season turn;');
  eq(B.supply(G), B.totalBalances(G), 'the books stopped balancing;');
}));

t('a club that climbs ends up in the series above, and one that falls in a series below', () => withShape([1, 4, 16], 1, () => {
  const G = Game.newGame({ seed: 9, coaches: [{ name: 'A', role: 'both' }] });
  Game.simulateSeason(G);
  const subiu = G.summary.promoted[0], desceu = G.summary.relegated[0];
  const antesS = Game.serOf(G.clubs[subiu]), antesD = Game.serOf(G.clubs[desceu]);
  Game.newSeason(G);
  const depoisS = Game.serOf(G.clubs[subiu]), depoisD = Game.serOf(G.clubs[desceu]);
  eq(depoisS, G.sers[antesS].parent, 'the club that climbed did not land in the series above;');
  truthy(G.sers[antesD].kids.includes(depoisD), 'the club that fell did not land in a series below');
  eq(G.clubs[subiu].div, G.sers[depoisS].lvl, 'its level does not match its series;');
  truthy(G.divs[depoisS].includes(subiu), 'it is not in the table of its new series');
}));

t('five seasons of a pyramid keep every series full', () => withShape([1, 4, 16], 1, () => {
  const G = Game.newGame({ seed: 11, coaches: [{ name: 'A', role: 'both' }] });
  for (let s = 0; s < 5; s++) {
    Game.simulateSeason(G);
    Game.newSeason(G);
    for (let si = 0; si < G.divs.length; si++) eq(G.divs[si].length, CFG.PER_DIV, `season ${s + 1}, series ${si} holds the wrong number;`);
    const vistos = new Set();
    for (const d of G.divs) for (const id of d) { truthy(!vistos.has(id), id + ' plays in two series'); vistos.add(id); }
    eq(vistos.size, G.clubIds.length, 'a club is not in any series;');
  }
  eq(B.supply(G), B.totalBalances(G), 'the books stopped balancing;');
}));

t('old saves, which knew only divisions, come across to series', () => {
  const G = Game.newGame({ seed: 13, coaches: [{ name: 'A', role: 'both' }] });
  Game.playWeekAuto(G);
  const velho = JSON.parse(Game.serialize(G));
  delete velho.mig; delete velho.sers;
  for (const id of velho.clubIds) { delete velho.clubs[id].ser; delete velho.clubs[id].nextSer; }
  const H = Game.deserialize(JSON.stringify(velho));
  truthy(H.sers && H.sers.length === 4, 'the series were not rebuilt');
  for (const id of H.clubIds) eq(Game.serOf(H.clubs[id]), H.clubs[id].div, `${id}: its series is not its old division;`);
  Game.simulateSeason(H); Game.newSeason(H);
  eq(H.divs.length, 4); for (const d of H.divs) eq(d.length, 18);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
