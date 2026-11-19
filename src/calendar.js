/* SuiFoot calendar (SF.Cal): game weeks against real time.
 *
 * Offline a season is a list of weeks and nothing more. Online every matchday needs an hour everyone
 * agrees on: when lineups stop being accepted, when the draw is taken, when the whistle goes. That is
 * what this turns a week number into.
 *
 * It never reads the clock. The current time is always passed in, because the engine has to give the
 * same answer on every machine, and because online the time that counts is the chain's, not a browser's.
 * G.t0 is midnight UTC of the first matchday; with no G.t0 the game has no dates and every call gives null.
 */
(function () {
  const SF = globalThis.SF;
  const DAY = 86400000, MIN = 60000;

  const Cal = (SF.Cal = {
    DAY,
    /** give the season a first day: midnight UTC of the day the first matchday is played */
    start(G, utcMs) {
      const n = SF.util.num(utcMs);
      if (n === null || n < 0) return { ok: false, err: 'bad_amount' };
      G.t0 = Math.floor(n / DAY) * DAY; // snap to midnight UTC, so a season never starts mid-day
      return { ok: true, t0: G.t0 };
    },
    /** does this game run against real time at all? */
    dated: (G) => typeof G.t0 === 'number' && G.t0 > 0,

    /** the hours a matchday is played at, in order */
    slots: () => (SF.CFG.kickoffsUtc && SF.CFG.kickoffsUtc.length ? SF.CFG.kickoffsUtc : [20 * 60]),
    /** when the whistle goes for a game week (1-based), in ms UTC */
    kickoff(G, week) {
      if (!Cal.dated(G)) return null;
      const w = SF.util.int(week, 1, 4096);
      if (w === null) return null;
      const slots = Cal.slots();
      const dia = Math.floor((w - 1) / slots.length) * SF.CFG.daysPerWeek;
      return G.t0 + dia * DAY + slots[(w - 1) % slots.length] * MIN;
    },
    /** how many real days a whole season takes */
    days: (G) => (G.sched ? Math.ceil(G.sched.length / Cal.slots().length) * SF.CFG.daysPerWeek : 0),
    /** when lineups stop being accepted */
    lock: (G, week) => { const k = Cal.kickoff(G, week); return k === null ? null : k - SF.CFG.lockBefore * MIN; },
    /** when the draw for the matchday is taken: after the lineups are in, before the whistle */
    draw: (G, week) => { const k = Cal.kickoff(G, week); return k === null ? null : k - SF.CFG.drawBefore * MIN; },

    /** where a game week stands at a given moment: open, locked, drawn or played */
    phaseAt(G, week, nowMs) {
      if (!Cal.dated(G)) return 'open';
      const now = SF.util.num(nowMs);
      if (now === null) return 'open';
      if (now >= Cal.kickoff(G, week)) return 'played';
      if (now >= Cal.draw(G, week)) return 'drawn';
      if (now >= Cal.lock(G, week)) return 'locked';
      return 'open';
    },
    /** the game week that should be resolved at this moment, or 0 if the season has not caught up */
    dueWeek(G, nowMs) {
      if (!Cal.dated(G) || !G.sched) return 0;
      const now = SF.util.num(nowMs);
      if (now === null) return 0;
      for (let w = G.week; w <= G.sched.length; w++) if (now < Cal.kickoff(G, w)) return w - 1 >= G.week ? w - 1 : 0;
      return G.sched.length;
    },
    /** is it time to play the week the season is on? */
    ready: (G, nowMs) => Cal.dated(G) && !!G.sched && G.week <= G.sched.length && SF.util.num(nowMs) !== null && SF.util.num(nowMs) >= Cal.kickoff(G, G.week),

    /** the last matchday of the season, and the first of the next one after the break */
    seasonEnd: (G) => (G.sched ? Cal.kickoff(G, G.sched.length) : null),
    nextSeasonStart(G) {
      if (!Cal.dated(G) || !G.sched) return null;
      return G.t0 + (Cal.days(G) + SF.CFG.breakDays) * DAY;
    },

    /** plain ISO text for a moment, to show and to put in a contract */
    text(ms) {
      if (ms === null || ms === undefined) return '';
      return new Date(ms).toISOString().replace('.000Z', 'Z');
    },
    /** the whole season as a list, for the interface and for a keeper to work from */
    table(G) {
      if (!Cal.dated(G) || !G.sched) return [];
      return G.sched.map((s, i) => ({
        week: i + 1, kind: s.t, md: s.md || 0,
        lock: Cal.lock(G, i + 1), draw: Cal.draw(G, i + 1), kickoff: Cal.kickoff(G, i + 1),
      }));
    },
  });
})();
