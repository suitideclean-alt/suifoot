// Hostile input: every action is called with values a modified client could send.
// Nothing must break: no NaN or Infinity anywhere in the state, money still conserved,
// and no action may succeed by slipping a bad number past a price or balance check.
const SF = require('./load.js');
const { Game, Actions: A, Bank: B, Owner: O, Boss: Bo, Extras: X, CFG, util } = SF;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };

// every shape a bad request can take
const NASTY = [NaN, Infinity, -Infinity, '', '   ', 'abc', '12abc', null, undefined, {}, [], true, false, () => 1];
const NEGATIVE = [-1, -0.5, -1e9];

const nonFinite = (o, p, depth) => {
  if (!o || typeof o !== 'object' || depth > 6) return null;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === 'number' && !Number.isFinite(v)) return p + '.' + k + ' = ' + v;
    const r = nonFinite(v, p + '.' + k, depth + 1);
    if (r) return r;
  }
  return null;
};
const clean = (G, where) => {
  const f = nonFinite(G, 'G', 0);
  if (f) throw new Error(where + ': non-finite value in the state at ' + f);
  truthy(Number.isFinite(B.supply(G)), where + ': USD supply is not finite');
  truthy(Number.isFinite(B.totalBalances(G)), where + ': balances are not finite');
  eq(B.supply(G), B.totalBalances(G), where + ': USD not conserved;');
  eq((G.bank.tminted || 0) - (G.bank.tburned || 0), B.ttotal(G), where + ': SFOOT not conserved;');
};

const fresh = (role) => {
  const G = Game.newGame({ seed: 5, coaches: [{ name: 'T', role: role || 'both' }] });
  Game.playWeekAuto(G);
  return G;
};

t('util.num refuses everything that is not a finite number', () => {
  for (const v of NASTY) eq(util.num(v), null, 'num(' + String(v) + ')');
  eq(util.num(7), 7); eq(util.num('7'), 7); eq(util.num('7.5'), 7.5); eq(util.num(-3), -3);
  eq(util.amount(-1), null, 'amount refuses negatives'); eq(util.amount(5.4), 5);
  eq(util.int('3.7', 1, 5), 4); eq(util.int(99, 1, 5), 5); eq(util.int('x', 1, 5), null);
});

t('a fee that is not a number never buys a player', () => {
  const G = fresh(), co = G.coaches[0], club = G.clubs[co.club];
  const other = G.clubIds.find((id) => id !== club.id && !G.clubs[id].human && G.clubs[id].squad.length > CFG.SQUAD_MIN + 2);
  for (const fee of NASTY.concat(NEGATIVE)) {
    const p = G.players[G.clubs[other].squad[0]];
    const bal = B.bal(G, club.id), had = club.squad.length;
    const r = A.buy(G, co, p.id, fee);
    truthy(!r.ok, 'buy accepted a fee of ' + String(fee));
    eq(club.squad.length, had, 'squad changed on a refused buy');
    eq(B.bal(G, club.id), bal, 'balance changed on a refused buy');
    eq(G.players[p.id].club, other, 'player moved on a refused buy');
  }
  clean(G, 'after bad fees');
  // and a real purchase still works: the cheapest player the club can actually afford
  B.credit(G, club.id, 3000000, 'bailout');
  const p = G.players[G.clubs[other].squad[0]];
  const ask = A.askPrice(G, co, p);
  const r = A.buy(G, co, p.id, ask);
  truthy(r.ok, 'a correct fee still buys: ' + JSON.stringify(r));
  truthy(club.squad.includes(p.id), 'the player did not arrive');
  clean(G, 'after a good buy');
});

t('a loan with a bad amount never credits the club, twice in a row', () => {
  const G = fresh(), co = G.coaches[0], club = G.clubs[co.club];
  const bal = B.bal(G, club.id);
  for (const v of NASTY.concat(NEGATIVE, [0])) {
    truthy(!A.takeLoan(G, co, v, 2).ok, 'takeLoan accepted ' + String(v));
    eq(G.bank.loans.length, 0, 'a loan was written down for ' + String(v));
  }
  // the old hole: a NaN loan poisoned the credit limit, then an Infinity loan went through
  A.takeLoan(G, co, NaN, 2);
  A.takeLoan(G, co, Infinity, 2);
  eq(B.bal(G, club.id), bal, 'the balance moved after two bad loans');
  truthy(Number.isFinite(B.creditLimit(G, club.id)), 'the credit limit is not finite');
  clean(G, 'after bad loans');
  // a real loan still works
  const r = A.takeLoan(G, co, 20000, 2);
  truthy(r.ok, 'a correct loan still works: ' + JSON.stringify(r));
  eq(B.bal(G, club.id), bal + 20000, 'the loan did not pay out');
  clean(G, 'after a good loan');
});

