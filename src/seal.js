/* SuiFoot sealed lineups (SF.Seal): commit first, reveal after.
 *
 * On a public chain everything written is read by everyone, so a lineup sent before kickoff would be
 * read by the other manager, who would then pick his own against it. The way round that is old and
 * simple: before the deadline you publish only a seal, which is the hash of your lineup and a secret
 * number of your own. After the deadline you publish the lineup and the number, and anyone can check
 * they make that seal. You cannot change your mind afterwards, and nobody could see it before.
 *
 * Whoever reveals nothing plays his last lineup, as he would if he never opened the game that day.
 */
(function () {
  const SF = globalThis.SF;
  const key = (week, clubId) => week + ':' + clubId;

  const Seal = (SF.Seal = {
    /** the seal of a lineup: its canonical form and your secret number, hashed together */
    make(lineup, salt) {
      const l = {
        xi: (lineup && lineup.xi ? lineup.xi : []).map(Number),
        bench: (lineup && lineup.bench ? lineup.bench : []).map(Number),
        form: (lineup && lineup.form) || '4-4-2',
        tactic: (lineup && lineup.tactic) || 'bal',
      };
      return SF.Hash.sha256(SF.Hash.canon(l) + '|' + String(salt));
    },

    all: (G) => (G.seals = G.seals || {}),
    at: (G, week, clubId) => Seal.all(G)[key(week, clubId)] || null,

    /** before the deadline: publish the seal and nothing else */
    commit(G, clubId, week, seal, nowMs) {
      const w = SF.util.int(week, 1, 4096);
      if (w === null || !G.clubs[clubId]) return { ok: false, err: 'bad' };
      if (typeof seal !== 'string' || !/^[0-9a-f]{64}$/.test(seal)) return { ok: false, err: 'bad_seal' };
      if (SF.Cal.dated(G) && SF.Cal.phaseAt(G, w, nowMs) !== 'open') return { ok: false, err: 'too_late' };
      Seal.all(G)[key(w, clubId)] = { seal, s: G.season };
      return { ok: true };
    },

    /** after the deadline: show the lineup and the number, and let anyone check them against the seal */
    reveal(G, clubId, week, lineup, salt, nowMs) {
      const w = SF.util.int(week, 1, 4096);
      const club = G.clubs[clubId];
      if (w === null || !club) return { ok: false, err: 'bad' };
      const rec = Seal.at(G, w, clubId);
      if (!rec) return { ok: false, err: 'no_seal' };
      if (rec.lineup) return { ok: false, err: 'already' };
      if (SF.Cal.dated(G)) {
        const ph = SF.Cal.phaseAt(G, w, nowMs);
        if (ph === 'open') return { ok: false, err: 'too_early' }; // the deadline has not passed
        if (ph === 'played') return { ok: false, err: 'too_late' };
      }
      if (Seal.make(lineup, salt) !== rec.seal) return { ok: false, err: 'does_not_match' };
      const limpo = Seal.clean(G, clubId, lineup);
      if (!limpo) return { ok: false, err: 'bad_lineup' };
      rec.lineup = limpo;
      rec.salt = String(salt);
      return { ok: true, lineup: limpo };
    },

    /** a revealed lineup is still only a request: the players have to be his, fit and not doubled up */
    clean(G, clubId, lineup) {
      if (!lineup) return null;
      const okPlayer = (id) => { const p = G.players[id]; return p && p.club === clubId && p.inj <= 0 && p.sus <= 0; };
      const xi = [...new Set((lineup.xi || []).map(Number).filter(okPlayer))].slice(0, 11);
      const bench = [...new Set((lineup.bench || []).map(Number).filter(okPlayer))].filter((id) => !xi.includes(id)).slice(0, 7);
      if (!xi.length) return null;
      return { xi, bench, form: lineup.form || '4-4-2', tactic: lineup.tactic || 'bal' };
    },

    /** what the engine should field: the revealed lineup, or nothing, which means the usual one */
    lineupFor(G, clubId, week) {
      const rec = Seal.at(G, week, clubId);
      return rec && rec.lineup ? rec.lineup : null;
    },
    /** where a club stands for a matchday */
    state(G, clubId, week) {
      const rec = Seal.at(G, week, clubId);
      if (!rec) return 'none';
      return rec.lineup ? 'revealed' : 'sealed';
    },
    /** clear out the matchdays already played, so the save does not grow for ever */
    sweep(G, beforeWeek) {
      const all = Seal.all(G);
      for (const k of Object.keys(all)) if (Number(k.split(':')[0]) < beforeWeek) delete all[k];
    },
  });
})();
