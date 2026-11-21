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
    faucet: 'https://faucet.sui.io/?network=testnet',
    pkg: '0xa1641832ef931e86ffe27f5959d8cb07e3a9e017a10dd2ca29545fe3e9741c8c',
    league: '0xe16014f2eb33843f693f52d772edb9f3533b95bc9d987e37bee2e9d2201d767c',
    clubs: [
      '0xd312114f7d6167b6511e5c96308c7d8a6ff467d5583845e66db2541c385335e1',
      '0xf7feae8c608fbc7231a3b06af6624f9e2ec3d6b8281d8e6e983c8c6fe992be42',
      '0x314575327daabc599390c71283d57a12f41f492a756f0febc37f1a66c9fccf43',
      '0xdccfa80dedf8eb8299cbd5dc1c182e5710fffac2164d73ccf06a1c6728e3f4bc',
      '0x1c4f3a1311e8333d524c0e329bdd85469f19fd13942927098ec524cb4b866549',
      '0xeac32454f738b08f85055b74354c6f72f7ae36a9877d33aa0f62c2f1dcef1eb0',
      '0x52b4e6adc1c13a858b00e77e42caa362349fdcc3e229f6889499016db374b928',
      '0xc492353f5e4d1de133b7eb0051bd077a4dd13d3712638bdac3e19fd05312d0df',
      '0x5cd55f93dbddb15328fdc634880f03a5019373d6f19954abe31482f5ec1783b9',
      '0x5f713c92744b750767769e458c12564dcacf4dd9aaa16e6c1ef982b86492cda5',
      '0x5d2b5cf363732f39f18e91e2a38a450077293167da45c05092c102183a9921cf',
      '0x38d939c6f4330b82aa5ec3b4bbdca8f0c3379f6b90487684d78957a6cc9277ea',
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

    /* A club's colours, from its number and nothing else. Offline the second colour is drawn at
     * random when the world is made; on chain there is no such moment, so it is settled by the
     * number like the name and the badge are. */
    colours(num) {
      const n = Number(num);
      const hue = Math.round((n * 137.508) % 360);
      let h = 2166136261 >>> 0;
      const s = 'c' + n;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      return { id: 'c' + n, c1: `hsl(${hue} 62% 42%)`, c2: (h & 1) ? '#ffffff' : '#111827' };
    },

    /** the badge, drawn here rather than fetched: the same one a wallet shows for the deed */
    badge(num, size) {
      return SF.Art ? SF.Art.logo(Chain.colours(num), size || 22) : '';
    },

    /** and the man's face, from his number and his age, as everywhere else */
    face(p, size) {
      return SF.Art ? SF.Art.face({ id: p.num, age: p.age }, size || 24) : '';
    },

    /** and the club's name, worked out the way the contract works it out */
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

    /* What a transaction needs to name a shared object: not the version it is on now, but the
     * version it was on when it was first shared. That number never changes, and the chain uses it
     * to know which object is meant. */
    async sharedRefs(ids) {
      const parts = ids.map((id, i) =>
        `o${i}: object(address: "${id}") { address owner { __typename ... on Shared { initialSharedVersion } } }`);
      const d = await Chain.query('{ ' + parts.join(' ') + ' }');
      return ids.map((id, i) => {
        const o = d && d['o' + i];
        const sh = o && o.owner && o.owner.initialSharedVersion;
        if (!sh) throw new Error('that object is not shared: ' + id);
        return { objectId: id, initialSharedVersion: String(sh), mutable: true };
      });
    },

    /* What the wallet has to pay with, in MIST. A transaction that costs nothing to build still
     * costs gas to run, and an empty address is by far the commonest reason a wallet refuses: the
     * refusal arrives as its own internal error, which explains nothing. So we ask first. */
    async gas(addr) {
      const d = await Chain.query(
        `{ a: address(address: "${addr}") { balance(coinType: "0x2::sui::SUI") { totalBalance } } }`);
      const b = d && d.a && d.a.balance;
      return b ? Number(b.totalBalance) : 0;
    },

    /* The tickets this address is holding.
     *
     * Taking a club is two steps on purpose: the draw happens on chain and hands back a ticket
     * naming the club it landed on, and the ticket is turned in afterwards. Between the two the
     * club is already off the free list but still has no owner, so a person who stops there owns
     * nothing and the screen must say so rather than look finished. */
    async tickets(addr) {
      const d = await Chain.query(`{ a: address(address: "${addr}") {
        objects(filter: { type: "${Chain.net.pkg}::market::JoinTicket" }) {
          nodes { address contents { json } } } } }`);
      const nodes = (d && d.a && d.a.objects && d.a.objects.nodes) || [];
      return nodes.map((n) => {
        const f = n && n.contents ? n.contents.json : null;
        return { id: n.address, club: f && f.club ? f.club : null };
      }).filter((x) => x.club);
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
        admin: f.admin || null,
        free: (f.free_at_foot || []).length,
        size: Number(f.series_size),
        manual: !!f.manual,
        seeds: (f.seeds || []).map(Number),
        rosters: (f.rosters || []).map((r) => (r || []).map(Number)),
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

    /* Who plays whom, worked out here exactly as fixtures.move works it out: one club stands still
     * and the rest rotate past it, then the whole thing again with the grounds swapped. Nothing is
     * fetched, because nothing is stored - the matchday and the roster are the whole answer. */
    pairs(roster, week) {
      const n = roster.length;
      if (n < 2 || n % 2 !== 0) return [];
      const rounds = n - 1;
      if (week < 1 || week > rounds * 2) return [];
      const r = week - 1;
      const back = r >= rounds;
      const turn = r % rounds;

      const arranged = [roster[0]];
      for (let i = 1; i < n; i++) arranged.push(roster[1 + ((i - 1 + turn) % rounds)]);

      const out = [];
      for (let k = 0; k < n / 2; k++) {
        const a = arranged[k];
        const b = arranged[n - 1 - k];
        const flip = (k === 0 && turn % 2 === 1) !== back;
        out.push(flip ? [b, a] : [a, b]);
      }
      return out;
    },

    /** how many matchdays a series of that size takes */
    weeksFor: (n) => (n < 2 ? 0 : (n - 1) * 2),

    /** this matchday's fixtures for a series, as clubs rather than numbers */
    fixtures(world, series) {
      const roster = (world.league.rosters || [])[series] || [];
      const byNum = new Map(world.clubs.map((c) => [c.num, c]));
      return Chain.pairs(roster, world.league.week)
        .map(([h, a]) => ({ home: byNum.get(h), away: byNum.get(a) }))
        .filter((m) => m.home && m.away);
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
