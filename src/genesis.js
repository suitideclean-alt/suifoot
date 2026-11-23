/* The chain's league, as the game's own world (SF.Genesis).
 *
 * There was a version of this that worked the other way round: the chain held clubs, and a
 * separate piece of code worked out what a stand cost, what a man was worth, what a week of
 * training did. It worked, and it was wrong - the numbers it used were not the game's numbers, so
 * a stand on the chain cost one thing and the same stand offline cost another. Two games wearing
 * the same clothes.
 *
 * The rules are not rewritten here. They are the game's, called as the game calls them, on a world
 * the chain supplied instead of one invented at random. The chain's part is the part nobody could
 * be allowed to invent: which clubs exist, who runs them, what was decided and when, and one drawn
 * number per matchday. Everything the rules then do with that is the game, unchanged, and the same
 * in both places because it is the same code.
 *
 * What the chain does not hold is the scenery: free agents nobody owns, foreign clubs for Europe.
 * Those cost nothing to agree on, so they are grown from a number the league was made with, and
 * everybody grows the same ones.
 */
(function () {
  const SF = globalThis.SF;
  const CFG = SF.CFG;

  const Genesis = (SF.Genesis = {
    /** the world as it stood before a ball was kicked, from what the chain holds */
    build(world) {
      const lg = world.league;
      const seed = (lg.seeds && lg.seeds.length ? lg.seeds[0] : 1) >>> 0;

      /* The foot of the pyramid is as wide as the chain says it is. A league opens with one
       * series there and opens another when the first is full, so the width is counted from the
       * plantéis the chain holds rather than assumed to be one. Reading it as one would merge two
       * series of eighteen into a single division of thirty-six: one table, the wrong fixtures,
       * and a season of the wrong length. */
      const foot = Math.max(0, lg.bottom || 0);
      const shape = new Array(foot + 1).fill(1);
      shape[foot] = Math.max(1, ((world.league && world.league.rosters) || []).length);
      /* where each level's series begin in the flat list the game keeps them in */
      const serStart = [];
      for (let lvl = 0, n = 0; lvl < shape.length; lvl++) { serStart.push(n); n += shape[lvl]; }

      const G = {
        v: SF.VERSION, fmt: 2, mig: SF.Game.MIG, rules: CFG.rules,
        /* A league's history starts at its first season, and the seasons that followed are the
         * boundaries in the log. Starting from the number the chain is on now would count the
         * seasons already played a second time. */
        seed, rs: seed, season: 1, week: 1, phase: 'play',
        news: [], coaches: [], offers: [], hall: [], tq: [], nextOffer: 1,
        lang: (SF.cur && SF.cur.lang) || 'en', wk: null,
        clubs: {}, players: {}, free: [], euIds: [], nextPid: 1,
        online: true, chainLeague: lg,
        /* There is no SFOOT yet, so a club pays for its own ground out of its own takings rather
         * than out of a pocket its owner does not have. */
        noToken: true,
        /* The pyramid, one series per level down to the foot the league says it has. The clubs
         * the chain holds stand at that foot and the levels above it are empty until somebody
         * climbs into them - which is what a league looks like in its first season.
         *
         * The level matters beyond where a club sits in a list: what a ticket may cost, what a
         * crowd is worth, what a prize pays are all read from it. Putting a foot-of-the-pyramid
         * club in the top division would have the game charging it top-division prices. */
        shape,
      };
      SF.setG(G);
      SF.Bank.init(G);

      for (const c of world.clubs) {
        const id = 'c' + c.num;
        const col = SF.Chain.colours(c.num);
        const club = {
          id, num: c.num, chainId: c.id, name: c.name,
          div: c.level,
          /* A club's series is its own, not its level: two series stand at the same level. */
          ser: (serStart[c.level] == null ? c.level : serStart[c.level]) + (c.series || 0),
          c1: col.c1, c2: col.c2,
          squad: [], fans: c.fans, cap: c.capacity, price: c.ticket,
          facility: { youth: 3, train: 3 }, build: null, lastRevenue: 0,
          hist: [], title: 0, cups: 0, form: [], acad: [], style: 'bal',
          human: 0, owner: 0, rival: null, capt: 0, rev: 0,
          chainOwner: c.owner || null,
          chainCoach: c.coach || null,
          chainJob: c.job || null,
          chainOffer: c.offerTo || null,
        };
        for (const p of c.squad) {
          G.players[p.num] = {
            id: p.num, n: p.name, pos: p.pos, age: p.age, ovr: p.ovr, pot: p.pot,
            wage: p.wage, ct: Math.max(1, Math.round((p.contractWeeks || 68) / 34)), club: id,
            mood: p.mood, tp: p.temper, cond: p.cond, yrs: 0, inj: 0, sus: 0, yc: 0,
            g: p.goals, ap: p.apps, gt: p.goals, apt: p.apps, ask: 1, listed: 0,
          };
          club.squad.push(p.num);
        }
        G.clubs[id] = club;
        SF.Bank.open(G, id, c.balance, false);
      }
      G.clubIds = Object.keys(G.clubs);
      G.nextPid = 1000000; // scenery players are numbered where no club's men can reach

      /* The scenery. Nobody owns a free agent or a foreign club, so nothing about them has to be
       * agreed on - only arrived at the same way, which a shared number does. */
      G.rs = seed;
      let idx = 900000;
      for (let i = 0; i < CFG.EU_FOREIGN; i++) G.euIds.push(SF.World.makeForeign(G, idx++, i % CFG.euNat.length).id);
      for (let i = 0; i < 40; i++) SF.World.newFreeAgent(G, 35, 62);

      /* Whoever runs a club here is a coach of it, because every rule the game applies is applied
       * by somebody. A club nobody has taken is run by nobody and plays as the game's own clubs do. */
      let n = 0;
      for (const id of G.clubIds) {
        const club = G.clubs[id];
        /* Whoever picks the team here is its coach, owner or not. A club somebody else was hired
         * to run is run by them: the owner keeps the money side and the hired man keeps the team
         * sheet, which is the whole distinction a job makes. */
        if (!club.chainOwner && !club.chainCoach) continue;

        /* Two seats where two people are involved.
         *
         * A club whose owner also picks the team holds one person, and the game calls that doing
         * both jobs. A club whose owner hired somebody holds two, and they are not
         * interchangeable: the owner keeps the money and the approvals, the hired man keeps the
         * team sheet. One seat between them meant an owner's decisions arrived as his employee's,
         * which made approving a request something the asker did to himself. */
        const hired = !!(club.chainOwner && club.chainCoach && club.chainCoach !== club.chainOwner);
        if (hired) {
          n += 1;
          const boss = SF.Game.makeCoach(club.chainOwner.slice(0, 6), n);
          boss.club = id; boss.role = 'owner'; boss.rep = 50; boss.addr = club.chainOwner;
          G.coaches.push(boss);
          SF.Owner.openWallet(G, n);
          club.owner = n;
        }
        n += 1;
        club.human = n;
        if (!hired) club.owner = n;
        /* Run as a manager rather than as an investor, for now.
         *
         * The game knows two pockets: what a club has in the bank, and what its owner has of his
         * own to put into it. The second is held in SFOOT, which does not exist on the chain yet,
         * so an owner here would be asked to pay for a stand out of a pocket nobody has. Until
         * the token is real, a club pays for its own ground out of its own takings - which is
         * also the honest answer to "whose money is this?" while there is no token to hold. */
        const runs = club.chainCoach || club.chainOwner;
        const coach = SF.Game.makeCoach(runs.slice(0, 6), n);
        coach.club = id; coach.role = hired ? 'coach' : 'both'; coach.rep = 50; coach.addr = runs;
        if (club.chainJob) coach.contract = {
          club: id, years: Math.round(club.chainJob.weeks / 34), left: club.chainJob.weeks,
          wage: club.chainJob.wage, win: club.chainJob.win, draw: 0,
          bonus: { title: 0, promo: 0, euro: 0 }, share: 0, exit: null, brk: null, cap: false,
          mitigate: true, late: 0,
        };
        G.coaches.push(coach);
        SF.Owner.openWallet(G, n);
      }
      if (!G.coaches.length) {
        // somebody watching owns nothing; the game still needs a seat for whose view it draws
        const seat = SF.Game.makeCoach('watcher', 1);
        seat.role = 'both'; seat.addr = null;
        G.coaches.push(seat);
      }

      SF.Game.startSeason(G);
      SF.Owner.initNpcCoaches(G);
      SF.Owner.seasonStart(G);
      if (SF.Boss) SF.Boss.seasonStart(G);
      SF.Body.seasonReset(G);
      return G;
    },

    /* Whose decision this is.
     *
     * A club can hold two people, and which of them decided matters: an owner approving his
     * coach's request and the coach approving it himself are not the same act. So the person is
     * found by the address that signed, and only falls back to whoever runs the club when the
     * signer is not seated there - which is how a decision made before somebody was hired still
     * lands on the right seat. */
    coachOf(G, clubNum, who) {
      const id = 'c' + clubNum;
      const here = G.coaches.filter((c) => c.club === id);
      if (who) { const his = here.find((c) => c.addr === who); if (his) return his; }
      return here[0] || null;
    },
  });
})();
