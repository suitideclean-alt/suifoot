// The prize economy. Offline nothing changes: prizes are the fixed values, created as they are won.
// Online they come out of a pool that the entry fees filled, and the project can never pay out more than came in.
const SF = require('./load.js');
const { Game, Owner: O, Bank: B, CFG } = SF;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };
const conserved = (G, m) => eq((G.bank.tminted || 0) - (G.bank.tburned || 0), B.ttotal(G), (m || '') + ' SFOOT not conserved;');

const withMode = (mode, fn) => { const was = CFG.prizeMode, wasFee = CFG.entryFee; CFG.prizeMode = mode; try { return fn(); } finally { CFG.prizeMode = was; CFG.entryFee = wasFee; } };

t('the ceiling in the config is really the most a season can hand out', () => {
  let worst = 0;
  for (const seed of [3, 11, 42, 77, 101]) {
    let gross = 0;
    const real = O.prize;
    O.prize = function (G, club, amt) { gross += Math.round(amt); return real.apply(this, arguments); };
    try {
      const G = Game.newGame({ seed, coaches: [{ name: 'A', role: 'both' }] });
      Game.simulateSeason(G);
    } finally { O.prize = real; }
    worst = Math.max(worst, gross);
  }
  console.log('      (o mais que uma época pediu: ' + worst + ' de um teto de ' + CFG.prizeTotal + ')');
  truthy(worst <= CFG.prizeTotal, `a season asked for ${worst}, over the ceiling of ${CFG.prizeTotal}`);
  truthy(worst > CFG.prizeTotal * 0.5, 'the ceiling is far above what a season really pays: it would waste the pool');
});

t('offline the prizes are exactly what they were', () => {
  const G = Game.newGame({ seed: 4, coaches: [{ name: 'A', role: 'owner' }] });
  eq(O.prizeFactor(G), 1, 'the factor is not 1 offline;');
  const sf0 = O.sfBal(G, G.coaches[0].id);
  Game.income(G, G.coaches[0].club, 100000, 'prize');
  eq(O.sfBal(G, G.coaches[0].id) - sf0, 100000, 'the owner did not get the whole prize;');
  conserved(G);
});

t('an investment moves SFOOT to the treasury instead of destroying it', () => {
  const G = Game.newGame({ seed: 6, coaches: [{ name: 'A', role: 'owner' }] });
  const co = G.coaches[0], club = G.clubs[co.club];
  const tr0 = O.treasuryBal(G), sf0 = O.sfBal(G, co.id), burned0 = G.bank.tburned || 0;
  const r = SF.Actions.upgradeFacility(G, co, 'train');
  truthy(r.ok, 'the upgrade failed: ' + JSON.stringify(r));
  eq(sf0 - O.sfBal(G, co.id), r.cost, 'the owner did not pay;');
  eq(O.treasuryBal(G) - tr0, r.cost, 'the treasury did not receive it;');
  eq(G.bank.tburned || 0, burned0, 'SFOOT was destroyed instead of moved;');
  conserved(G);
});

