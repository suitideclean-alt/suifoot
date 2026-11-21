/* From the chain to the game the browser already knows how to draw (SF.Bridge).
 *
 * The online league had a screen of its own, and that was always a confession: it said that
 * playing on the chain was a different thing from playing, with its own tables and its own way of
 * showing a squad. It is not a different thing. The clubs are clubs, the men are men, and a person
 * who owns one should open the squad page and see his squad, not a page called "on chain".
 *
 * So nothing here draws anything. This turns what the chain holds - the clubs as they were made,
 * and the season worked out from the numbers drawn since - into the same shape the offline game
 * carries in memory. Every screen in the game then works on it untouched: the squad, the table,
 * the finances, the fixtures. They cannot tell the difference, and there is no reason they should.
 *
 * What they are shown is not a copy of a game kept somewhere. It is the chain's own state, read a
 * moment ago and worked out in front of them, and the next refresh throws it away and works it out
 * again. Nothing here can be edited into being true.
 */
(function () {
  const SF = globalThis.SF;
  const CFG = SF.CFG;

  /** the contract keeps weeks; the game counts seasons */
  const yearsOf = (weeks) => Math.max(0, Math.round((weeks || 0) / 34));

  const Bridge = (SF.Bridge = {
    /* Build the game from the chain.
     *
     * `world` is what the chain holds, `me` the address of whoever is looking - his clubs are the
     * ones marked as his, so the screens that ask "is this mine?" get the right answer.
     */
    toGame(world, me) {
      const out = SF.Replay.run(world, null);
      const lg = world.league;

      const G = {
        v: SF.VERSION, fmt: 2, mig: SF.Game.MIG, rules: CFG.rules,
        seed: (lg.seeds && lg.seeds[0]) || 1, rs: 1,
        season: lg.season, week: lg.week, phase: 'play',
        news: [], coaches: [], offers: [], hall: [], tq: [], nextOffer: 1,
        lang: (SF.cur && SF.cur.lang) || 'en', wk: null,
        clubs: {}, players: {}, free: [], euIds: [], nextPid: 1,
        online: true, chain: world,
      };
      SF.setG(G);
      SF.Bank.init(G);

      for (const c of out.clubs) {
        const id = 'c' + c.num;
        const col = SF.Chain.colours(c.num);
        const club = {
          id, num: c.num, chainId: c.id, name: c.name,
          div: c.level, ser: 0,
          c1: col.c1, c2: col.c2,
          squad: [], fans: c.fans, cap: c.capacity, price: c.ticket,
          facility: { youth: 3, train: 3 }, build: null, lastRevenue: 0,
          hist: [], title: 0, cups: 0, form: [], acad: [], style: 'bal',
          human: 0, owner: 0, rival: null, capt: 0,
          /* the table the chain's own numbers give, so the league page is the league */
          table: { p: c.played, w: c.won, d: c.drawn, l: c.lost, gf: c.gf, ga: c.ga, pts: c.points },
          mine: !!(me && c.owner && c.owner === me),
        };
        for (const p of c.squad) {
          const man = {
            id: p.num, n: p.name, pos: p.pos, age: p.age, ovr: p.ovr, pot: p.pot,
            wage: p.wage, ct: yearsOf(p.contractWeeks) || 2, club: id,
            mood: p.mood, tp: p.temper, cond: p.cond, yrs: 0, inj: 0, sus: 0, yc: 0,
            g: p.goals, ap: p.apps, gt: p.goals, apt: p.apps, ask: 1, listed: 0,
          };
          G.players[man.id] = man;
          club.squad.push(man.id);
        }
        G.clubs[id] = club;
        SF.Bank.open(G, id, c.balance, !!club.mine);
      }

      G.clubIds = Object.keys(G.clubs);
      /* One series, at the level the chain says, rather than the four the offline world invents.
       * The pyramid grows by opening series, and the shape follows what is actually there. */
      G.sers = [{ lvl: lg.bottom || 0, parent: -1, kids: [] }];
      G.divs = [G.clubIds.slice()];
      G.table = {}; G.res = [];
      G.results = out.results;

      /* Whoever is looking is a coach of his own clubs, so every screen that asks what *my* club is
       * doing has an answer. A person who owns nothing yet is a spectator, and the screens say so
       * rather than showing somebody else's squad as though it were his. */
      const mine = G.clubIds.filter((id) => G.clubs[id].mine);
      mine.forEach((id, i) => {
        const club = G.clubs[id];
        club.human = i + 1;
        club.owner = i + 1;
        G.coaches.push({
          id: i + 1, name: SF.Wallet && me ? SF.Wallet.short(me) : 'me',
          club: id, role: 'both', rep: 50, xp: 0,
          sk: { train: 0, tact: 0, neg: 0, youth: 0 },
          contract: null, hist: [],
        });
      });
      G.me = mine[0] || null;
      return G;
    },

    /** is the game on the screen the chain's, or this browser's own? */
    isOnline: (G) => !!(G && G.online),
  });
})();
