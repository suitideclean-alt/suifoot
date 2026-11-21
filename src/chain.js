/* SuiFoot on chain (SF.Chain): the browser reading a world it did not make.
 *
 * Until now the game has been one browser holding one world in its own memory. This is the other
 * half: a league that lives in a contract, which this reads and draws. Nothing here decides
 * anything - no rating, no result, no balance comes from this file. It asks, and it shows.
 *
 * There is no library and no build step, because the game is a folder of files served as they are.
 *
 * THE TRANSPORT IS CURRENTLY BROKEN, AND NOT BY ANYTHING HERE. Sui has retired JSON-RPC on public
 * full nodes. Every endpoint tried - the official one, BlockVision, PublicNode, Suiscan - answers
 * the same way: "Sui JSON-RPC has been deprecated. Please migrate to gRPC." The official node does
 * serve the replacement at /sui.rpc.v2.LedgerService/, and it sends access-control-allow-origin: *
 * so a browser is welcome there, but it speaks gRPC: a compression byte, a four-byte length and a
 * protobuf message. Posting JSON at it comes back with "invalid compression flag: 123", 123 being
 * the opening brace.
 *
 * So the door is open and the language has changed. Three ways through it, none of them written yet:
 *   - decode protobuf by hand. The wire format is simple and only a few messages are needed, but it
 *     is real work and it has to be right.
 *   - find a node that still answers GraphQL over HTTPS, which is JSON both ways.
 *   - put a small service of our own in front, which is one more thing to run and to trust.
 *
 * Everything below the transport - what the fields mean, how a name follows from a number, how the
 * table sorts, when a matchday locks - is written, tested, and waiting.
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
    rpc: 'https://fullnode.testnet.sui.io:443',
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

    // ---------- talking to a full node ----------

    async rpc(method, params) {
      const res = await fetch(Chain.net.rpc, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!res.ok) throw new Error('the node answered ' + res.status);
      const body = await res.json();
      if (body.error) {
        const msg = body.error.message || 'the node refused the question';
        if (/deprecat|grpc/i.test(msg)) { const e = new Error(msg); e.deprecated = true; throw e; }
        throw new Error(msg);
      }
      return body.result;
    },

    /** the fields of one object, as the chain holds them */
    async object(id) {
      const r = await Chain.rpc('sui_getObject', [id, { showContent: true }]);
      if (!r || !r.data || !r.data.content) throw new Error('no such object: ' + id);
      return r.data.content.fields;
    },
    /** several at once, which is one question instead of eighteen */
    async objects(ids) {
      const r = await Chain.rpc('sui_multiGetObjects', [ids, { showContent: true }]);
      return r.map((x) => (x && x.data && x.data.content ? x.data.content.fields : null));
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
        owner: f.owner || null,
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
