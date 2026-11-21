/* SuiFoot on chain (SF.Chain): the browser reading a world it did not make.
 *
 * Until now the game has been one browser holding one world in its own memory. This is the other
 * half: a league that lives in a contract, which this reads and draws. Nothing here decides
 * anything - no rating, no result, no balance comes from this file. It asks, and it shows.
 *
 * There is no library and no build step, because the game is a folder of files served as they are.
 *
 * It speaks GraphQL. Sui retired JSON-RPC on public full nodes, and what replaced it on the node
 * itself is gRPC: a compression byte, a four-byte length and a protobuf message, which a browser
 * cannot produce without a library. GraphQL is the other replacement, it is JSON in both directions,
 * and the public testnet service sends access-control-allow-origin: * - so a page may simply ask.
 *
 * One request fetches the lot. Several objects are asked for in a single query under names of our
 * own choosing, rather than one round trip each.
 *
 * Reading needs no wallet and no permission: a published object is public. Writing - sealing a
 * lineup, taking a club - needs a signature, and that is a separate thing again.
 */
(function () {
  const SF = (globalThis.SF = globalThis.SF || {});

  /* A league standing on the Sui testnet. The key that published it was made inside a workflow run
   * and thrown away with it; the package and the objects outlive it, because that is how a chain
   * works. Nobody can upgrade this one, which is right for a rehearsal. */
  const TESTNET = {
    graphql: 'https://graphql.testnet.sui.io/graphql',
    explorer: 'https://suiscan.xyz/testnet/object/',
    pkg: '0x2fa5f01cb9d73192ba7338d8a9a986df64995b899123000c3d17e8ece528a2a6',
    league: '0xb882dd5f3819e8d4aa69b249cb6f17005ccd7a59e86596acd53d230fad69bf98',
    clubs: [
      '0xf018fa353ba993ba938f7a2d94fc4da641332cf7b50cad2b83e109b34533e21c',
      '0x8dda0f412dd1a9317d108d44c1aa8fd725bd620d939d7745ef90c99756f4e03a',
      '0xe5a6e8739df0f90aeae5088553ebcd7eebec3ae60494b9a15631f34dab330333',
      '0xb8ef090a043fde5822303d2876b4dd53c2be8aa856c739069e559be8237bd1dd',
      '0x32ffb480988a90a4de7ac1c352db350878c2c93c714a0b138d31d2935db3750b',
      '0xf1a9472dae0584db72b8180185b0d22f19b85d6ab7cc1c0740cb259d0f1a6daa',
    ],
  };

  // ---------- names ----------
  // The contract stores no player names: two thousand strings on chain to say what a number already
  // says. A name is worked out from the number instead, here and in any other client, the same way
  // every time. Multiplying by a number sharing no factor with the count of names shuffles them
  // without ever landing twice on the same one.
  const FIRST = ['Adrian', 'Aleksi', 'Anton', 'Arlo', 'Bastian', 'Bruno', 'Caio', 'Callum', 'Dario', 'Davi', 'Dmitri', 'Elias', 'Emil', 'Enzo', 'Felix', 'Finn', 'Gabin', 'Hugo', 'Ibrahim', 'Ivo', 'Jonas', 'Joris', 'Kai', 'Kasper', 'Leon', 'Lucas', 'Luka', 'Mateo', 'Milo', 'Nico', 'Noel', 'Oscar', 'Otto', 'Pablo', 'Pedro', 'Rafael', 'Remy', 'Rui', 'Samir', 'Sven', 'Tiago', 'Theo', 'Viktor', 'Willem', 'Yann', 'Yusuf', 'Zane', 'Ruben', 'Tomas', 'Marek'];
  const S1 = ['Ba', 'Be', 'Bo', 'Ca', 'Ce', 'Da', 'De', 'Do', 'Fa', 'Ga', 'Ge', 'Ha', 'Ka', 'Ke', 'La', 'Le', 'Lo', 'Ma', 'Me', 'Mo', 'Na', 'Ne', 'No', 'Pa', 'Pe', 'Ra', 'Re', 'Ro', 'Sa', 'Se', 'So', 'Ta', 'Te', 'To', 'Va', 'Ve', 'Vo', 'Za', 'Ze', 'Bi', 'Ki', 'Mi', 'Ni'];
  const S2 = ['bor', 'dan', 'gar', 'lin', 'mar', 'nor', 'pen', 'ran', 'sil', 'tan', 'ver', 'wen', 'zor', 'cal', 'dor', 'fen', 'har', 'kel', 'lan', 'mon', 'pol', 'rin', 'sen', 'tol', 'vik', 'berg', 'lund', 'ström'];
  const S3 = ['', '', '', 'o', 'a', 'ez', 'ski', 'ens', 'ini', 'er', 'ton', 'ov', 'es', 'i'];
  const SPAN = FIRST.length * S1.length * S2.length * S3.length;
  const STEP = 104729; // prime, and shares no factor with the span

  const PRE = ['Aster', 'Bryn', 'Cald', 'Dun', 'Elm', 'Fen', 'Glen', 'Hal', 'Iron', 'Kes', 'Lark', 'Mar', 'Nor', 'Oak', 'Pen', 'Quil', 'Ros', 'Sel', 'Thorn', 'Ulm', 'Vale', 'Wyn', 'Yar', 'Zan'];
  const SUF = ['ford', 'mouth', 'ton', 'haven', 'wick', 'dale', 'bridge', 'port', 'field', 'stead', 'holm', 'crest'];
  const KIND = ['FC', 'United', 'Athletic', 'Rovers', 'Wanderers', 'Town', 'Sporting', 'Union', 'Racing', 'Rangers'];

  const POS = ['GK', 'DF', 'MF', 'FW'];
  const TEMPER = ['gent', 'pro', 'hard'];

  /** a Move Option arrives either as the value, as null, or wrapped in a vector of none or one */
  const optional = (v) => {
    if (v == null) return null;
    if (Array.isArray(v)) return v.length ? v[0] : null;
    if (typeof v === 'object') { const inner = v.vec || v.value; return Array.isArray(inner) ? (inner.length ? inner[0] : null) : (inner == null ? null : inner); }
    return v;
  };

  const Chain = (SF.Chain = {
    net: TESTNET,

    /** the name the number stands for, the same in any client that asks */
    playerName(num) {
      const m = (Number(num) * STEP) % SPAN;
      let v = m;
      const first = FIRST[v % FIRST.length]; v = Math.floor(v / FIRST.length);
      const a = S1[v % S1.length]; v = Math.floor(v / S1.length);
      const b = S2[v % S2.length]; v = Math.floor(v / S2.length);
      const c = S3[v % S3.length];
      return first + ' ' + a + b + c;
    },

    /** and the club's, worked out the way the contract works it out */
    clubName(num) {
      const n = Number(num);
      const block = Math.floor(n / 2880);
      const m = ((n % 2880) * 1123) % 2880;
      const s = PRE[m % 24] + SUF[Math.floor(m / 24) % 12] + ' ' + KIND[Math.floor(m / 288)];
      return block > 0 ? s + ' ' + (block + 1) : s;
    },

    // ---------- talking to the chain ----------

    async query(gql) {
      const res = await fetch(Chain.net.graphql, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: gql }),
      });
      if (!res.ok) throw new Error('the node answered ' + res.status);
      const body = await res.json();
      if (body.errors && body.errors.length) throw new Error(body.errors[0].message || 'the node refused the question');
      return body.data;
    },

    /* What an object is, as a Move struct turned into plain JSON. Whole numbers wider than a browser
     * can hold come back as text, which is why everything below goes through Number() rather than
     * being trusted as it arrives. */
    fieldsOf(node) {
      if (!node || !node.asMoveObject || !node.asMoveObject.contents) return null;
      return node.asMoveObject.contents.json;
    },

    /** the fields of one object */
    async object(id) {
      const d = await Chain.query(`{ it: object(address: "${id}") { asMoveObject { contents { json } } } }`);
      const f = Chain.fieldsOf(d && d.it);
      if (!f) throw new Error('no such object: ' + id);
      return f;
    },

    /** several at once, under names of our own, so it is one question and not eighteen */
    async objects(ids) {
      const parts = ids.map((id, i) => `o${i}: object(address: "${id}") { asMoveObject { contents { json } } }`);
      const d = await Chain.query('{ ' + parts.join(' ') + ' }');
      return ids.map((_, i) => Chain.fieldsOf(d && d['o' + i]));
    },

    // ---------- what the fields mean ----------

    league(f) {
      return {
        season: Number(f.season), week: Number(f.week),
        t0: Number(f.t0),
        kickoffs: (f.kickoffs || []).map(Number),
        lockBefore: Number(f.lock_before), drawBefore: Number(f.draw_before),
        weeks: Number(f.weeks_in_season),
        bottom: Number(f.bottom_level),
        free: (f.free_at_foot || []).length,
      };
    },

    club(f, id) {
      const squad = (f.squad || []).map((s) => {
        const p = s.fields || s;
        return {
          num: Number(p.num), name: Chain.playerName(p.num),
          pos: POS[Number(p.pos)] || 'MF', temper: TEMPER[Number(p.temper)] || 'pro',
          age: Number(p.age), ovr: Number(p.ovr), pot: Number(p.pot),
          cond: Number(p.cond), mood: Number(p.mood),
          wage: Number(p.wage), goals: Number(p.goals), apps: Number(p.apps),
        };
      });
      return {
        id, num: Number(f.num), name: f.name,
        level: Number(f.level), series: Number(f.series),
        balance: Number(f.balance),
        fans: Number(f.fans), capacity: Number(f.capacity), ticket: Number(f.ticket_cents) / 100,
        owner: optional(f.owner),
        played: Number(f.played), won: Number(f.won), drawn: Number(f.drawn), lost: Number(f.lost),
        gf: Number(f.goals_for), ga: Number(f.goals_against), points: Number(f.points),
        lastPos: Number(f.last_pos),
        squad,
      };
    },

    /** everything the panel needs, in two questions */
    async world() {
      const [lf, cfs] = await Promise.all([
        Chain.object(Chain.net.league),
        Chain.objects(Chain.net.clubs),
      ]);
      const clubs = cfs.map((f, i) => (f ? Chain.club(f, Chain.net.clubs[i]) : null)).filter(Boolean);
      return { league: Chain.league(lf), clubs };
    },

    /** the table, sorted the way the contract sorts it */
    table(clubs) {
      return clubs.slice().sort((a, b) =>
        b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.num - b.num);
    },

    /** when the whistle goes for a matchday, worked out as the contract works it out */
    kickoff(lg, week) {
      const slots = lg.kickoffs.length ? lg.kickoffs : [1200];
      const day = Math.floor((week - 1) / slots.length);
      return lg.t0 + day * 86400000 + slots[(week - 1) % slots.length] * 60000;
    },
    /** where a matchday stands right now */
    phase(lg, week, now) {
      const k = Chain.kickoff(lg, week);
      if (now >= k) return 'played';
      if (now >= k - lg.drawBefore * 60000) return 'drawn';
      if (now >= k - lg.lockBefore * 60000) return 'locked';
      return 'open';
    },
  });
})();
