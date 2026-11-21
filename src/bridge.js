/* The chain's league, ready for the screens (SF.Bridge).
 *
 * There is almost nothing left here, and that is the point. Working the season out used to produce
 * something of its own shape that then had to be translated; it now produces the game itself,
 * because it is the game that works it out. All that remains is to say whose view is being drawn -
 * which clubs are this person's - so that the pages asking "mine?" have an answer.
 */
(function () {
  const SF = globalThis.SF;

  const Bridge = (SF.Bridge = {
    /** the chain's league as a game, with this person's clubs marked as his */
    toGame(world, me, decisions) {
      const G = SF.Replay.run(world, decisions || []);
      G.me = null;
      for (const id of G.clubIds) {
        const club = G.clubs[id];
        club.mine = !!(me && club.chainOwner && club.chainOwner === me);
        if (club.mine && !G.me) G.me = id;
      }
      /* Whoever is looking sits in the seat of his own club. A person who owns nothing here is a
       * spectator: he keeps a seat, because every screen asks whose view it draws, but it has no
       * club in it and the pages that show "my club" show none rather than somebody else's. */
      const mine = G.coaches.findIndex((c) => c.club && G.clubs[c.club] && G.clubs[c.club].mine);
      G.viewer = mine >= 0 ? mine : 0;
      if (mine < 0) for (const c of G.coaches) if (!G.clubs[c.club] || !G.clubs[c.club].mine) c.club = c.club;
      return G;
    },

    /** is the game on the screen the chain's, or this browser's own? */
    isOnline: (G) => !!(G && G.online),
  });
})();
