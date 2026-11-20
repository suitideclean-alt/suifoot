/* SuiFoot club market (SF.Market): how a person gets into the league, and how the league makes room.
 *
 * Two ways in, with different rules on purpose.
 *
 * Joining is free and random: you are given a club at the foot of the pyramid, chosen for you. Random
 * matters - if people could pick, they would sit there rerolling until the best one came up.
 *
 * Buying is paid and narrow: only a club nobody runs, only in the bottom half of its table, and never
 * in the top level. The top level has eighteen places for the whole world and they are climbed to, not
 * bought. Below that, money buys you a head start on a bad club, which is a fair thing to sell.
 *
 * A club taken mid-season pays no entry fee until the next full season, and so draws nothing from the
 * prize pool that season either: you did not pay in, you do not take out.
 */
(function () {
  const SF = globalThis.SF;
  const { CFG, util } = SF;

  const Market = (SF.Market = {
    /** nobody owns it and nobody coaches it */
    isFree: (G, club) => !!club && !club.human && !club.owner,
    freeClubs: (G) => G.clubIds.filter((id) => Market.isFree(G, G.clubs[id])),

    /** the bottom level of whatever shape the league has */
    bottomLevel: () => (CFG.series && CFG.series.length ? CFG.series.length : CFG.DIVS) - 1,

    /* Where a club stands, for the bottom-half rule. Early in a season every table is level, so the
     * position means nothing: until enough has been played we go by where the club finished last time. */
    rank(G, club) {
      const played = (G.table && G.table[club.id] && G.table[club.id].p) || 0;
      if (played >= CFG.rankAfter) return SF.Game.standings(G, SF.Game.serOf(club)).indexOf(club.id) + 1;
      return club.pos || Math.ceil(CFG.PER_DIV / 2); // never finished a season: treat it as mid-table
    },
    inBottomHalf: (G, club) => Market.rank(G, club) > CFG.PER_DIV / 2,

    /** the clubs a newcomer can be given: free, at the foot of the pyramid */
    joinable(G) {
      const fundo = Market.bottomLevel();
      return Market.freeClubs(G).filter((id) => G.clubs[id].div === fundo);
    },
    /** the clubs that can be bought: free, outside the top level, in the bottom half of their table */
    buyable(G) {
      return Market.freeClubs(G).filter((id) => {
        const c = G.clubs[id];
        return c.div > 0 && Market.inBottomHalf(G, c);
      });
    },

    /** take a club for a person: the game's own doing, not a choice */
    give(G, co, clubId) {
      const club = G.clubs[clubId];
      if (!club) return { ok: false, err: 'bad' };
      if (!Market.isFree(G, club)) return { ok: false, err: 'taken' };
      if (co.club) return { ok: false, err: 'already_has_club' };
      club.human = co.id;
      if (SF.Owner.role(co) !== 'coach') club.owner = co.id;
      co.club = club.id;
      co.board = 60; co.jobWeeks = 0;
      G.bank.tracked[club.id] = 1;
      SF.Owner.openWallet(G, co.id);
      // mid-season arrivals owe nothing and draw nothing until the next full season
      if (G.week > 1) club.entry = 0;
      return { ok: true, club: club.id };
    },

    /** a newcomer joins: a club at the foot, drawn for them */
    join(G, co) {
      const pool = Market.joinable(G);
      if (!pool.length) return { ok: false, err: 'league_full' };
      return Market.give(G, co, SF.R.pick(pool));
    },

    /** a buyer takes a club they chose, inside the rules */
    buy(G, co, clubId) {
      const club = G.clubs[clubId];
      if (!club) return { ok: false, err: 'bad' };
      if (!Market.isFree(G, club)) return { ok: false, err: 'taken' };
      if (club.div === 0) return { ok: false, err: 'top_not_for_sale' };
      if (!Market.inBottomHalf(G, club)) return { ok: false, err: 'too_high' };
      return Market.give(G, co, clubId);
    },

    /* The league makes room. When the foot of the pyramid has no free club left, the bottom level grows
     * and the shape widens with the number of people playing.
     *
     * It grows a whole block at a time - one new series under each series of the level above - and not
     * one at a time. The reason is fairness: how many clubs drop out of a series is one per child series
     * it has, so if one series above ended up with five children and its neighbours with four, that one
     * would relegate ten clubs a season while the others relegate eight. Growing in blocks keeps every
     * series of a level with the same number of children, so the same number go down everywhere.
     *
     * Between seasons only: a series added mid-season would have no fixtures. */
    needsRoom: (G) => Market.joinable(G).length === 0,
    grow(G) {
      const shape = (CFG.series && CFG.series.length ? CFG.series : [1, 1, 1, 1]).slice();
      const fundo = shape.length - 1;
      const bloco = fundo > 0 ? shape[fundo - 1] : 1; // one new series under each series above
      if (shape[fundo] + bloco > CFG.maxSeries) return { ok: false, err: 'too_wide' };

      // carry on from the highest club number in use, so no id is ever reused
      let idx = 0;
      for (const id in G.clubs) { const n = parseInt(String(id).slice(1), 10); if (n > idx) idx = n; }
      idx += 1;
      /* After a save and a load the used-name set is gone; rebuild it so no name comes up twice. It
       * holds what clubName checks against: the base, which is the first word, and the whole name. */
      const nomes = new Set();
      for (const id in G.clubs) { const nm = String(G.clubs[id].name); nomes.add(nm.split(' ')[0]); nomes.add(nm); }
      G._usedNames = nomes;

      const si0 = shape.reduce((a, b) => a + b, 0); // the new series come after all the ones that exist
      shape[fundo] += bloco;
      CFG.series = shape;
      for (let k = 0; k < bloco; k++) for (let i = 0; i < CFG.PER_DIV; i++) SF.World.makeClub(G, idx++, fundo, si0 + k);
      G.clubIds = Object.keys(G.clubs).filter((id) => !G.clubs[id].foreign);
      SF.Owner.initNpcCoaches(G);
      return { ok: true, series: bloco, clubs: bloco * CFG.PER_DIV };
    },
  });
})();