t('online the prizes come out of the pool and the pool is never overdrawn', () => withMode('pool', () => {
  const G = Game.newGame({ seed: 7, coaches: [{ name: 'A', role: 'owner' }] });
  const co = G.coaches[0];
  // an empty pool pays nothing at all
  Game.startSeason(G);
  eq(O.prizeFactor(G), 0, 'an empty pool still pays;');
  const sf0 = O.sfBal(G, co.id);
  Game.income(G, co.club, 100000, 'prize');
  eq(O.sfBal(G, co.id), sf0, 'a prize was paid out of an empty pool;');

  // fill it with entry fees and the prizes become a share of what came in
  CFG.entryFee = [160000, 80000, 40000, 20000];
  const r = O.payEntry(G, co, co.club);
  truthy(r.ok, 'the entry fee was refused: ' + JSON.stringify(r));
  eq(O.poolBal(G), Math.round(r.fee * CFG.poolShare), 'the pool did not take its share;');
  eq(O.treasuryBal(G), r.fee - Math.round(r.fee * CFG.poolShare), 'the treasury did not take the rest;');
  conserved(G);

  Game.startSeason(G);
  const f = O.prizeFactor(G);
  truthy(f > 0 && f < 1, 'the factor should be a fraction of the full prize, got ' + f);
  eq(f, Math.min(1, Math.floor((O.poolBal(G) / O.seasonLiability(G)) * 1e6) / 1e6), 'the factor is not the pool over what the human clubs could win;');

  const pool0 = O.poolBal(G), mint0 = G.bank.tminted;
  const before = O.sfBal(G, co.id);
  Game.income(G, co.club, 100000, 'prize');
  const got = O.sfBal(G, co.id) - before;
  eq(got, Math.round(100000 * f), 'the prize is not the listed value times the factor;');
  eq(pool0 - O.poolBal(G), got, 'the pool did not pay exactly what the owner received;');
  eq(G.bank.tminted, mint0, 'SFOOT was created online instead of moved;');
  conserved(G);
}));

t('a whole season online never pays more than the pool holds', () => withMode('pool', () => {
  CFG.entryFee = [160000, 80000, 40000, 20000];
  const G = Game.newGame({ seed: 9, coaches: [{ name: 'A', role: 'owner' }, { name: 'B', role: 'both' }] });
  for (const co of G.coaches) O.payEntry(G, co, co.club);
  const inflow = O.poolBal(G);
  const mint0 = G.bank.tminted;
  Game.startSeason(G);
  Game.simulateSeason(G);
  Game.newSeason(G);
  Game.simulateSeason(G);
  truthy(O.poolBal(G) >= 0, 'the pool went negative: ' + O.poolBal(G));
  truthy(inflow - O.poolBal(G) <= inflow, 'more came out of the pool than went in');
  eq(G.bank.tminted, mint0, 'SFOOT was created during an online season;');
  conserved(G, 'after two seasons');
  console.log(`      (entrou ${inflow}, saiu ${inflow - O.poolBal(G)}, sobra ${O.poolBal(G)})`);
}));

t('the factor is measured against the human clubs, not the whole table', () => withMode('pool', () => {
  CFG.entryFee = [160000, 80000, 40000, 20000];
  const G = Game.newGame({ seed: 14, coaches: [{ name: 'A', role: 'owner' }] });
  const co = G.coaches[0];
  O.payEntry(G, co, co.club);
  const few = O.seasonLiability(G);
  truthy(few < CFG.prizeTotal, 'one human club should not carry the whole table liability: ' + few);
  Game.startSeason(G);
  const f1 = O.prizeFactor(G);
  // the same pool against the whole table would be far meaner
  const naive = Math.min(1, Math.floor((O.poolBal(G) / CFG.prizeTotal) * 1e6) / 1e6);
  truthy(f1 > naive, `dividing by the whole table pays less (${naive}) than by the human clubs (${f1})`);
  console.log(`      (um clube humano: fator ${f1}, contra ${naive} se dividisse pela tabela toda)`);
}));

t('the treasury and the pool are real accounts the books can see', () => {
  const G = Game.newGame({ seed: 10, coaches: [{ name: 'A', role: 'owner' }] });
  Game.simulateSeason(G);
  const names = Object.keys(G.bank.tok);
  truthy(names.includes(O.TREASURY) || O.treasuryBal(G) === 0, 'the treasury is not an account');
  eq(O.treasuryBal(G), B.tbal(G, 't:treasury'), 'the treasury balance does not come from the account;');
  eq(O.poolBal(G), B.tbal(G, 't:pool'), 'the pool balance does not come from the account;');
  conserved(G);
  // and both survive a save and a load
  const H = Game.deserialize(Game.serialize(G));
  eq(O.treasuryBal(H), O.treasuryBal(G), 'the treasury did not survive the save;');
  eq(O.poolBal(H), O.poolBal(G), 'the pool did not survive the save;');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