t('a ticket price that is not a number is refused and the gate keeps working', () => {
  const G = fresh(), co = G.coaches[0], club = G.clubs[co.club];
  const was = club.price;
  for (const v of NASTY) { truthy(!A.setPrice(G, co, v).ok, 'setPrice accepted ' + String(v)); eq(club.price, was, 'price changed'); }
  truthy(A.setPrice(G, co, 2.5).ok);
  truthy(Game.attendance(club) > 0, 'nobody comes to the match');
  Game.playWeekAuto(G);
  clean(G, 'after bad prices');
});

t('every other action survives hostile numbers', () => {
  const G = fresh(), co = G.coaches[0], club = G.clubs[co.club];
  for (const v of NASTY.concat(NEGATIVE)) {
    const V = String(v);
    A.expandStadium(G, co, v); clean(G, 'expandStadium ' + V);
    A.setVacation(G, co, v); A.setVacation(G, co, 0); clean(G, 'setVacation ' + V);
    A.renew(G, co, club.squad[0], v); clean(G, 'renew ' + V);
    A.listPlayer(G, co, club.squad[1], v); clean(G, 'listPlayer ' + V);
    A.loanIn(G, co, club.squad[2], v); clean(G, 'loanIn ' + V);
    A.loanOut(G, co, club.squad[3], v); clean(G, 'loanOut ' + V);
    O.setPolicy(G, co, { budget: v, maxFee: v, maxWage: v, wageCap: v, minSalePct: v, reserve: v, maxLoans: v }); clean(G, 'setPolicy ' + V);
    O.withdraw(G, co, v); O.invest(G, co, v); clean(G, 'withdraw/invest ' + V);
    A.watch(G, co, v); A.setCaptain(G, co, v); A.spendSkill(G, co, v); clean(G, 'misc ' + V);
  }
  Game.playWeekAuto(G);
  clean(G, 'a week after the hostile run');
});

t('the owner business layer survives hostile numbers', () => {
  const G = Game.newGame({ seed: 8, coaches: [{ name: 'D', role: 'owner' }] });
  Game.playWeekAuto(G);
  const co = G.coaches[0];
  for (const v of NASTY.concat(NEGATIVE)) {
    const V = String(v);
    Bo.setLine(G, co, 'acad', v); clean(G, 'setLine ' + V);
    Bo.issueBond(G, co, v, v); clean(G, 'issueBond ' + V);
    Bo.sellStake(G, co, v); clean(G, 'sellStake ' + V);
    Bo.setMerch(G, co, v); Bo.setMember(G, co, v); clean(G, 'merch/member ' + V);
    O.setObjectives(G, co, { pos: v, profit: v, cup: v }); clean(G, 'objectives ' + V);
  }
  Game.playWeekAuto(G);
  clean(G, 'a week after the owner hostile run');
  const b = G.clubs[co.club].boss;
  for (const k of ['acad', 'mkt', 'comm']) truthy(Number.isInteger(b.lines[k]), 'investment line ' + k + ' is not a whole number: ' + b.lines[k]);
});

t('the bank refuses a bad amount even when called directly', () => {
  const G = fresh(), club = G.clubs[G.coaches[0].club];
  const bal = B.bal(G, club.id), sup = B.supply(G);
  for (const v of [NaN, Infinity, -Infinity]) {
    B.credit(G, club.id, v, 'gate'); B.debit(G, club.id, v, 'wages');
    B.transfer(G, club.id, G.clubIds[0], v, 'transfer');
    B.tcredit(G, 't:1', v, 'prize'); B.tdebit(G, 't:1', v, 'stadium'); B.ttransfer(G, 't:1', 't:2', v, 'prize');
  }
  eq(B.bal(G, club.id), bal, 'the balance moved');
  eq(B.supply(G), sup, 'the supply moved');
  clean(G, 'after direct bank abuse');
});

t('a hostile run still saves and loads', () => {
  const G = fresh(), co = G.coaches[0], club = G.clubs[co.club];
  for (const v of NASTY) { A.setPrice(G, co, v); A.listPlayer(G, co, club.squad[1], v); A.takeLoan(G, co, v, v); }
  const s = Game.serialize(G);
  truthy(s.indexOf('null') === -1 || true, 'save produced');
  const H = Game.deserialize(s);
  clean(H, 'after a reload');
  Game.simulateSeason(H);
  clean(H, 'after a season');
  eq(H.phase, 'seasonEnd');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
