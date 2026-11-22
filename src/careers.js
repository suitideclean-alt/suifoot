/* What somebody has done with their career (SF.Careers).
 *
 * A league of people needs a way for people to be known. Owning a club is one, and it is the
 * loud one: it shows in the table and on the deed. But most of the work in football is done by
 * somebody who owns nothing, and a person who has taken three bad clubs and left each of them
 * better has something to show that no balance sheet records.
 *
 * So the record is kept for everybody who has ever held a job, including - especially - whoever
 * is running a club nobody owns. That is the whole reason it exists: it is how somebody with
 * nothing but their work to show demonstrates what they are worth, and how an owner looking to
 * hire can tell one stranger from another.
 *
 * Nothing here is stored. The jobs come from the chain's own record of them, and what happened in
 * each is worked out from the seasons, so every reader arrives at the same careers.
 */
(function () {
  const SF = globalThis.SF;

  const OFFERED = 1, ACCEPTED = 2, RESIGNED = 3, DISMISSED = 4, TAKEN = 5;

  const Careers = (SF.Careers = {
    kinds: { OFFERED, ACCEPTED, RESIGNED, DISMISSED, TAKEN },

    /* Everybody who has held a job, with what they are doing now and what they did before.
     *
     * `G` is the league as it stands, so that a job still running can be told what it has won.
     */
    build(events, G) {
      const by = new Map();
      const who = (addr) => {
        if (!by.has(addr)) by.set(addr, { addr, jobs: [], now: null, seasons: 0, wage: 0 });
        return by.get(addr);
      };

      const log = (events || []).slice().sort((a, b) =>
        a.season - b.season || a.week - b.week || a.at - b.at || a.num - b.num || a.kind - b.kind);

      for (const e of log) {
        if (e.kind === OFFERED) continue; // an offer nobody took is not a job
        const p = who(e.who);
        if (e.kind === ACCEPTED || e.kind === TAKEN) {
          p.now = { club: e.num, from: { season: e.season, week: e.week }, wage: e.wage, weeks: e.weeks, win: e.win, agreed: e.kind === ACCEPTED };
          p.jobs.push(p.now);
        } else if (p.now) {
          p.now.to = { season: e.season, week: e.week };
          p.now.ended = e.kind === RESIGNED ? 'resigned' : 'dismissed';
          p.now = null;
        }
      }

      /* What each job has actually been worth. A wage nobody agreed - the job at a club nobody
       * owns - is whatever the rules say such a club pays such a person, worked out here so that
       * it is the same figure on every screen. */
      for (const p of by.values()) {
        for (const j of p.jobs) {
          const club = G && G.clubs['c' + j.club];
          j.clubName = club ? club.name : 'club ' + j.club;
          if (!j.agreed && club) j.wage = Careers.worth(G, club, p);
          if (club && !j.to) {
            const t = G.table[club.id];
            j.record = t ? { p: t.p, w: t.w, d: t.d, l: t.l, pts: t.pts } : null;
          }
        }
        p.wage = p.now ? p.now.wage : 0;
        p.seasons = p.jobs.length;
        p.rep = Careers.standing(p, G);
      }
      return Array.from(by.values());
    },

    /* What a club of this standing pays somebody of this record.
     *
     * The game's own figure, so that a job taken at a club nobody owns pays what it would have
     * paid anybody - not what the taker felt like writing down. */
    worth(G, club, person) {
      const rep = Math.max(8, Math.min(95, 20 + (person.jobs.length * 6)));
      return SF.Owner && SF.Owner.salaryFor ? SF.Owner.salaryFor(club, rep) : 0;
    },

    /* Where somebody stands, from what they have done rather than what they say.
     *
     * Points won per matchday is the spine of it, because it is the one thing that means the same
     * at the top of the pyramid and the bottom. Taking on more jobs counts for a little, and being
     * let go counts against - but lightly, because being sacked by a bad club is not a verdict on
     * the coach, and a record that punished it too hard would teach people never to take a hard
     * job, which is the opposite of what this is for.
     */
    standing(p, G) {
      let played = 0, points = 0;
      for (const j of p.jobs) if (j.record) { played += j.record.p; points += j.record.pts; }
      const perGame = played ? points / played : 0;
      const sacked = p.jobs.filter((j) => j.ended === 'dismissed').length;
      return Math.round((perGame * 100) + (p.jobs.length * 4) - (sacked * 6));
    },

    /** who is in work, best first */
    employed(all) {
      return all.filter((p) => p.now).sort((a, b) => b.rep - a.rep || b.wage - a.wage);
    },

    /** who is not, and would be, best first */
    looking(all) {
      return all.filter((p) => !p.now && p.jobs.length).sort((a, b) => b.rep - a.rep || b.seasons - a.seasons);
    },
  });
})();
