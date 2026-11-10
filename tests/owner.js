// Owner / coach layer: limits, approvals, contracts, pay-offs, abuse attempts.
const SF = require('./load.js');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } }
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };
const { Game, Actions: A, Bank: B, Owner: O, CFG } = SF;
const conserved = (G) => eq(B.supply(G), B.totalBalances(G), 'money conserved');

function setup(role, seed) {
  const G = Game.newGame({ seed: seed || 7, coaches: [{ name: 'A', role }] });
  const co = G.coaches[0], club = G.clubs[co.club];
  B.credit(G, club.id, 3000000, 'bailout');
  // a seller club with a mid-value player
  const seller = G.clubIds.map((id) => G.clubs[id]).find((c) => !c.human && !c.foreign && c.div === club.div && c.id !== club.id);
  const p = G.players[seller.squad.slice().sort((a, b) => G.players[b].ovr - G.players[a].ovr)[3]];
  return { G, co, club, seller, p };
}

t('coach role: a buy above the fee limit is stopped and a request is created', () => {
  const { G, co, club, p } = setup('coach');
  O.policy(G, club).maxFee = 1;
  const r = A.buy(G, co, p.id, A.askPrice(G, co, p));
  eq(r.err, 'needs_approval'); eq(r.why, 'fee');
  eq(O.openFor(G, club.id).length, 1); eq(p.club === club.id, false, 'player did not move');
});

t('computer owner decides at the end of the week; approval works once only', () => {
  const { G, co, club, p } = setup('coach');
  co.board = 80; O.policy(G, club).maxFee = 1;
  const fee = A.askPrice(G, co, p);
  A.buy(G, co, p.id, fee);
  Game.playWeekAuto(G);
  const ap = G.approvals[0]; eq(ap.status, 'ok', 'approved');
  const r = A.buy(G, co, p.id, A.askPrice(G, co, p));
  truthy(r.ok, 'bought after approval: ' + JSON.stringify(r)); eq(G.approvals[0].status, 'used');
  // the token is spent: selling and buying another player needs a new request
  const q = G.players[G.clubs[p.club === club.id ? G.clubIds.find((x) => x !== club.id && !G.clubs[x].human && G.clubs[x].div === club.div) : p.club].squad[0]];
  eq(A.buy(G, co, q.id, A.askPrice(G, co, q)).err, 'needs_approval');
  conserved(G);
});

t('an approval is tied to one player and one cost: it cannot be reused for another', () => {
  const { G, co, club, seller, p } = setup('coach');
  co.board = 80; O.policy(G, club).maxFee = 1;
  A.buy(G, co, p.id, A.askPrice(G, co, p));
  Game.playWeekAuto(G);
  const other = G.players[seller.squad.find((id) => id !== p.id)];
  eq(A.buy(G, co, other.id, A.askPrice(G, co, other)).err, 'needs_approval');
  eq(A.buy(G, co, p.id, A.askPrice(G, co, p)).ok, true);
});

t('abuse: many cheap buys cannot get around the season budget', () => {
  const { G, co, club, seller } = setup('coach');
  const pol = O.policy(G, club);
  const ids = seller.squad.slice(0, 3);
  const fees = ids.map((id) => A.askPrice(G, co, G.players[id]));
  pol.maxFee = 1e9; pol.budget = Math.round(fees[0] * 1.4); pol.reserve = 0; pol.wageCap = 1e9; pol.maxWage = 1e9;
  eq(A.buy(G, co, ids[0], fees[0]).ok, true);
  const r = A.buy(G, co, ids[1], fees[1]);
  eq(r.err, 'needs_approval'); eq(r.why, 'budget');
});

t('abuse: selling below the minimum price or an untouchable is stopped; computer owner declines', () => {
  const { G, co, club } = setup('coach');
  const p = G.players[club.squad[0]];
  O.policy(G, club).untouchable.push(p.id);
  const r = A.sellNow(G, co, p.id);
  eq(r.err, 'needs_approval'); eq(r.why, 'untouchable');
  co.board = 40; Game.playWeekAuto(G);
  eq(G.approvals[0].status, 'no');
  eq(A.sellNow(G, co, p.id).err, 'needs_approval');
  const q = G.players[club.squad[5]]; O.policy(G, club).minSalePct = 5;
  eq(A.listPlayer(G, co, q.id, 100).why, 'minprice');
});

