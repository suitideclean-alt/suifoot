/* SuiFoot Bank: the in-game ledger. Two currencies, both integers.
 *  - USD (acc):   the game's own money: wages, transfers, gate, TV, sponsors, loans. Virtual, never leaves the game.
 *  - SFOOT (tok): the real token: club investments (stadium, facilities, projects...) and prizes. Held by the human owner.
 * The two are never converted into each other.
 * The SFOOT side is shaped like a Sui Coin<SFOOT> treasury so it can later be swapped for the on-chain token:
 * tcredit() = mint, tdebit() = burn (paid to the project treasury), ttransfer() = move.
 * Phase A (this build): closed, off-chain, no real value. */
(function () {
  const SF = globalThis.SF;
  const MINT = new Set(['gate', 'tv', 'sponsor', 'prize', 'loan', 'bailout', 'sale_fee']);

  SF.Bank = {
    init(G) {
      G.bank = { acc: {}, minted: 0, burned: 0, flows: {}, led: {}, sf: {}, loans: [], nextLoan: 1, tracked: {}, tok: {}, tminted: 0, tburned: 0, tflows: {}, tsf: {}, tled: {} };
    },
    open(G, id, amount, tracked) {
      G.bank.acc[id] = 0;
      if (tracked) G.bank.tracked[id] = 1;
      if (amount) SF.Bank.credit(G, id, amount, 'bailout');
    },
    bal(G, id) { return G.bank.acc[id] || 0; },
    log(G, id, kind, amt, memo) {
      G.bank.flows[kind] = (G.bank.flows[kind] || 0) + amt;
      if (!G.bank.tracked[id]) return;
      const sf = G.bank.sf[id] || (G.bank.sf[id] = {});
      sf[kind] = (sf[kind] || 0) + amt;
      const l = G.bank.led[id] || (G.bank.led[id] = []);
      l.push([G.season, G.week, kind, amt, memo || '']);
      if (l.length > 200) l.splice(0, l.length - 200);
    },
    /** money enters the system (mint) */
    credit(G, id, amt, kind, memo) {
      amt = Math.round(amt);
      if (!amt) return 0;
      G.bank.acc[id] = (G.bank.acc[id] || 0) + amt;
      G.bank.minted += amt;
      SF.Bank.log(G, id, kind, amt, memo);
      return amt;
    },
    /** money leaves the system (burn) */
    debit(G, id, amt, kind, memo) {
      amt = Math.round(amt);
      if (!amt) return 0;
      G.bank.acc[id] = (G.bank.acc[id] || 0) - amt;
      G.bank.burned += amt;
      SF.Bank.log(G, id, kind, -amt, memo);
      return amt;
    },
    /** club to club */
    transfer(G, from, to, amt, kind, memo) {
      amt = Math.round(amt);
      G.bank.acc[from] -= amt;
      G.bank.acc[to] = (G.bank.acc[to] || 0) + amt;
      if (G.bank.tracked[from]) SF.Bank.log(G, from, kind + '_out', -amt, memo);
      else G.bank.flows[kind + '_out'] = (G.bank.flows[kind + '_out'] || 0) - amt;
      if (G.bank.tracked[to]) SF.Bank.log(G, to, kind + '_in', amt, memo);
      else G.bank.flows[kind + '_in'] = (G.bank.flows[kind + '_in'] || 0) + amt;
    },
    supply(G) { return G.bank.minted - G.bank.burned; },

    // ---------- SFOOT (the real token) ----------
    ensureTok(G) {
      const b = G.bank;
      if (!b.tok) { b.tok = {}; b.tminted = 0; b.tburned = 0; b.tflows = {}; b.tsf = {}; b.tled = {}; }
    },
    tbal(G, id) { return (G.bank.tok && G.bank.tok[id]) || 0; },
    tlog(G, id, kind, amt, clubId) {
      const b = G.bank;
      b.tflows[kind] = (b.tflows[kind] || 0) + amt;
      if (clubId == null) return;
      const sf = b.tsf[clubId] || (b.tsf[clubId] = {});
      sf[kind] = (sf[kind] || 0) + amt;
      const l = b.tled[clubId] || (b.tled[clubId] = []);
      l.push([G.season, G.week, kind, amt, id]);
      if (l.length > 100) l.splice(0, l.length - 100);
    },
    /** SFOOT enters the game (prize paid out, or the starting grant) */
    tcredit(G, id, amt, kind, clubId) {
      amt = Math.round(amt);
      if (!amt) return 0;
      SF.Bank.ensureTok(G);
      G.bank.tok[id] = (G.bank.tok[id] || 0) + amt;
      G.bank.tminted += amt;
      SF.Bank.tlog(G, id, kind, amt, clubId);
      return amt;
    },
    /** SFOOT leaves the owner and goes to the project treasury (investment); clubId says which club it was spent on */
    tdebit(G, id, amt, kind, clubId) {
      amt = Math.round(amt);
      if (!amt) return 0;
      SF.Bank.ensureTok(G);
      G.bank.tok[id] = (G.bank.tok[id] || 0) - amt;
      G.bank.tburned += amt;
      SF.Bank.tlog(G, id, kind, -amt, clubId);
      return amt;
    },
    tsupply(G) { return (G.bank.tminted || 0) - (G.bank.tburned || 0); },
    ttotal(G) { let s = 0; for (const k in (G.bank.tok || {})) s += G.bank.tok[k]; return s; },
    totalBalances(G) { let s = 0; for (const k in G.bank.acc) s += G.bank.acc[k]; return s; },

    // ---------- loans ----------
    creditLimit(G, clubId) {
      const c = G.clubs[clubId];
      const rev = c.lastRevenue || SF.CFG.tvWeekly[c.div] * 28 * 3;
      const open = SF.Bank.debtOf(G, clubId);
      return Math.max(0, Math.round(rev * 0.6 - open));
    },
    debtOf(G, clubId) {
      return G.bank.loans.filter((l) => l.club === clubId).reduce((s, l) => s + l.due, 0);
    },
    takeLoan(G, clubId, principal, seasons) {
      const lim = SF.Bank.creditLimit(G, clubId);
      principal = Math.round(principal);
      if (principal <= 0 || principal > lim) return { ok: false, err: 'loan_limit', max: lim };
      seasons = SF.util.clamp(seasons | 0, 1, 3);
      const due = Math.round(principal * (1 + SF.CFG.loanRate * seasons));
      const weeks = seasons * SF.CFG.TOTAL_WEEKS;
      const loan = { id: G.bank.nextLoan++, club: clubId, principal, due, total: due, weeks, left: weeks, weekly: Math.ceil(due / weeks) };
      G.bank.loans.push(loan);
      SF.Bank.credit(G, clubId, principal, 'loan');
      return { ok: true, loan };
    },
    /** weekly instalments; returns total paid */
    payLoans(G, clubId) {
      let paid = 0;
      for (const l of G.bank.loans) {
        if (l.club !== clubId) continue;
        const pay = Math.min(l.weekly, l.due);
        SF.Bank.debit(G, clubId, pay, 'repay');
        l.due -= pay; l.left--; paid += pay;
        if (l.left <= 0 && l.due > 0) { l.left = 1; l.weekly = l.due; }
      }
      G.bank.loans = G.bank.loans.filter((l) => l.due > 0);
      return paid;
    },
    earlyRepayCost(l) {
      const f = l.due / l.total;
      const princLeft = l.principal * f;
      const intLeft = (l.total - l.principal) * f;
      return Math.round(princLeft + intLeft * 0.5);
    },
    repayLoan(G, clubId, loanId) {
      const l = G.bank.loans.find((x) => x.id === loanId && x.club === clubId);
      if (!l) return { ok: false, err: 'no_loan' };
      const cost = SF.Bank.earlyRepayCost(l);
      if (SF.Bank.bal(G, clubId) < cost) return { ok: false, err: 'no_funds', cost };
      SF.Bank.debit(G, clubId, cost, 'repay');
      G.bank.loans = G.bank.loans.filter((x) => x !== l);
      return { ok: true, cost };
    },
  };
  SF.Bank._MINT = MINT;
})();
