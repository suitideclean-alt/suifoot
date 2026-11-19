/* SuiFoot identity (SF.Id): who owns a club, in a form the chain understands.
 *
 * Inside the game a person is a small number (co.id) and a club points at it (club.owner). That number
 * means nothing outside this save. On chain the owner is an address, and the club object belongs to it.
 * This keeps the two side by side: the number stays, because every line of the game uses it, and the
 * address is what the contract will read.
 *
 * A Sui address is 32 bytes written as 0x and 64 hex digits. Shorter forms are common in the wild and
 * are padded on the left with zeros, which is what Sui itself does, so 0x2 and 0x0...02 are one address.
 */
(function () {
  const SF = globalThis.SF;
  const HEX = /^[0-9a-f]+$/;

  const Id = (SF.Id = {
    LEN: 64,
    /** the address as everyone has to write it: lower case, 0x, padded to 32 bytes. null if it is not one */
    norm(addr) {
      if (typeof addr !== 'string') return null;
      let s = addr.trim().toLowerCase();
      if (s.slice(0, 2) !== '0x') return null;
      s = s.slice(2);
      if (!s.length || s.length > Id.LEN || !HEX.test(s)) return null;
      return '0x' + s.padStart(Id.LEN, '0');
    },
    valid: (addr) => Id.norm(addr) !== null,
    /** short form for the screen, never for storing or comparing */
    short: (addr) => { const a = Id.norm(addr); return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; },
    same: (a, b) => { const x = Id.norm(a), y = Id.norm(b); return !!x && x === y; },

    /** the person behind an address in this game */
    byAddr(G, addr) {
      const a = Id.norm(addr);
      return a ? G.coaches.find((c) => c.addr === a) || null : null;
    },
    /** the address a club belongs to, or null while it is nobody's */
    ownerOf(G, club) {
      if (!club || !club.owner) return null;
      const co = G.coaches.find((c) => c.id === club.owner);
      return co && co.addr ? co.addr : null;
    },
    /** every club this address holds */
    clubsOf(G, addr) {
      const co = Id.byAddr(G, addr);
      return co ? G.clubIds.filter((id) => G.clubs[id].owner === co.id || G.clubs[id].human === co.id) : [];
    },

    /** tie a person in this game to an address. One address, one person: that is how a club stays one person's. */
    bind(G, co, addr) {
      const a = Id.norm(addr);
      if (!a) return { ok: false, err: 'bad_address' };
      if (!co) return { ok: false, err: 'bad' };
      if (co.addr === a) return { ok: true, addr: a, already: true };
      const outro = Id.byAddr(G, a);
      if (outro && outro.id !== co.id) return { ok: false, err: 'address_taken' };
      if (co.addr) return { ok: false, err: 'already_bound', addr: co.addr }; // an owner does not swap identity mid-game
      co.addr = a;
      return { ok: true, addr: a };
    },
    /** let go of an address, which is what selling the club does */
    unbind(G, co) {
      if (!co || !co.addr) return { ok: false, err: 'bad' };
      const was = co.addr;
      delete co.addr;
      return { ok: true, was };
    },
    /** hand a club to another address: what a sale looks like on chain */
    transfer(G, club, addr) {
      const a = Id.norm(addr);
      if (!a) return { ok: false, err: 'bad_address' };
      if (!club) return { ok: false, err: 'bad' };
      const para = Id.byAddr(G, a);
      if (!para) return { ok: false, err: 'unknown_address' };
      if (Id.clubsOf(G, a).length) return { ok: false, err: 'one_club_only' };
      const antigo = G.coaches.find((c) => c.id === club.owner) || null;
      // the club leaves the old owner entirely: if he was also the one running it, the new owner takes
      // that over too, but a hired coach stays where he is - he works for whoever owns the club
      if (antigo && club.human === antigo.id) club.human = para.id;
      if (antigo && antigo.club === club.id) antigo.club = null;
      club.owner = para.id;
      para.club = club.id;
      return { ok: true, to: a, from: antigo ? antigo.addr || null : null };
    },
  });
})();