t('owner-only actions (stadium, facilities, debt) always need approval for a coach, never for owner-coach', () => {
  const a = setup('coach');
  eq(A.expandStadium(a.G, a.co, 1).err, 'needs_approval');
  eq(A.takeLoan(a.G, a.co, 1000, 1).err, 'needs_approval');
  const b = setup('both');
  truthy(A.expandStadium(b.G, b.co, 1).ok, 'owner-coach expands directly');
  b.club.policy = O.policy(b.G, b.club); b.club.policy.maxFee = 1;
  truthy(A.buy(b.G, b.co, b.p.id, A.askPrice(b.G, b.co, b.p)).ok, 'limits do not bind the owner-coach');
});

t('salary is paid weekly from the club to the coach and money is conserved', () => {
  const { G, co, club } = setup('coach');
  const w0 = O.walletBal(G, co.id), left0 = co.contract.left;
  Game.playWeekAuto(G); Game.playWeekAuto(G);
  eq(O.walletBal(G, co.id) - w0, co.contract.wage * 2, 'two weeks of salary');
  eq(left0 - co.contract.left, 2); conserved(G);
});

t('sacked without just cause: remaining salary in instalments; cap and break clause apply', () => {
  const { G, co, club } = setup('coach');
  const c = co.contract, rem = O.remaining(co);
  eq(O.sackAmount(G, co), rem);
  c.cap = true; club.pos = club.target + 3; eq(O.sackAmount(G, co), Math.min(rem, c.wage * CFG.owner.capWeeks), 'underperformance cap');
  c.cap = false; c.brk = 1234; eq(O.sackAmount(G, co), 1234, 'break clause replaces it');
  c.brk = null;
  const w0 = O.walletBal(G, co.id);
  A.sack(G, co, false);
  eq(co.contract, null); eq(G.owed.length, 1); eq(G.owed[0].total, rem);
  Game.playWeekAuto(G);
  truthy(O.walletBal(G, co.id) > w0, 'first instalment paid'); conserved(G);
  for (let i = 0; i < 400 && G.owed.length; i++) { if (G.phase === 'seasonEnd') Game.newSeason(G); else Game.playWeekAuto(G); }
  eq(G.owed.length, 0, 'fully paid'); conserved(G);
});

t('mitigation: a new job reduces the instalments', () => {
  const { G, co, club } = setup('coach');
  A.sack(G, co, false);
  const o = G.owed[0]; const full = Math.min(o.weekly, o.left);
  const target = G.clubIds.find((id) => !G.clubs[id].human && G.clubs[id].div === club.div && id !== club.id);
  co.offers.push({ id: 99, club: target, ttl: 6, seen: 0 });
  truthy(A.acceptJob(G, co, 99).ok);
  const before = O.walletBal(G, co.id);
  Game.playWeekAuto(G);
  const gained = O.walletBal(G, co.id) - before; // salary of the new job + reduced instalment
  const expectInstalment = Math.max(0, full - co.contract.wage);
  eq(gained, co.contract.wage + expectInstalment, 'salary plus reduced instalment'); conserved(G);
});

t('quitting without just cause: pays the exit clause, cannot sign for 8 weeks', () => {
  const { G, co, club } = setup('coach');
  B.credit(G, O.wallet(co.id), 10000000, 'bailout');
  const fee = O.exitFee(co), c0 = B.bal(G, club.id);
  eq(fee, Math.round(O.remaining(co) * 0.5));
  A.resign(G, co);
  eq(B.bal(G, club.id) - c0 >= fee - 1, true, 'club received the fee'); eq(co.ban, CFG.owner.ban);
  co.offers.push({ id: 98, club: club.id, ttl: 6, seen: 0 });
  eq(A.acceptJob(G, co, 98).err, 'banned');
  for (let i = 0; i < 20 && co.ban > 0; i++) Game.playWeekAuto(G);
  eq(co.ban, 0, 'ban ends after 8 economy weeks'); conserved(G);
});

