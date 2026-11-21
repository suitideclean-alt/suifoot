/* SuiFoot: working the season out, rather than being told it (SF.Replay).
 *
 * The chain holds what nobody could be allowed to invent: the clubs as they were made, who owns
 * which, the lineups people sealed before kick-off, and one number drawn per matchday. It does not
 * hold a single result, and it does not need to. Everything after the first whistle follows from
 * those four things and from nothing else, so anybody holding them arrives at the same season.
 *
 * That is what makes it cheap. A matchday played inside the contract cost about a quarter of
 * everything a transaction may spend; a matchday drawn costs one number. The ninety minutes happen
 * here, in the browser of whoever is looking, and happen the same way in every browser.
 *
 * It also means no one has to be trusted, which is the part worth keeping. The lineups are sealed
 * before the draw, so nobody can see the dice and change their team; the draw is the chain's, so
 * nobody can choose it; and the engine below is the one the contract carries, held to it match for
 * match and event for event by the tests. A different answer is not a disagreement, it is a bug.
 */
(function () {
  const SF = globalThis.SF;

  /* Each match gets a number of its own, drawn from the matchday's. Were they all to share one,
   * six matches would run on identical dice. Mixed the way the contract mixes them. */
  const seedFor = (weekSeed, i) => (Math.imul((weekSeed >>> 0) ^ (i + 1), 0x6d2b79f5) >>> 0);

  /** a player as the engine wants him, from a player as the chain holds him */
  const manOf = (p) => ({
    id: p.num, num: p.num, name: p.name, pos: p.pos, temper: p.temper,
    age: p.age, ovr: p.ovr, pot: p.pot, cond: p.cond, mood: p.mood,
    wage: p.wage, goals: p.goals, apps: p.apps, contractWeeks: p.contractWeeks,
  });

  /* What a decision is about, as the contract numbers them. */
  const TEAM = 1, SHOW = 2, TRAIN = 3, TICKET = 4, LIST = 5, BID = 6, ANSWER = 7, SKILL = 8,
    INVEST = 9, RENEW = 10;

  /* What an owner can put money into. A stand holds more people; an academy finds better boys; a
   * scout sees further into other clubs' squads. Each is bought once and kept. */
  const GROUND = 1, ACADEMY = 2, TRAINING = 3, SCOUT = 4;

  /* What each costs and what each buys. Whole numbers throughout: money in this game is dollars,
   * never fractions of one, and two browsers that round differently are two browsers that
   * disagree about a league. */
  const SEATS_PER_STEP = 500;
  const COST_PER_SEAT = 420;
  // to reach level 1, 2, 3, 4, 5. The first costs something: a scout nobody pays is not a scout.
  const FACILITY_COST = [0, 60000, 180000, 420000, 900000, 1800000];
  const MAX_FACILITY = 5;

  /* A squad has a floor and a ceiling: below the floor a club cannot field a team, above the
   * ceiling it is hoarding. Both are checked when a transfer is accepted, so neither side can be
   * left unable to play. */
  const MIN_SQUAD = 16;
  const MAX_SQUAD = 30;

  const Replay = (SF.Replay = {
    seedFor,
    GROUND, ACADEMY, TRAINING, SCOUT,
    kinds: { TEAM, SHOW, TRAIN, TICKET, LIST, BID, ANSWER, SKILL, INVEST, RENEW },

    /* The season so far.
     *
     * Starts from the clubs as the chain made them - which is the only state the chain keeps - and
     * plays forward one matchday per drawn number. What comes back is a new set of clubs; the ones
     * passed in are not touched, so a caller can always get back to the beginning.
     */
    run(world, decisions) {
      const lg = world.league;
      const seeds = lg.seeds || [];
      const clubs = world.clubs.map((c) => ({
        ...c,
        played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0,
        training: 0, academy: 1, coaching: 1, scout: 0, spent: 0,
        squad: c.squad.map(manOf),
      }));
      const byNum = new Map(clubs.map((c) => [c.num, c]));
      const results = [];
      const refused = [];
      const bids = [];
      const lineups = {};

      /* The log, in the order the chain put it in and grouped by the matchday that was current
       * when each was made. Anything decided while matchday five was up is done before matchday
       * five is played, which is the only order that makes a team sheet mean anything. */
      const log = (decisions || []).slice().sort((x, y) => x.week - y.week || x.at - y.at);
      let at = 0;
      const upTo = (w) => {
        while (at < log.length && log[at].week <= w) {
          const d = log[at++];
          const club = byNum.get(d.num);
          if (!club) continue;
          const why = Replay.apply(club, d, { byNum, bids, lineups });
          if (why) refused.push({ ...d, why });
        }
      };

      for (let w = 1; w <= seeds.length; w++) {
        upTo(w);
        const roster = (lg.rosters || [])[0] || [];
        const pairs = SF.Chain.pairs(roster, w);
        pairs.forEach(([hn, an], i) => {
          const home = byNum.get(hn), away = byNum.get(an);
          if (!home || !away) return;
          const r = Replay.match(home, away, seedFor(seeds[w - 1], i), lineups, w);
          results.push({ week: w, home: home.num, away: away.num, hg: r.hg, ag: r.ag, events: r.events });
        });
      }
      upTo(Number.MAX_SAFE_INTEGER); // and whatever has been decided since the last draw

      return { clubs, results, played: seeds.length, refused, bids };
    },

    /* Carry out one decision, or say why it cannot be carried out.
     *
     * This is where the rules of the game live, and the reason they can live here rather than in
     * the contract. A decision nobody could afford, for a man who is not there, at a price that
     * was never asked - each is refused, and refused identically by everyone working the season
     * out, because the refusal follows from the same numbers in front of all of them. The contract
     * never has to know what a stand costs.
     *
     * The returned value is the reason it was refused, or nothing if it was done. Refusals are
     * kept rather than dropped: a person who tried to buy a player and has no player wants to be
     * told why, not left looking at an unchanged screen.
     */
    apply(club, d, st) {
      const { byNum, bids, lineups } = st;

      if (d.kind === TRAIN) {
        if (d.a < 0 || d.a > 6) return 'no such training';
        club.training = d.a;
        return null;
      }

      if (d.kind === TICKET) {
        // a price in cents, between free and something nobody would pay
        if (d.a < 0 || d.a > 50000) return 'that is not a price';
        club.ticket = d.a / 100;
        return null;
      }

      if (d.kind === INVEST) {
        if (d.a === GROUND) {
          const steps = Math.floor(d.b);
          if (steps < 1 || steps > 40) return 'that is not a stand';
          const cost = steps * SEATS_PER_STEP * COST_PER_SEAT;
          if (club.balance < cost) return 'not enough money for that stand';
          club.balance -= cost; club.spent += cost;
          club.capacity += steps * SEATS_PER_STEP;
          return null;
        }
        if (d.a === ACADEMY || d.a === TRAINING || d.a === SCOUT) {
          const which = d.a === ACADEMY ? 'academy' : d.a === TRAINING ? 'coaching' : 'scout';
          const to = club[which] + 1;
          if (to > MAX_FACILITY) return 'that is as far as it goes';
          const cost = FACILITY_COST[to];
          if (club.balance < cost) return 'not enough money for that';
          club.balance -= cost; club.spent += cost;
          club[which] = to;
          return null;
        }
        return 'nothing to put money into there';
      }

      if (d.kind === LIST) {
        const man = club.squad.find((p) => p.id === d.a);
        if (!man) return 'he does not play here';
        man.listed = d.b > 0 ? 1 : 0;
        man.ask = d.b;
        return null;
      }

      if (d.kind === RENEW) {
        const man = club.squad.find((p) => p.id === d.a);
        if (!man) return 'he does not play here';
        const weeks = Math.min(204, Math.max(34, Math.floor(d.b)));
        const cost = Math.round((man.wage * weeks) / 34);
        if (club.balance < cost) return 'not enough money to keep him';
        club.balance -= cost;
        man.contractWeeks = (man.contractWeeks || 0) + weeks;
        return null;
      }

      /* A transfer is the only thing here that two people have to agree on, so it is the only one
       * that takes two decisions: one club offers, the other answers. Between the two the money
       * has not moved and neither has the man - there is nothing held in escrow, because there is
       * nothing to hold. The offer is a line in the log and the acceptance is another, and the
       * player changes club at the moment the second one is read.
       *
       * The money is checked when the offer is accepted rather than when it is made, because that
       * is when it is spent. A club that bids for three players and can afford one gets one: the
       * first answer that arrives takes the money, and the rest are refused for want of it - the
       * same one, in the same order, in every browser. */
      if (d.kind === BID) {
        const holder = Replay.holderOf(byNum, d.a);
        if (!holder) return 'no such player';
        if (holder.num === club.num) return 'he already plays here';
        if (d.b <= 0) return 'a bid is for something';
        if (club.squad.length >= MAX_SQUAD) return 'no room for another man';
        bids.push({ player: d.a, from: club.num, to: holder.num, amount: d.b, at: d.at, week: d.week });
        return null;
      }

      if (d.kind === ANSWER) {
        const i = bids.findIndex((x) => x.player === d.a && x.from === Number(d.b) && x.to === club.num);
        if (i < 0) return 'no such offer';
        const bid = bids[i];
        bids.splice(i, 1);

        const buyer = byNum.get(bid.from);
        const man = club.squad.find((p) => p.id === bid.player);
        if (!buyer) return 'that club is gone';
        if (!man) return 'he no longer plays here';
        if (buyer.balance < bid.amount) return 'they cannot pay what they offered';
        if (club.squad.length <= MIN_SQUAD) return 'a squad cannot go below the minimum';
        if (buyer.squad.length >= MAX_SQUAD) return 'their squad is full';

        buyer.balance -= bid.amount;
        club.balance += bid.amount;
        club.squad = club.squad.filter((p) => p.id !== man.id);
        man.listed = 0; man.ask = 0;
        buyer.squad.push(man);
        return null;
      }

      /* A team sheet is sealed before the draw and shown after it, and what is shown has to be
       * what was sealed. Until the sealing is wired through, a sheet simply says who plays. */
      if (d.kind === TEAM || d.kind === SHOW) {
        const men = Array.from(d.data || []);
        if (!men.length) return null;
        lineups[club.num] = lineups[club.num] || {};
        lineups[club.num][d.week] = {
          xi: men.slice(0, 11).map((n) => club.squad[n] && club.squad[n].id).filter((x) => x != null),
          bench: men.slice(11, 18).map((n) => club.squad[n] && club.squad[n].id).filter((x) => x != null),
          tactic: ['bal', 'att', 'def'][d.a] || 'bal',
        };
        return null;
      }

      return null;
    },

    /** which club a man plays for, since a bid names the man and not the club */
    holderOf(byNum, pid) {
      for (const c of byNum.values()) if (c.squad.some((p) => p.id === pid)) return c;
      return null;
    },

    /** one match, and what it did to the two clubs and the men in them */
    match(home, away, seed, lineups, week) {
      const g = { rs: seed >>> 0, players: {}, clubs: {}, cfg: SF.CFG };
      const spec = (c) => {
        for (const p of c.squad) g.players[p.id] = p;
        const chosen = (lineups && lineups[c.num] && lineups[c.num][week]) || null;
        const xi = chosen ? chosen.xi : Replay.bestEleven(c).map((p) => p.id);
        const taken = new Set(xi);
        const bench = chosen ? chosen.bench : c.squad.filter((p) => !taken.has(p.id)).slice(0, 7).map((p) => p.id);
        return { club: c.num, xi, bench, tactic: chosen ? chosen.tactic : 'bal' };
      };
      const h = spec(home), a = spec(away);

      const saved = SF.cur;
      SF.setG(g);
      let out;
      try {
        out = new SF.Match(g, h, a).run().summary();
      } finally { SF.setG(saved); }

      Replay.record(home, out.hg, out.ag);
      Replay.record(away, out.ag, out.hg);
      Replay.mark(home, h.xi, h.bench, out.events, 'h');
      Replay.mark(away, a.xi, a.bench, out.events, 'a');
      return out;
    },

    /** the table row, moved on by one match */
    record(c, scored, let_in) {
      c.played += 1; c.gf += scored; c.ga += let_in;
      if (scored > let_in) { c.won += 1; c.points += 3; }
      else if (scored === let_in) { c.drawn += 1; c.points += 1; }
      else c.lost += 1;
    },

    /* What the ninety minutes did to the men who played them: whoever started is credited with the
     * game and comes off it tired, whoever came on is credited too and comes off it less tired, and
     * whoever scored has it on his name. Without this a season would be played by men who end it
     * exactly as they began it. */
    mark(c, xi, bench, events, side) {
      const started = new Set(xi);
      const played = new Set(xi);
      // whoever came on played too: in a substitution the man arriving is pid, the man going is pid2
      for (const e of events) if (e.t === 'sub' && e.side === side && e.pid != null) played.add(e.pid);
      for (const p of c.squad) {
        if (!played.has(p.id)) continue;
        p.apps += 1;
        p.cond = Math.max(0, p.cond - (started.has(p.id) ? 9 : 4));
      }
      for (const e of events) {
        if (e.t !== 'goal' || e.side !== side) continue;
        const man = c.squad.find((p) => p.id === e.pid);
        if (man) man.goals += 1;
      }
    },

    /** who plays when nobody said: the best man in each shirt, as the contract would pick them */
    bestEleven(c) {
      const by = (pos, n) => c.squad.filter((p) => p.pos === pos).sort((x, y) => y.ovr - x.ovr).slice(0, n);
      return [...by('GK', 1), ...by('DF', 4), ...by('MF', 4), ...by('FW', 2)];
    },
  });
})();
