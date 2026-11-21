/* What a person would do with a club this week (SF.Brain).
 *
 * Not an opponent and not a strategy - a way of pressing every button there is, in an order that
 * makes sense, with arguments that are real. A test that calls each function with made-up numbers
 * proves the function exists; one that plays a season as somebody would proves the game does.
 *
 * Every decision it produces is a decision the screen could have produced, picked from what the
 * club actually has: a man it really owns, a price it could really ask, a sponsor really on offer.
 * Seeded, so a failure can be played again exactly.
 */
(function () {
  const SF = globalThis.SF;

  const rng = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) >>> 0; return s / 4294967296; }; };
  const pick = (r, xs) => (xs.length ? xs[Math.floor(r() * xs.length)] : null);

  const Brain = (SF.Brain = {
    /* Everything this club might do this week, with the arguments filled in from what it has.
     * The caller sends as many or as few as it likes; the point is that each is legitimate. */
    plan(G, clubNum, seed, week) {
      const K = SF.Replay.kinds;
      const r = rng((seed >>> 0) ^ (clubNum * 2654435761) ^ (week * 40503));
      const id = 'c' + clubNum;
      const club = G.clubs[id];
      if (!club) return [];
      const coach = G.coaches.find((c) => c.club === id);
      const squad = club.squad.map((p) => G.players[p]).filter(Boolean);
      const out = [];
      const add = (kind, a, b, note) => out.push({ kind, a: a || 0, b: b || 0, note });

      // --- the football side ---
      const mine = pick(r, squad);
      if (mine) {
        add(K.CAPTAIN, mine.id, 0, 'name a captain');
        add(K.LIST, mine.id, Math.round((SF.Econ.value ? SF.Econ.value(mine) : 100000) * 1.1), 'put him up for sale');
        add(K.WATCH, mine.id, 0, 'keep an eye on him');
        if (mine.ct <= 2) add(K.RENEW, mine.id, 2, 'keep him another two years');
      }
      // somebody else's man, which is the only decision that needs a second party
      const theirs = [];
      for (const other of G.clubIds) {
        if (other === id) continue;
        const sq = G.clubs[other].squad;
        if (sq && sq.length > 17) theirs.push(G.players[sq[0]]);
      }
      const target = pick(r, theirs.filter(Boolean));
      if (target) add(K.BID, target.id, Math.round(SF.Actions.askPrice(G, coach, target) || 150000), 'bid for somebody else\'s man');
      const spare = squad.length > 18 ? pick(r, squad) : null;
      if (spare) add(K.SELLNOW, spare.id, 0, 'sell one in a hurry');
      const free = (G.free || [])[Math.floor(r() * Math.max(1, (G.free || []).length))];
      if (free) add(K.SIGNFREE, free, 0, 'sign a free agent');

      // --- the club side ---
      add(K.TICKET, Math.round(club.price * 110), 0, 'put the ticket up a tenth');
      add(K.INVEST, SF.Replay.GROUND, 1, 'build a stand');
      add(K.INVEST, SF.Replay.ACADEMY, 0, 'improve the academy');
      add(K.INVEST, SF.Replay.TRAINING, 0, 'improve the training ground');
      add(K.LOAN, 50000, 1, 'borrow against the gate');
      add(K.REPAY, 10000, 0, 'pay some of it back');
      if (coach && SF.Game.freePoints && SF.Game.freePoints(coach) > 0) add(K.SKILL, Math.floor(r() * 4), 0, 'spend what the coach has learned');

      // --- the board ---
      add(K.LINE, Math.floor(r() * 3), 1 + Math.floor(r() * 3), 'fund a line of the business');
      add(K.MERCH, Math.floor(r() * 3), 0, 'set the merchandising');
      add(K.MEMBER, Math.floor(r() * 3), 0, 'set the membership');
      add(K.KIT, 0, 0, 'a special kit');
      add(K.PROJECT, Math.floor(r() * 4), 0, 'start a project at the ground');
      add(K.EVENT, Math.floor(r() * 3), 0, 'put something on at the stadium');
      const offers = (club.boss && club.boss.offers) || [];
      if (offers.length) add(K.SPONSOR, offers[0].id, 0, 'sign a sponsor');
      add(K.BOND, 100000, 2, 'issue a bond');
      add(K.STAKE, 500, 0, 'sell five per cent of the club');

      return out;
    },

    /** every kind the game can carry out, so a run can say which were never reached */
    everyKind: () => Object.keys(SF.Replay.calls).map(Number),
  });
})();
