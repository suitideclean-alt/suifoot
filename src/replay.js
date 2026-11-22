/* The season, worked out from what the chain holds (SF.Replay).
 *
 * The chain keeps four things, and they are the four nobody could be allowed to invent: which
 * clubs exist and who runs them, what each person decided and when, and one drawn number per
 * matchday. It keeps no results, no tables, no money, and it needs to keep none - everything after
 * the first whistle follows from those four, so everyone holding them arrives at the same season,
 * and a season nobody can disagree about does not have to be written down.
 *
 * What follows is not a second implementation of the game. It is the game: the same functions the
 * offline save calls, called here on a world the chain supplied. An earlier version of this file
 * did write its own rules, and the result was two games wearing the same clothes - a stand cost
 * one thing on the chain and another in the browser, because two people had written down what a
 * stand costs. There is now one place where that is written, and it is not here.
 *
 * So a matchday is: do what people decided while it was up, take the chain's number for the week's
 * dice, and let the game play it. The Cup, Europe, the gate money, the wages, the training, who is
 * tired and who has grown - none of it is mentioned below, and all of it happens, because it is
 * what the game does with a week.
 */
(function () {
  const SF = globalThis.SF;

  /* What a decision is about, as the contract numbers them. The contract reads the number only to
   * know whether the window for it is still open; what it means is settled here, which is why a
   * new kind of decision needs no new contract. */
  const K = {
    TEAM: 1, SHOW: 2, TRAIN: 3, TICKET: 4, LIST: 5, BID: 6, ANSWER: 7, SKILL: 8, INVEST: 9,
    RENEW: 10, RELEASE: 11, SELLNOW: 12, CAPTAIN: 13, LOAN: 14, REPAY: 15, SIGNFREE: 16,
    WATCH: 17, LOANIN: 18, LOANOUT: 19, VACATION: 20, RENEGOTIATE: 21,
    // what a board does: the money side of a club, as against the football side
    LINE: 22, MERCH: 23, MEMBER: 24, KIT: 25, SPONSOR: 26, SPONBREAK: 27, PROJECT: 28,
    PARTNER: 29, EVENT: 30, STAKE: 31, BUYBACK: 32, BOND: 33, BONDREPAY: 34,
    /* An owner answering a request from the person he hired to run the team. Without these a
     * hired coach can ask and never be answered, which is a job in name only. */
    APPROVE: 35, DECLINE: 36,
  };

  /* The board's choices, as numbers.
   *
   * A decision carries two numbers and a short note, and these are lists rather than free text so
   * that nothing in them can be spelled two ways. A word written into a log can be written
   * differently by two clients; an index into a list that both of them hold cannot. */
  const LINES = ['acad', 'mkt', 'comm'];
  const TIERS = ['low', 'normal', 'premium'];
  const MEMBERS = ['low', 'normal', 'high'];
  const PROJECTS = ['roof', 'lights', 'museum', 'med'];
  const EVENTS = ['concert', 'friendly', 'tour'];

  /** what an owner may put money into, as the game names its facilities */
  const GROUND = 1, ACADEMY = 2, TRAINING = 3;

  /* Each decision, as the call the game already knows how to make.
   *
   * Every one of these returns the game's own answer - including its own refusal, in the game's
   * own words - so a thing refused online is refused for exactly the reason it would have been
   * refused offline. Nothing here decides anything; it only says which rule a decision is.
   */
  const CALLS = {
    [K.TICKET]: (G, c, d) => SF.Actions.setPrice(G, c, d.a / 100),
    [K.INVEST]: (G, c, d) => (d.a === GROUND
      ? SF.Actions.expandStadium(G, c, d.b)
      : SF.Actions.upgradeFacility(G, c, d.a === ACADEMY ? 'youth' : 'train')),
    [K.LIST]: (G, c, d) => SF.Actions.listPlayer(G, c, d.a, d.b),
    [K.BID]: (G, c, d) => SF.Actions.buy(G, c, d.a, d.b),
    [K.ANSWER]: (G, c, d) => (d.b ? SF.Actions.acceptOffer(G, c, d.a) : SF.Actions.declineOffer(G, c, d.a)),
    [K.RENEW]: (G, c, d) => SF.Actions.renew(G, c, d.a, d.b),
    [K.RELEASE]: (G, c, d) => SF.Actions.release(G, c, d.a),
    [K.SELLNOW]: (G, c, d) => SF.Actions.sellNow(G, c, d.a),
    [K.CAPTAIN]: (G, c, d) => SF.Actions.setCaptain(G, c, d.a),
    [K.LOAN]: (G, c, d) => SF.Actions.takeLoan(G, c, d.a, d.b || 1),
    [K.REPAY]: (G, c, d) => SF.Actions.repayLoan(G, c, d.a),
    [K.SKILL]: (G, c, d) => SF.Actions.spendSkill(G, c, ['train', 'tact', 'neg', 'youth'][d.a]),
    [K.SIGNFREE]: (G, c, d) => SF.Actions.signFree(G, c, d.a),
    [K.WATCH]: (G, c, d) => SF.Actions.watch(G, c, d.a),
    [K.LOANIN]: (G, c, d) => SF.Actions.loanIn(G, c, d.a, d.b || 1),
    [K.LOANOUT]: (G, c, d) => SF.Actions.loanOut(G, c, d.a, d.b || 1),
    [K.VACATION]: (G, c, d) => SF.Actions.setVacation(G, c, d.a),
    [K.RENEGOTIATE]: (G, c, d) => SF.Actions.renegotiate(G, c, d.a),

    [K.LINE]: (G, c, d) => SF.Boss.setLine(G, c, LINES[d.a], d.b),
    [K.MERCH]: (G, c, d) => SF.Boss.setMerch(G, c, TIERS[d.a]),
    [K.MEMBER]: (G, c, d) => SF.Boss.setMember(G, c, MEMBERS[d.a]),
    [K.KIT]: (G, c) => SF.Boss.specialKit(G, c),
    [K.SPONSOR]: (G, c, d) => SF.Boss.signSponsor(G, c, d.a),
    [K.SPONBREAK]: (G, c) => SF.Boss.breakSponsor(G, c),
    [K.PROJECT]: (G, c, d) => SF.Boss.startProject(G, c, PROJECTS[d.a]),
    /* A partner is named by club, and a club travels as its number: the id is a string this side
     * and a log carries numbers. Nought means no partner. */
    [K.PARTNER]: (G, c, d) => SF.Boss.setPartner(G, c, d.a ? 'c' + d.a : null),
    [K.EVENT]: (G, c, d) => SF.Boss.event(G, c, EVENTS[d.a]),
    [K.STAKE]: (G, c, d) => SF.Boss.sellStake(G, c, d.a / 10000),
    [K.BUYBACK]: (G, c, d) => SF.Boss.buyBack(G, c, d.a),
    [K.BOND]: (G, c, d) => SF.Boss.issueBond(G, c, d.a, d.b),
    [K.BONDREPAY]: (G, c, d) => SF.Boss.repayBond(G, c, d.a),
    [K.APPROVE]: (G, c, d) => SF.Owner.decide(G, c, d.a, true),
    [K.DECLINE]: (G, c, d) => SF.Owner.decide(G, c, d.a, false),
  };

  const Replay = (SF.Replay = {
    kinds: K,
    GROUND, ACADEMY, TRAINING,
    LINES, TIERS, MEMBERS, PROJECTS, EVENTS,
    calls: CALLS,

    /** which decisions the game knows how to carry out */
    knows: (kind) => !!CALLS[kind],

    run(world, decisions) {
      const G = SF.Genesis.build(world);
      const seeds = (world.league.seeds || []).map((s) => s >>> 0);
      G.refused = [];

      /* In the order every reader agrees on: by the matchday that was current when each was made,
       * then by the moment, and where two landed in the same millisecond, by the decision itself.
       * A node may hand the same events back in any order, and two people asking a second apart
       * may be answered differently; sorting on the content leaves arrival order nothing to
       * decide, so two browsers cannot end up holding two leagues. */
      const log = (decisions || []).slice().sort((x, y) =>
        x.week - y.week || x.at - y.at || x.num - y.num ||
        x.kind - y.kind || x.a - y.a || x.b - y.b);

      let at = 0;
      const upTo = (w) => {
        while (at < log.length && log[at].week <= w) Replay.carry(G, log[at++]);
      };

      G.spare = 0;
      /* Where each season's numbers begin, so that the right whistle blows at the right place. A
       * boundary is not something a reader can work out from the numbers themselves - it is the
       * one thing the chain has to say about seasons, and it says it. */
      const starts = (world.league.seasonFrom && world.league.seasonFrom.length)
        ? world.league.seasonFrom.slice() : [0];
      let nextBoundary = 1;

      for (let w = 1; w <= seeds.length; w++) {
        /* A season that has run out turns over here, and what that means - who went up, who came
         * down, who got a year older, who retired, which boys came through - is the game's own
         * doing, as everything else is. */
        while (nextBoundary < starts.length && w - 1 === starts[nextBoundary]) {
          SF.Game.newSeason(G);
          nextBoundary += 1;
        }
        upTo(w);
        /* A season has as many weeks as its calendar has, and not one more.
         *
         * A number drawn past the end belongs to no matchday, and trying to play it used to take
         * the whole league down - not for whoever drew it, for everybody, because everybody works
         * the season out from the same numbers. One extra press and nobody could read the league
         * at all. So the extras are counted and left alone, which is the only reading of them that
         * cannot be anybody's loss. The contract refuses to draw them in the first place; this is
         * what keeps a league drawn by an older one readable. */
        if (G.phase !== 'play' || !G.sched[G.week - 1]) { G.spare = seeds.length - (w - 1); break; }
        G.rs = seeds[w - 1];
        const wk = SF.Game.beginWeek(G);
        for (const m of wk.matches) SF.Game.simMatch(G, m);
        SF.Game.endWeek(G);
      }
      upTo(Number.MAX_SAFE_INTEGER); // and whatever has been decided since the last draw

      return G;
    },

    /* Carry out one decision, by asking the game to do it.
     *
     * A decision the game refuses is kept rather than dropped, with the game's own reason.
     * Somebody who tried to buy a player and has no player wants to be told why, not left looking
     * at a screen that did not change.
     */
    carry(G, d) {
      const coach = SF.Genesis.coachOf(G, d.num);
      if (!coach) return Replay.refuse(G, d, 'no_club');
      const call = CALLS[d.kind];
      if (!call) return Replay.refuse(G, d, 'unknown_decision');
      let r;
      try { r = call(G, coach, d); } catch (e) { return Replay.refuse(G, d, 'bad_decision'); }
      if (r && r.ok === false) return Replay.refuse(G, d, r.err || 'refused');
      return null;
    },

    refuse(G, d, why) {
      G.refused.push({ ...d, why });
      return why;
    },
  });
})();
