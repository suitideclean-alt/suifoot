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

  const Replay = (SF.Replay = {
    seedFor,

    /* The season so far.
     *
     * Starts from the clubs as the chain made them - which is the only state the chain keeps - and
     * plays forward one matchday per drawn number. What comes back is a new set of clubs; the ones
     * passed in are not touched, so a caller can always get back to the beginning.
     */
    run(world, lineups) {
      const lg = world.league;
      const seeds = lg.seeds || [];
      const clubs = world.clubs.map((c) => ({
        ...c,
        played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0,
        squad: c.squad.map(manOf),
      }));
      const byNum = new Map(clubs.map((c) => [c.num, c]));
      const results = [];

      for (let w = 1; w <= seeds.length; w++) {
        const roster = (lg.rosters || [])[0] || [];
        const pairs = SF.Chain.pairs(roster, w);
        pairs.forEach(([hn, an], i) => {
          const home = byNum.get(hn), away = byNum.get(an);
          if (!home || !away) return;
          const r = Replay.match(home, away, seedFor(seeds[w - 1], i), lineups, w);
          results.push({ week: w, home: home.num, away: away.num, hg: r.hg, ag: r.ag, events: r.events });
        });
      }
      return { clubs, results, played: seeds.length };
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