t('late wages for 8 weeks give the coach just cause: he leaves, the club owes the rest', () => {
  const { G, co, club } = setup('coach');
  for (let i = 0; i < CFG.owner.late; i++) { co.contract.late++; }
  eq(O.justCauseCoach(co), true);
  const rem = O.remaining(co);
  const r = O.quit(G, co);
  eq(r.just, true); eq(r.fee, 0); eq(G.owed[0].total, rem); eq(co.ban || 0, 0, 'no ban');
});

t('club that cannot pay the salary falls behind; the counter resets when it pays again', () => {
  const { G, co, club } = setup('coach');
  B.debit(G, club.id, B.bal(G, club.id) + 1, 'fine'); // make the club broke
  // club.human clubs are not bailed out; the salary cannot be paid
  O.weekly(G); truthy(co.contract.late >= 1);
  B.credit(G, club.id, 5000000, 'bailout'); O.weekly(G); eq(co.contract.late, 0);
});

t('mutual termination: the offer sits between 40% and 60% of what is owed, no penalty', () => {
  const { G, co } = setup('coach');
  const rem = O.remaining(co), off = O.mutualOffer(G, co);
  truthy(off >= rem * 0.4 - 1 && off <= rem * 0.6 + 1, 'between 40 and 60 percent');
  const r = O.mutual(G, co); truthy(r.ok); eq(co.contract, null); eq(co.ban || 0, 0);
});

t('another club hires a coach under contract: it pays the current club', () => {
  const { G, co, club } = setup('coach');
  const target = G.clubs[G.clubIds.find((id) => !G.clubs[id].human && G.clubs[id].div === club.div && id !== club.id)];
  B.credit(G, target.id, 5000000, 'bailout');
  const fee = O.poachFee(co), c0 = B.bal(G, club.id), t0 = B.bal(G, target.id);
  co.offers.push({ id: 97, club: target.id, ttl: 6, seen: 0 });
  truthy(A.acceptJob(G, co, 97).ok);
  eq(B.bal(G, club.id) - c0, fee); eq(t0 - B.bal(G, target.id), fee); conserved(G);
});

t('profit share: a homegrown player sold after a season pays the coach 10% of the fee', () => {
  const { G, co, club } = setup('coach');
  const p = G.players[club.squad[0]]; p.hg = true; delete p.j;
  O.policy(G, club).minSalePct = 0; O.policy(G, club).untouchable = [];
  const w0 = O.walletBal(G, co.id);
  const sh = O.saleShare(G, club, p, 100000);
  eq(sh, 10000); eq(O.walletBal(G, co.id) - w0, 10000);
  const q = G.players[club.squad[1]]; delete q.hg; delete q.j; eq(O.saleShare(G, club, q, 100000), 0, 'unknown origin, no share');
  conserved(G);
});

t('owner-coach: withdraw only above the reserve, invest from the wallet; owner roles cannot be sacked', () => {
  const { G, co, club } = setup('both');
  const max = Math.round(B.bal(G, club.id) - O.policy(G, club).reserve);
  eq(O.withdraw(G, co, max + 1000).err, 'owner_reserve');
  truthy(O.withdraw(G, co, 100000).ok); truthy(O.invest(G, co, 50000).ok);
  eq(O.invest(G, co, 1e12).err, 'owner_wallet');
  co.board = 0; co.jobWeeks = 20; Game.playWeekAuto(G); eq(co.club, club.id, 'still the owner');
  eq(A.resign(G, co).err, 'owner_cant'); conserved(G);
});

t('long run with all roles: 8 seasons, money conserved, no crash', () => {
  const G = Game.newGame({ seed: 21, coaches: [{ name: 'A' }, { name: 'B', role: 'both' }] });
  for (let s = 0; s < 8; s++) { Game.simulateSeason(G); Game.newSeason(G); }
  conserved(G);
  for (const co of G.coaches) truthy(co.club === null || G.clubs[co.club].human === co.id, 'club link consistent');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
